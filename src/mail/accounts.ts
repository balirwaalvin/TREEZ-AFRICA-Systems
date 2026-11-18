import { DUMMY_HASH, hashPassword, newToken, readCookie, sessionCookie, verifyPassword } from "../auth.ts";
import { HttpError, clientIp, json, rateLimit, readBody, sha256, text } from "../http.ts";
import { filesOf, now, releaseFiles, type MailEnv } from "./store.ts";

/** Mailbox sign-in, kept apart from admin sign-in: a mailbox password never opens the admin workspace. */

const COOKIE = "__Host-treez_mail";
const SESSION_SECONDS = 30 * 24 * 60 * 60;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const INVALID_LOGIN = "That address or password is incorrect.";
const TOO_MANY_LOGINS = "Too many sign-in attempts. Please wait 15 minutes and try again.";
export const MIN_PASSWORD = 12;
const LOCAL_PART = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;

export interface MailAccount {
  id: string;
  address: string;
  displayName: string;
  signature: string;
}

const ACCOUNT_COLUMNS = "mail_accounts.id, mail_accounts.address, mail_accounts.display_name AS displayName, mail_accounts.signature";

/** "care" or "care@treez.tech" → "care@treez.tech". */
function fullAddress(value: string, domain: string): string {
  const address = value.trim().toLowerCase();
  return address.includes("@") ? address : `${address}@${domain}`;
}

export async function currentAccount(request: Request, db: D1Database): Promise<MailAccount | null> {
  const token = readCookie(request, COOKIE);
  if (!token) return null;
  return db
    .prepare(
      `SELECT ${ACCOUNT_COLUMNS} FROM mail_sessions
       JOIN mail_accounts ON mail_accounts.id = mail_sessions.account_id
       WHERE mail_sessions.token_hash = ?1 AND mail_sessions.expires_at > ?2 AND mail_accounts.disabled = 0`,
    )
    .bind(await sha256(token), Math.floor(Date.now() / 1000))
    .first<MailAccount>();
}

export async function requireAccount(request: Request, db: D1Database): Promise<MailAccount> {
  const account = await currentAccount(request, db);
  if (!account) throw new HttpError(401, "Please sign in.");
  return account;
}

const publicAccount = (account: MailAccount) => ({
  address: account.address,
  displayName: account.displayName,
  signature: account.signature,
});

export function session(account: MailAccount): Response {
  return json(publicAccount(account));
}

export async function mailLogin(request: Request, env: MailEnv): Promise<Response> {
  const body = await readBody(request, 2_000);
  const address = fullAddress(text(body, "address", "Email address", { required: true, max: 254 }), env.MAIL_DOMAIN);
  const password = typeof body.password === "string" ? body.password : "";
  if (!password || password.length > 1_000) throw new HttpError(401, INVALID_LOGIN);

  const ipKey = `mail-login:ip:${await sha256(clientIp(request))}`;
  await rateLimit(env.DB, ipKey, 10, LOGIN_WINDOW_SECONDS, TOO_MANY_LOGINS);
  await rateLimit(env.DB, `mail-login:address:${await sha256(address)}`, 30, LOGIN_WINDOW_SECONDS, TOO_MANY_LOGINS);

  const account = await env.DB.prepare(`SELECT ${ACCOUNT_COLUMNS}, password_hash, disabled FROM mail_accounts WHERE address = ?1`)
    .bind(address)
    .first<MailAccount & { password_hash: string; disabled: number }>();
  const valid = await verifyPassword(password, account?.password_hash ?? DUMMY_HASH);
  if (!account || !valid) throw new HttpError(401, INVALID_LOGIN);
  if (account.disabled) throw new HttpError(403, "This mailbox has been switched off. Please contact an administrator.");

  const token = newToken();
  const seconds = Math.floor(Date.now() / 1000);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO mail_sessions (token_hash, account_id, expires_at) VALUES (?1, ?2, ?3)").bind(await sha256(token), account.id, seconds + SESSION_SECONDS),
    env.DB.prepare("UPDATE mail_accounts SET last_login_at = ?2 WHERE id = ?1").bind(account.id, now()),
    env.DB.prepare("DELETE FROM mail_sessions WHERE expires_at <= ?1").bind(seconds),
    env.DB.prepare("DELETE FROM rate_limits WHERE key = ?1 OR reset_at <= ?2").bind(ipKey, seconds),
  ]);
  return json(publicAccount(account), { headers: { "Set-Cookie": sessionCookie(COOKIE, token, SESSION_SECONDS) } });
}

