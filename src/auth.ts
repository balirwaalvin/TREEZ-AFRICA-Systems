import { HttpError, clientIp, json, rateLimit, readBody, sha256, text } from "./http.ts";

const SESSION_SECONDS = 7 * 24 * 60 * 60;
const COOKIE = "__Host-treez_admin";
const INVALID_LOGIN = "That email or password is incorrect.";
const TOO_MANY_LOGINS = "Too many sign-in attempts. Please wait 15 minutes and try again.";
const LOGIN_WINDOW_SECONDS = 15 * 60;

// Workers caps PBKDF2 at 100,000 iterations. The count is stored in each hash so it can change later.
const PBKDF2_ITERATIONS = 100_000;

export interface Admin {
  id: string;
  email: string;
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (value: string) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

// Compared against when an email isn't found, so unknown emails take as long as wrong passwords.
const DUMMY_HASH = `pbkdf2-sha256$${PBKDF2_ITERATIONS}$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=`;

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterations, salt, expected] = stored.split("$");
  if (scheme !== "pbkdf2-sha256" || !iterations || !salt || !expected) return false;
  const actual = await derive(password, fromBase64(salt), Number(iterations));
  const wanted = fromBase64(expected);
  return actual.length === wanted.length && crypto.subtle.timingSafeEqual(actual, wanted);
}

function sessionCookie(value: string, maxAge: number): string {
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

function readCookie(request: Request): string | null {
  for (const part of (request.headers.get("Cookie") ?? "").split(";")) {
    const [name, value] = part.trim().split("=");
    if (name === COOKIE && value) return value;
  }
  return null;
}

/** Returns the signed-in admin, or null when the session is missing, unknown or expired. */
export async function currentAdmin(request: Request, db: D1Database): Promise<Admin | null> {
  const token = readCookie(request);
  if (!token) return null;
  return db
    .prepare(
      `SELECT admins.id, admins.email FROM sessions
       JOIN admins ON admins.id = sessions.admin_id
       WHERE sessions.token_hash = ?1 AND sessions.expires_at > ?2`,
    )
    .bind(await sha256(token), Math.floor(Date.now() / 1000))
    .first<Admin>();
}

export async function requireAdmin(request: Request, db: D1Database): Promise<Admin> {
  const admin = await currentAdmin(request, db);
  if (!admin) throw new HttpError(401, "Please sign in.");
  return admin;
}

export async function login(request: Request, db: D1Database): Promise<Response> {
  const body = await readBody(request, 2_000);
  const email = text(body, "email", "Email", { required: true, max: 254 }).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  if (!password || password.length > 1_000) throw new HttpError(401, INVALID_LOGIN);

  // Limits run before hashing, so a flood of guesses can't burn CPU. The per-email limit is
  // higher than the per-IP one, so a single attacker can't lock the real admin out.
  const ipKey = `login:ip:${await sha256(clientIp(request))}`;
  const emailKey = `login:email:${await sha256(email)}`;
  await rateLimit(db, ipKey, 10, LOGIN_WINDOW_SECONDS, TOO_MANY_LOGINS);
  await rateLimit(db, emailKey, 30, LOGIN_WINDOW_SECONDS, TOO_MANY_LOGINS);

  const admin = await db
    .prepare("SELECT id, email, password_hash FROM admins WHERE email = ?1")
    .bind(email)
    .first<Admin & { password_hash: string }>();
  const valid = await verifyPassword(password, admin?.password_hash ?? DUMMY_HASH);
  if (!admin || !valid) throw new HttpError(401, INVALID_LOGIN);

  const token = toBase64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" })[c] ?? "");
  const now = Math.floor(Date.now() / 1000);
  await db.batch([
    db.prepare("INSERT INTO sessions (token_hash, admin_id, expires_at) VALUES (?1, ?2, ?3)").bind(await sha256(token), admin.id, now + SESSION_SECONDS),
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?1").bind(now),
    db.prepare("DELETE FROM rate_limits WHERE key = ?1 OR reset_at <= ?2").bind(ipKey, now),
  ]);
  return json({ email: admin.email }, { headers: { "Set-Cookie": sessionCookie(token, SESSION_SECONDS) } });
}

export async function logout(request: Request, db: D1Database): Promise<Response> {
  const token = readCookie(request);
  if (token) await db.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(await sha256(token)).run();
  return json({ ok: true }, { headers: { "Set-Cookie": sessionCookie("", 0) } });
}
