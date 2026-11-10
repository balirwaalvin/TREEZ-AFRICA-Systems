import { currentAdmin, login, logout, requireAdmin } from "./auth.ts";
import { HttpError, clientIp, json, rateLimit, readBody, sha256, text } from "./http.ts";
import { createReceipt, deleteReceipt, listReceipts, sendReceipt, updateInvoice, type ReceiptEnv } from "./receipts.ts";

interface Env extends ReceiptEnv {
  TURNSTILE_SECRET: string;
  VIEWS_LIMIT: RateLimit;
}

const STATUSES = ["new", "contacted", "scheduled", "closed"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LIST_LIMIT = 1000;
const VIEW_LIMIT = 5000;

const MESSAGE_COLUMNS = `id, name, email, phone, subject, message, status, notes, created_at AS createdAt, updated_at AS updatedAt`;
const POST_SUMMARY_COLUMNS = `id, title, category, author, date, read_time AS readTime, excerpt, published, created_at AS createdAt, updated_at AS updatedAt`;
const POST_COLUMNS = `${POST_SUMMARY_COLUMNS}, content`;

type PostRow = { published: number } & Record<string, unknown>;
const toPost = (row: PostRow) => ({ ...row, published: row.published === 1 });

async function verifyTurnstile(request: Request, env: Env, token: unknown): Promise<void> {
  const failed = new HttpError(403, "We couldn't complete the security check. Please refresh the page and try again.");
  if (typeof token !== "string" || !token || token.length > 2048) throw failed;
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: token, remoteip: clientIp(request) }),
  });
  const result = await response.json<{ success?: boolean }>().catch(() => null);
  if (!result?.success) throw failed;
}

async function createMessage(request: Request, env: Env): Promise<Response> {
  const body = await readBody(request, 32_000);
  const name = text(body, "name", "Name", { required: true, max: 200 });
  const email = text(body, "email", "Email", { required: true, max: 254 });
  const phone = text(body, "phone", "Phone", { max: 50 });
  const subject = text(body, "subject", "Subject", { required: true, max: 300 });
  const message = text(body, "message", "Message", { required: true, max: 10_000 });
  if (!EMAIL.test(email)) throw new HttpError(400, "Please enter a valid email address.");

  await rateLimit(
    env.DB,
    `message:${await sha256(clientIp(request))}`,
    5,
    10 * 60,
    "You've sent several messages in a short time. Please wait a few minutes and try again.",
  );
  await verifyTurnstile(request, env, body.turnstileToken);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO messages (id, name, email, phone, subject, message, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`,
  )
    .bind(id, name, email, phone, subject, message, now)
    .run();
  return json({ id }, { status: 201 });
}

async function recordView(request: Request, env: Env): Promise<Response> {
  const body = await readBody(request, 2_000);
  const { success } = await env.VIEWS_LIMIT.limit({ key: clientIp(request) });
  if (!success) throw new HttpError(429, "Too many requests.");
  await env.DB.prepare("INSERT INTO page_views (page, path, created_at) VALUES (?1, ?2, ?3)")
    .bind(
      text(body, "page", "Page", { max: 300 }),
      text(body, "path", "Path", { required: true, max: 500 }),
      new Date().toISOString(),
    )
    .run();
  return json({ ok: true }, { status: 201 });
}

async function publicPosts(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT ${POST_SUMMARY_COLUMNS} FROM posts WHERE published = 1 ORDER BY created_at DESC LIMIT ${LIST_LIMIT}`,
  ).all<PostRow>();
  return json({ documents: results.map(toPost) }, { headers: { "Cache-Control": "public, max-age=30" } });
}

async function publicPost(env: Env, id: string): Promise<Response> {
  const row = await env.DB.prepare(`SELECT ${POST_COLUMNS} FROM posts WHERE id = ?1 AND published = 1`).bind(id).first<PostRow>();
  if (!row) throw new HttpError(404, "That article could not be found.");
  return json(toPost(row), { headers: { "Cache-Control": "public, max-age=30" } });
}