export async function mailLogout(request: Request, db: D1Database): Promise<Response> {
  const token = readCookie(request, COOKIE);
  if (token) await db.prepare("DELETE FROM mail_sessions WHERE token_hash = ?1").bind(await sha256(token)).run();
  return json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(COOKIE, "", 0) } });
}

function newPassword(body: Record<string, unknown>, field: string): string {
  const password = typeof body[field] === "string" ? (body[field] as string) : "";
  if (password.length < MIN_PASSWORD) throw new HttpError(400, `Use at least ${MIN_PASSWORD} characters for the password.`);
  if (password.length > 1_000) throw new HttpError(400, "That password is too long.");
  return password;
}

// ---- The signed-in person's own settings ----

export async function updateSettings(request: Request, env: MailEnv, account: MailAccount): Promise<Response> {
  const body = await readBody(request, 16_000);
  const displayName = text(body, "displayName", "Name", { required: true, max: 120 }).replace(/[\r\n]/g, " ");
  const signature = text(body, "signature", "Signature", { max: 2_000 });
  await env.DB.prepare("UPDATE mail_accounts SET display_name = ?2, signature = ?3, updated_at = ?4 WHERE id = ?1")
    .bind(account.id, displayName, signature, now())
    .run();
  return json({ ...publicAccount(account), displayName, signature });
}

export async function changePassword(request: Request, env: MailEnv, account: MailAccount): Promise<Response> {
  const body = await readBody(request, 4_000);
  await rateLimit(env.DB, `mail-password:${account.id}`, 10, LOGIN_WINDOW_SECONDS, TOO_MANY_LOGINS);
  const row = await env.DB.prepare("SELECT password_hash FROM mail_accounts WHERE id = ?1").bind(account.id).first<{ password_hash: string }>();
  const current = typeof body.current === "string" ? body.current : "";
  if (!row || !(await verifyPassword(current.slice(0, 1_000), row.password_hash))) throw new HttpError(400, "Your current password is incorrect.");
  const password = newPassword(body, "password");
  // Every other device is signed out; this one stays signed in.
  const token = readCookie(request, COOKIE) ?? "";
  await env.DB.batch([
    env.DB.prepare("UPDATE mail_accounts SET password_hash = ?2, updated_at = ?3 WHERE id = ?1").bind(account.id, await hashPassword(password), now()),
    env.DB.prepare("DELETE FROM mail_sessions WHERE account_id = ?1 AND token_hash != ?2").bind(account.id, await sha256(token)),
  ]);
  return json({ ok: true });
}

// ---- Admin: issuing and managing mailboxes ----

const MAILBOX_COLUMNS = `id, address, display_name AS displayName, disabled, last_login_at AS lastLoginAt, created_at AS createdAt,
  (SELECT COUNT(*) FROM mail_messages WHERE account_id = mail_accounts.id) AS messages,
  (SELECT COUNT(*) FROM mail_messages WHERE account_id = mail_accounts.id AND folder = 'inbox' AND is_read = 0) AS unread`;

type MailboxRow = { disabled: number } & Record<string, unknown>;
const toMailbox = (row: MailboxRow) => ({ ...row, disabled: row.disabled === 1 });

export async function listMailboxes(env: MailEnv): Promise<Response> {
  const { results } = await env.DB.prepare(`SELECT ${MAILBOX_COLUMNS} FROM mail_accounts ORDER BY address`).all<MailboxRow>();
  return json({ domain: env.MAIL_DOMAIN, documents: results.map(toMailbox) });
}

