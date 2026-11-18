import { HttpError } from "../http.ts";

/**
 * A small client for the parts of the Resend API that mailboxes use, plus webhook checks.
 * https://resend.com/docs/api-reference
 */

export interface ResendEnv {
  RESEND_API_URL: string;
  RESEND_API_KEY?: string;
  RESEND_WEBHOOK_SECRET?: string;
}

/** Thrown when Resend refuses a request. `message` is Resend's own explanation. */
export class ResendError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const NOT_SET_UP = "Email isn't set up yet. An administrator needs to add the Resend API key to the Worker.";

async function call<T>(env: ResendEnv, path: string, init: RequestInit = {}): Promise<T> {
  if (!env.RESEND_API_KEY) throw new HttpError(503, NOT_SET_UP);
  let response: Response;
  try {
    response = await fetch(`${env.RESEND_API_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "User-Agent": "treez-mail/1.0",
        ...init.headers,
      },
    });
  } catch {
    throw new ResendError(0, "Resend could not be reached.");
  }
  const data = await response.json<Record<string, unknown>>().catch(() => null);
  if (!response.ok) {
    const message = typeof data?.message === "string" ? data.message : `Resend answered with status ${response.status}.`;
    throw new ResendError(response.status, message);
  }
  return data as T;
}

export interface OutgoingEmail {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  reply_to?: string[];
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
  /**
   * Resend downloads a file from `path`, so nothing large passes through the Worker. `content`
   * (base64) suits small files that are already in hand, like a receipt's PDF.
   */
  attachments?: ({ filename: string; content_type: string } & ({ path: string } | { content: string }))[];
}

export function sendEmail(env: ResendEnv, email: OutgoingEmail, idempotencyKey: string) {
  return call<{ id: string }>(env, "/emails", {
    method: "POST",
    body: JSON.stringify(email),
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

export interface ReceivedEmail {
  id: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  reply_to?: string[];
  from?: string;
  subject?: string | null;
  html?: string | null;
  text?: string | null;
  headers?: Record<string, unknown>;
  message_id?: string | null;
  created_at?: string;
  authentication?: { spf?: string; dkim?: string; dmarc?: string };
  raw?: { download_url?: string } | null;
  attachments?: { id: string }[];
}

export function receivedEmail(env: ResendEnv, id: string) {
  return call<ReceivedEmail>(env, `/emails/receiving/${encodeURIComponent(id)}`);
}

export interface ReceivedAttachment {
  id: string;
  filename?: string | null;
  content_type?: string | null;
  content_disposition?: string | null;
  content_id?: string | null;
  size?: number;
  download_url: string;
}

export function receivedAttachments(env: ResendEnv, id: string) {
  return call<{ data?: ReceivedAttachment[] }>(env, `/emails/receiving/${encodeURIComponent(id)}/attachments`);
}

// ---- Webhooks (signed by Svix: https://docs.svix.com/receiving/verifying-payloads/how-manual) ----

const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;
const encoder = new TextEncoder();
const fromBase64 = (value: string) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

async function hmac(key: Uint8Array, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message)));
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && crypto.subtle.timingSafeEqual(a, b);
}

/** True when `body` really came from Resend, recently. */
export async function verifyWebhook(request: Request, secret: string, body: string): Promise<boolean> {
  const header = (name: string) => request.headers.get(`svix-${name}`) ?? request.headers.get(`webhook-${name}`);
  const id = header("id");
  const timestamp = header("timestamp");
  const signatures = header("signature");
  if (!id || !timestamp || !signatures || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > WEBHOOK_TOLERANCE_SECONDS) return false;

  let key: Uint8Array;
  try {
    key = fromBase64(secret.replace(/^whsec_/, ""));
  } catch {
    return false;
  }
  const expected = await hmac(key, `${id}.${timestamp}.${body}`);
  for (const entry of signatures.split(" ")) {
    const [version, signature] = entry.split(",");
    if (version !== "v1" || !signature) continue;
    try {
      if (equalBytes(fromBase64(signature), expected)) return true;
    } catch {
      // Not base64; try the next one.
    }
  }
  return false;
}

// ---- Links Resend uses to fetch outgoing attachments ----

const FILE_LINK_SECONDS = 24 * 60 * 60;
const hex = (bytes: Uint8Array) => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

function fileSignature(env: ResendEnv, key: string, expires: number) {
  return hmac(encoder.encode(`mail-files:${env.RESEND_API_KEY ?? ""}`), `${key}\n${expires}`).then(hex);
}

/** A link that serves one stored file to whoever holds it, for a day. */
export async function signedFileUrl(env: ResendEnv, origin: string, key: string): Promise<string> {
  const expires = Math.floor(Date.now() / 1000) + FILE_LINK_SECONDS;
  const signature = await fileSignature(env, key, expires);
  return `${origin}/api/mail/files/${encodeURIComponent(key)}?expires=${expires}&signature=${signature}`;
}

export async function checkFileUrl(env: ResendEnv, key: string, url: URL): Promise<boolean> {
  const expires = Number(url.searchParams.get("expires"));
  const signature = url.searchParams.get("signature") ?? "";
  if (!env.RESEND_API_KEY || !Number.isInteger(expires) || expires < Date.now() / 1000) return false;
  return equalBytes(encoder.encode(signature), encoder.encode(await fileSignature(env, key, expires)));
}