async function adminMessages(env: Env): Promise<Response> {
  const [rows, count] = await env.DB.batch<Record<string, unknown>>([
    env.DB.prepare(`SELECT ${MESSAGE_COLUMNS} FROM messages ORDER BY created_at DESC LIMIT ${LIST_LIMIT}`),
    env.DB.prepare("SELECT COUNT(*) AS total FROM messages"),
  ]);
  return json({ total: count?.results[0]?.total ?? 0, documents: rows?.results ?? [] });
}

async function updateMessage(request: Request, env: Env, id: string): Promise<Response> {
  const body = await readBody(request, 16_000);
  const assignments: string[] = [];
  const values: string[] = [];
  if ("status" in body) {
    if (typeof body.status !== "string" || !STATUSES.includes(body.status)) throw new HttpError(400, "That status is not valid.");
    values.push(body.status);
    assignments.push(`status = ?${values.length}`);
  }
  if ("notes" in body) {
    values.push(text(body, "notes", "Notes", { max: 5_000 }));
    assignments.push(`notes = ?${values.length}`);
  }
  if (!assignments.length) throw new HttpError(400, "There is nothing to update.");

  values.push(new Date().toISOString());
  assignments.push(`updated_at = ?${values.length}`);
  values.push(id);
  const row = await env.DB.prepare(`UPDATE messages SET ${assignments.join(", ")} WHERE id = ?${values.length} RETURNING ${MESSAGE_COLUMNS}`)
    .bind(...values)
    .first();
  if (!row) throw new HttpError(404, "That conversation no longer exists.");
  return json(row);
}

async function adminPosts(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(`SELECT ${POST_COLUMNS} FROM posts ORDER BY created_at DESC LIMIT ${LIST_LIMIT}`).all<PostRow>();
  return json({ total: results.length, documents: results.map(toPost) });
}

function postFields(body: Record<string, unknown>) {
  const date = text(body, "date", "Date", { required: true, max: 40 });
  if (Number.isNaN(Date.parse(date))) throw new HttpError(400, "Date is not valid.");
  return [
    text(body, "title", "Title", { required: true, max: 300 }),
    text(body, "category", "Category", { required: true, max: 100 }),
    text(body, "author", "Author", { required: true, max: 200 }),
    date,
    text(body, "readTime", "Read time", { required: true, max: 50 }),
    text(body, "excerpt", "Excerpt", { required: true, max: 2_000 }),
    text(body, "content", "Article content", { required: true, max: 200_000 }),
    body.published === false ? 0 : 1,
  ] as const;
}

const POST_BODY_LIMIT = 1_000_000;

async function createPost(request: Request, env: Env): Promise<Response> {
  const fields = postFields(await readBody(request, POST_BODY_LIMIT));
  const now = new Date().toISOString();
  const row = await env.DB.prepare(
    `INSERT INTO posts (title, category, author, date, read_time, excerpt, content, published, id, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10) RETURNING ${POST_COLUMNS}`,
  )
    .bind(...fields, crypto.randomUUID(), now)
    .first<PostRow>();
  return json(row && toPost(row), { status: 201 });
}

async function updatePost(request: Request, env: Env, id: string): Promise<Response> {
  const fields = postFields(await readBody(request, POST_BODY_LIMIT));
  const row = await env.DB.prepare(
    `UPDATE posts SET title = ?1, category = ?2, author = ?3, date = ?4, read_time = ?5, excerpt = ?6, content = ?7, published = ?8, updated_at = ?9
     WHERE id = ?10 RETURNING ${POST_COLUMNS}`,
  )
    .bind(...fields, new Date().toISOString(), id)
    .first<PostRow>();
  if (!row) throw new HttpError(404, "That post no longer exists.");
  return json(toPost(row));
}

async function deletePost(env: Env, id: string): Promise<Response> {
  const { meta } = await env.DB.prepare("DELETE FROM posts WHERE id = ?1").bind(id).run();
  if (!meta.changes) throw new HttpError(404, "That post no longer exists.");
  return json({ ok: true });
}