export async function createMailbox(request: Request, env: MailEnv): Promise<Response> {
  const body = await readBody(request, 4_000);
  const address = fullAddress(text(body, "address", "Address", { required: true, max: 254 }), env.MAIL_DOMAIN);
  const [local, domain] = address.split("@");
  if (domain !== env.MAIL_DOMAIN.toLowerCase()) throw new HttpError(400, `Mailboxes must be @${env.MAIL_DOMAIN} addresses.`);
  if (!local || !LOCAL_PART.test(local) || /\.\./.test(local)) {
    throw new HttpError(400, "Use letters, numbers, dots, dashes or underscores before the @, starting and ending with a letter or number.");
  }
  const displayName = text(body, "displayName", "Name", { required: true, max: 120 }).replace(/[\r\n]/g, " ");
  const passwordHash = await hashPassword(newPassword(body, "password"));
  const id = crypto.randomUUID();
  const time = now();
  const row = await env.DB.prepare(
    `INSERT INTO mail_accounts (id, address, display_name, password_hash, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?5) ON CONFLICT (address) DO NOTHING RETURNING ${MAILBOX_COLUMNS}`,
  )
    .bind(id, address, displayName, passwordHash, time)
    .first<MailboxRow>();
  if (!row) throw new HttpError(409, `${address} already has a mailbox.`);
  return json(toMailbox(row), { status: 201 });
}

export async function updateMailbox(request: Request, env: MailEnv, id: string): Promise<Response> {
  const body = await readBody(request, 4_000);
  const statements: D1PreparedStatement[] = [];
  const time = now();
  if ("displayName" in body) {
    const displayName = text(body, "displayName", "Name", { required: true, max: 120 }).replace(/[\r\n]/g, " ");
    statements.push(env.DB.prepare("UPDATE mail_accounts SET display_name = ?2, updated_at = ?3 WHERE id = ?1").bind(id, displayName, time));
  }
  // A new password or switching the mailbox off signs it out everywhere.
  if ("password" in body) {
    statements.push(env.DB.prepare("UPDATE mail_accounts SET password_hash = ?2, updated_at = ?3 WHERE id = ?1").bind(id, await hashPassword(newPassword(body, "password")), time));
    statements.push(env.DB.prepare("DELETE FROM mail_sessions WHERE account_id = ?1").bind(id));
  }
  if ("disabled" in body) {
    if (typeof body.disabled !== "boolean") throw new HttpError(400, "That setting is not valid.");
    statements.push(env.DB.prepare("UPDATE mail_accounts SET disabled = ?2, updated_at = ?3 WHERE id = ?1").bind(id, body.disabled ? 1 : 0, time));
    if (body.disabled) statements.push(env.DB.prepare("DELETE FROM mail_sessions WHERE account_id = ?1").bind(id));
  }
  if (!statements.length) throw new HttpError(400, "There is nothing to update.");
  await env.DB.batch(statements);
  const row = await env.DB.prepare(`SELECT ${MAILBOX_COLUMNS} FROM mail_accounts WHERE id = ?1`).bind(id).first<MailboxRow>();
  if (!row) throw new HttpError(404, "That mailbox no longer exists.");
  return json(toMailbox(row));
}

/** Deletes a mailbox and every email in it. Only a switched-off mailbox can be deleted. */
export async function deleteMailbox(env: MailEnv, id: string): Promise<Response> {
  const row = await env.DB.prepare("SELECT disabled FROM mail_accounts WHERE id = ?1").bind(id).first<{ disabled: number }>();
  if (!row) throw new HttpError(404, "That mailbox no longer exists.");
  if (!row.disabled) throw new HttpError(409, "Switch the mailbox off before deleting it.");
  const files = [
    ...(await filesOf(env, "account_id = ?1", id)),
    ...(await env.DB.prepare("SELECT r2_key FROM mail_attachments WHERE account_id = ?1 AND message_id IS NULL").bind(id).all<{ r2_key: string }>()).results.map((r) => r.r2_key),
  ];
  await env.DB.prepare("DELETE FROM mail_accounts WHERE id = ?1").bind(id).run();
  await releaseFiles(env, files);
  return json({ ok: true });
}
