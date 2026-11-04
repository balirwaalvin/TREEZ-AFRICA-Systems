/** An error whose message is safe to show to the person making the request. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly headers: HeadersInit = {},
  ) {
    super(message);
  }
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-Content-Type-Options", "nosniff");
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

/** Parses a JSON object body, refusing anything bigger than `maxBytes`. */
export async function readBody(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "Send the request as JSON.");
  }
  const declared = Number(request.headers.get("Content-Length") ?? 0);
  if (declared > maxBytes) throw new HttpError(413, "That submission is too large.");
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) throw new HttpError(413, "That submission is too large.");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HttpError(400, "The request could not be read.");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new HttpError(400, "The request could not be read.");
  }
  return body as Record<string, unknown>;
}

/** Reads a trimmed string field, enforcing presence and a maximum length. */
export function text(
  body: Record<string, unknown>,
  field: string,
  label: string,
  options: { required?: boolean; max: number },
): string {
  const raw = body[field];
  if (raw !== undefined && raw !== null && typeof raw !== "string") throw new HttpError(400, `${label} is not valid.`);
  const value = (raw ?? "").trim();
  if (options.required && !value) throw new HttpError(400, `${label} is required.`);
  if (value.length > options.max) throw new HttpError(400, `${label} is too long (${options.max} characters at most).`);
  return value;
}

export function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "local";
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Counts one attempt against `key` in a fixed window. Throws 429 once `limit` is passed.
 * The upsert is a single statement, so concurrent requests can't under-count.
 */
export async function rateLimit(
  db: D1Database,
  key: string,
  limit: number,
  windowSeconds: number,
  message: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, count, reset_at) VALUES (?1, 1, ?2)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN reset_at <= ?3 THEN 1 ELSE count + 1 END,
         reset_at = CASE WHEN reset_at <= ?3 THEN ?2 ELSE reset_at END
       RETURNING count, reset_at`,
    )
    .bind(key, now + windowSeconds, now)
    .first<{ count: number; reset_at: number }>();
  if (row && row.count > limit) {
    throw new HttpError(429, message, { "Retry-After": String(Math.max(row.reset_at - now, 1)) });
  }
}
