import { HttpError, json, rateLimit, readBody } from "../http.ts";
import type { MailAccount } from "./accounts.ts";
import type { MailEnv } from "./store.ts";

/**
 * Notifications about new mail, through each browser's own push service (Web Push). Nothing
 * else is involved: the Worker encrypts every notification for the device (RFC 8291) and signs
 * the request with the site's key (VAPID, RFC 8292), so only that device can read it.
 */

export interface PushEnv {
  /** The site's public push key, base64url. Browsers need it to subscribe. */
  VAPID_PUBLIC_KEY?: string;
  /** The matching private key (the P-256 "d" value, base64url). Unset means push is off. */
  VAPID_PRIVATE_KEY?: string;
  /** mail-test mode only: the local push service in scripts/mail-catcher.mjs. */
  PUSH_TEST_ENDPOINT?: string;
}

export interface PushMessage {
  title: string;
  body: string;
  /** Opened when the notification is tapped, relative to the mail app, e.g. "#inbox/<id>". */
  url: string;
  /** A notification with the same tag replaces the last one. */
  tag: string;
  /** Unread emails in the inbox, for the app icon's badge. */
  unread?: number;
}

const MAX_DEVICES = 20;
const TTL_SECONDS = 24 * 60 * 60;
// Every browser's push service. Anything else is refused, so the Worker can't be pointed at other sites.
const PUSH_HOSTS = [".googleapis.com", ".mozilla.com", ".notify.windows.com", ".push.apple.com"];

const encoder = new TextEncoder();

export function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function hkdf(salt: Uint8Array, secret: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}

export const pushEnabled = (env: PushEnv) => !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

function allowedEndpoint(env: PushEnv, endpoint: string): boolean {
  if (env.PUSH_TEST_ENDPOINT && endpoint.startsWith(env.PUSH_TEST_ENDPOINT)) return true;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  return url.protocol === "https:" && !url.port && PUSH_HOSTS.some((suffix) => `.${url.hostname}`.endsWith(suffix));
}

/** The payload encrypted for one device, as an aes128gcm body (RFC 8188, one record). */
async function encrypt(payload: Uint8Array, p256dh: string, auth: string): Promise<Uint8Array> {
  const devicePublic = fromBase64url(p256dh);
  const deviceKey = await crypto.subtle.importKey("raw", devicePublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ours = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const ourPublic = new Uint8Array((await crypto.subtle.exportKey("raw", ours.publicKey)) as ArrayBuffer);
  // Workers' types spell the ECDH "public" member as $public.
  const ecdh = { name: "ECDH", public: deviceKey, $public: deviceKey } as unknown as SubtleCryptoDeriveKeyAlgorithm;
  const shared = new Uint8Array(await crypto.subtle.deriveBits(ecdh, ours.privateKey, 256));

  const ikm = await hkdf(fromBase64url(auth), shared, concat(encoder.encode("WebPush: info\0"), devicePublic, ourPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // 0x02 marks the last (and only) record.
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(payload, new Uint8Array([2]))));

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096);
  return concat(salt, recordSize, new Uint8Array([ourPublic.length]), ourPublic, sealed);
}

/** The Authorization header proving the push comes from this site (VAPID). */
async function vapid(env: PushEnv, endpoint: string, subject: string): Promise<string> {
  const publicKey = fromBase64url(env.VAPID_PUBLIC_KEY!);
  const jwk = { kty: "EC", crv: "P-256", d: env.VAPID_PRIVATE_KEY!, x: base64url(publicKey.slice(1, 33)), y: base64url(publicKey.slice(33, 65)) };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const part = (value: object) => base64url(encoder.encode(JSON.stringify(value)));
  const unsigned = `${part({ typ: "JWT", alg: "ES256" })}.${part({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, sub: subject })}`;
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(unsigned)));
  return `vapid t=${unsigned}.${base64url(signature)}, k=${env.VAPID_PUBLIC_KEY}`;
}

interface Device {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Sends one notification to one device: "gone" means the browser dropped the subscription for good. */
async function deliver(env: MailEnv, device: Device, message: PushMessage): Promise<"sent" | "gone" | "failed"> {
  const body = await encrypt(encoder.encode(JSON.stringify(message)), device.p256dh, device.auth);
  const response = await fetch(device.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapid(env, device.endpoint, `https://mail.${env.MAIL_DOMAIN}`),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(TTL_SECONDS),
      Urgency: "high",
    },
    body,
  });
  if (response.status === 404 || response.status === 410) return "gone";
  if (response.ok) return "sent";
  console.error("Push failed", new URL(device.endpoint).host, response.status, (await response.text()).slice(0, 300));
  return "failed";
}