async function adminViews(url: URL, env: Env): Promise<Response> {
  const since = new Date(url.searchParams.get("since") ?? 0);
  if (Number.isNaN(since.getTime())) throw new HttpError(400, "The date range is not valid.");
  const iso = since.toISOString();
  const [rows, count] = await env.DB.batch<Record<string, unknown>>([
    env.DB.prepare(`SELECT path, created_at AS createdAt FROM page_views WHERE created_at >= ?1 ORDER BY created_at DESC LIMIT ${VIEW_LIMIT}`).bind(iso),
    env.DB.prepare("SELECT COUNT(*) AS total FROM page_views WHERE created_at >= ?1").bind(iso),
  ]);
  return json({ total: count?.results[0]?.total ?? 0, documents: rows?.results ?? [] });
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const { method } = request;
  const path = url.pathname.replace(/\/+$/, "");

  // Browsers always send Origin on these methods, so this blocks other sites from posting here
  // (the session cookie's SameSite=Strict is the second layer for admin routes).
  if (!["GET", "HEAD"].includes(method) && request.headers.get("Origin") !== url.origin) {
    throw new HttpError(403, "This request isn't allowed from another site.");
  }

  if (path === "/api/messages" && method === "POST") return createMessage(request, env);
  if (path === "/api/views" && method === "POST") return recordView(request, env);
  if (path === "/api/posts" && method === "GET") return publicPosts(env);
  const publicPostMatch = path.match(/^\/api\/posts\/([^/]+)$/);
  if (publicPostMatch && method === "GET") return publicPost(env, decodeURIComponent(publicPostMatch[1]!));

  if (path === "/api/admin/login" && method === "POST") return login(request, env.DB);
  if (path === "/api/admin/logout" && method === "POST") return logout(request, env.DB);
  if (path === "/api/admin/session" && method === "GET") {
    const admin = await currentAdmin(request, env.DB);
    if (!admin) throw new HttpError(401, "Please sign in.");
    return json({ email: admin.email });
  }

  // Everything else under /api/admin needs a session, including unknown paths.
  if (path.startsWith("/api/admin")) {
    await requireAdmin(request, env.DB);
    if (path === "/api/admin/messages" && method === "GET") return adminMessages(env);
    if (path === "/api/admin/posts" && method === "GET") return adminPosts(env);
    if (path === "/api/admin/posts" && method === "POST") return createPost(request, env);
    if (path === "/api/admin/views" && method === "GET") return adminViews(url, env);
    const messageMatch = path.match(/^\/api\/admin\/messages\/([^/]+)$/);
    if (messageMatch && method === "PATCH") return updateMessage(request, env, decodeURIComponent(messageMatch[1]!));
    const postMatch = path.match(/^\/api\/admin\/posts\/([^/]+)$/);
    if (postMatch && method === "PUT") return updatePost(request, env, decodeURIComponent(postMatch[1]!));
    if (postMatch && method === "DELETE") return deletePost(env, decodeURIComponent(postMatch[1]!));
    if (path === "/api/admin/receipts" && method === "GET") return listReceipts(env);
    if (path === "/api/admin/receipts" && method === "POST") return createReceipt(request, env);
    const receiptMatch = path.match(/^\/api\/admin\/receipts\/([^/]+)$/);
    if (receiptMatch && method === "DELETE") return deleteReceipt(env, decodeURIComponent(receiptMatch[1]!));
    const sendMatch = path.match(/^\/api\/admin\/receipts\/([^/]+)\/send$/);
    if (sendMatch && method === "POST") return sendReceipt(request, env, decodeURIComponent(sendMatch[1]!));
    const invoiceMatch = path.match(/^\/api\/admin\/invoices\/([^/]+)$/);
    if (invoiceMatch && method === "PUT") return updateInvoice(request, env, decodeURIComponent(invoiceMatch[1]!));
  }

  throw new HttpError(404, "Not found.");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, { status: error.status, headers: error.headers });
      console.error("Unhandled API error", error);
      return json({ error: "Something went wrong on our side. Please try again." }, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