/** Notifies every signed-in device of each account. Failures are logged, never thrown. */
export async function notify(env: MailEnv, messages: { accountId: string; message: PushMessage }[]): Promise<void> {
  if (!pushEnabled(env) || !messages.length) return;
  const { results } = await env.DB.prepare(
    `SELECT p.endpoint, p.p256dh, p.auth, p.account_id AS accountId FROM mail_push_subscriptions p
     JOIN mail_sessions s ON s.token_hash = p.session_hash
     WHERE p.account_id IN (SELECT value FROM json_each(?1)) AND s.expires_at > ?2`,
  )
    .bind(JSON.stringify([...new Set(messages.map((item) => item.accountId))]), Math.floor(Date.now() / 1000))
    .all<Device & { accountId: string }>();

  const gone: string[] = [];
  await Promise.all(
    messages.flatMap(({ accountId, message }) =>
      results
        .filter((device) => device.accountId === accountId)
        .map(async (device) => {
          try {
            if ((await deliver(env, device, message)) === "gone") gone.push(device.endpoint);
          } catch (error) {
            console.error("Push failed", error);
          }
        }),
    ),
  );
  if (gone.length) {
    await env.DB.prepare("DELETE FROM mail_push_subscriptions WHERE endpoint IN (SELECT value FROM json_each(?1))").bind(JSON.stringify(gone)).run();
  }
}

// ---- The signed-in person's devices ----

export function pushSettings(env: PushEnv): Response {
  return json({ publicKey: pushEnabled(env) ? env.VAPID_PUBLIC_KEY : null });
}

const KEY = /^[A-Za-z0-9_-]+$/;

export async function subscribe(request: Request, env: MailEnv, account: MailAccount, sessionHash: string): Promise<Response> {
  if (!pushEnabled(env)) throw new HttpError(503, "Notifications aren't set up yet.");
  const body = await readBody(request, 4_000);
  const keys = (body.keys ?? {}) as Record<string, unknown>;
  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
  const p256dh = typeof keys.p256dh === "string" ? keys.p256dh : "";
  const auth = typeof keys.auth === "string" ? keys.auth : "";
  if (endpoint.length > 2_000 || !allowedEndpoint(env, endpoint)) throw new HttpError(400, "This browser's notification service isn't supported.");
  const byteLength = (value: string) => {
    try {
      return KEY.test(value) ? fromBase64url(value).length : 0;
    } catch {
      return 0;
    }
  };
  if (byteLength(p256dh) !== 65 || byteLength(auth) !== 16) throw new HttpError(400, "The notification keys are not valid.");
  await rateLimit(env.DB, `mail-push:${account.id}`, 30, 15 * 60, "Too many changes to notifications. Please wait a few minutes.");

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO mail_push_subscriptions (endpoint, account_id, session_hash, p256dh, auth, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT (endpoint) DO UPDATE SET account_id = ?2, session_hash = ?3, p256dh = ?4, auth = ?5, created_at = ?6`,
    ).bind(endpoint, account.id, sessionHash, p256dh, auth, new Date().toISOString()),
    // One device per sign-in, and a sensible limit per mailbox.
    env.DB.prepare("DELETE FROM mail_push_subscriptions WHERE session_hash = ?1 AND endpoint != ?2").bind(sessionHash, endpoint),
    env.DB.prepare(
      `DELETE FROM mail_push_subscriptions WHERE account_id = ?1 AND endpoint NOT IN
       (SELECT endpoint FROM mail_push_subscriptions WHERE account_id = ?1 ORDER BY created_at DESC LIMIT ${MAX_DEVICES})`,
    ).bind(account.id),
  ]);
  return json({ ok: true }, { status: 201 });
}

export async function unsubscribe(request: Request, env: MailEnv, account: MailAccount): Promise<Response> {
  const body = await readBody(request, 4_000);
  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
  const { meta } = await env.DB.prepare("DELETE FROM mail_push_subscriptions WHERE endpoint = ?1 AND account_id = ?2").bind(endpoint, account.id).run();
  return json({ removed: meta.changes });
}

/** Sends a notification to the device asking, so people can check it works. */
export async function testPush(env: MailEnv, account: MailAccount, sessionHash: string): Promise<Response> {
  if (!pushEnabled(env)) throw new HttpError(503, "Notifications aren't set up yet.");
  await rateLimit(env.DB, `mail-push-test:${account.id}`, 5, 15 * 60, "You've sent several test notifications. Please wait a few minutes.");
  const device = await env.DB.prepare("SELECT endpoint, p256dh, auth FROM mail_push_subscriptions WHERE session_hash = ?1 AND account_id = ?2")
    .bind(sessionHash, account.id)
    .first<Device>();
  if (!device) throw new HttpError(404, "Notifications aren't on for this device.");
  const result = await deliver(env, device, {
    title: "Notifications are on",
    body: `You'll be told here when new email arrives for ${account.address}.`,
    url: "#inbox",
    tag: "test",
  });
  if (result === "gone") {
    await env.DB.prepare("DELETE FROM mail_push_subscriptions WHERE endpoint = ?1").bind(device.endpoint).run();
    throw new HttpError(410, "This device's notifications were switched off by the browser. Turn them on again.");
  }
  if (result === "failed") throw new HttpError(502, "The browser's notification service didn't accept the test. Please try again later.");
  return json({ ok: true });
}
