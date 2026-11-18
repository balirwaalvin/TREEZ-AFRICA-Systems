import { HttpError, json, rateLimit, readBody, text } from "../http.ts";
import type { MailAccount } from "./accounts.ts";
import { formatAddress, recipients } from "./address.ts";
import { NOT_SET_UP, ResendError, checkFileUrl, sendEmail, signedFileUrl } from "./resend.ts";
import { filesOf, now, releaseFiles, type MailEnv } from "./store.ts";
import { emailHtml, snippetOf } from "./text.ts";

const FOLDERS = ["inbox", "sent", "drafts", "archive", "spam", "trash"] as const;
type Folder = (typeof FOLDERS)[number];
const PAGE_SIZE = 50;
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const MAX_ATTACHED_BYTES = 25 * 1024 * 1024; // Resend allows 40 MB after base64 encoding.
const MAX_ATTACHMENTS = 20;
const MAX_BODY = 100_000;
const SENDS_PER_DAY = 100;
const UNSENT_UPLOAD_HOURS = 24;

const SUMMARY_COLUMNS = `id, folder, direction, from_name AS fromName, from_address AS fromAddress, to_list AS toList,
  subject, snippet, has_attachments AS hasAttachments, is_read AS isRead, is_starred AS isStarred, delivery, date`;
const MESSAGE_COLUMNS = `${SUMMARY_COLUMNS}, cc_list AS ccList, bcc_list AS bccList, reply_to AS replyTo, message_id AS messageId,
  text_body AS text, html_key IS NOT NULL AS hasHtml, raw_key IS NOT NULL AS hasOriginal, auth,
  CASE WHEN folder = 'drafts' THEN in_reply_to ELSE '' END AS draftReplyTo`;
const ATTACHMENT_COLUMNS = "id, filename, content_type AS contentType, size, content_id AS contentId, inline";

type Row = Record<string, unknown>;
const list = (value: unknown): string[] => {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
};
const toSummary = (row: Row) => ({ ...row, toList: list(row.toList), hasAttachments: row.hasAttachments === 1, isRead: row.isRead === 1, isStarred: row.isStarred === 1 });
const toMessage = (row: Row) => {
  let auth: unknown = null;
  try {
    auth = row.auth ? JSON.parse(String(row.auth)) : null;
  } catch {
    // Leave it out.
  }
  return { ...toSummary(row), ccList: list(row.ccList), bccList: list(row.bccList), hasHtml: row.hasHtml === 1, hasOriginal: row.hasOriginal === 1, auth };
};
const toAttachment = (row: Row) => ({ ...row, inline: row.inline === 1 });

function idList(body: Record<string, unknown>, field: string, max: number): string[] {
  const raw = body[field] ?? [];
  if (!Array.isArray(raw) || raw.length > max || raw.some((id) => typeof id !== "string" || id.length > 64)) {
    throw new HttpError(400, "That selection is not valid.");
  }
  return [...new Set(raw as string[])];
}

// ---- Reading ----

export async function folderCounts(env: MailEnv, account: MailAccount): Promise<Response> {
  const [folders, starred] = await env.DB.batch<{ folder: string; total: number; unread: number }>([
    env.DB.prepare("SELECT folder, COUNT(*) AS total, SUM(is_read = 0) AS unread FROM mail_messages WHERE account_id = ?1 GROUP BY folder").bind(account.id),
    env.DB.prepare(
      "SELECT 'starred' AS folder, COUNT(*) AS total, SUM(is_read = 0) AS unread FROM mail_messages WHERE account_id = ?1 AND is_starred = 1 AND folder != 'trash'",
    ).bind(account.id),
  ]);
  const counts: Record<string, { total: number; unread: number }> = {};
  for (const folder of [...FOLDERS, "starred"]) counts[folder] = { total: 0, unread: 0 };
  for (const row of [...(folders?.results ?? []), ...(starred?.results ?? [])]) counts[row.folder] = { total: row.total, unread: row.unread ?? 0 };
  return json(counts);
}

/** One page of a folder, newest first. `before` is the last row's `date|id`, for the next page. */
export async function listMessages(url: URL, env: MailEnv, account: MailAccount): Promise<Response> {
  const folder = url.searchParams.get("folder") ?? "inbox";
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 200);
  const before = url.searchParams.get("before") ?? "";
  const conditions = ["account_id = ?1"];
  const values: unknown[] = [account.id];
  const add = (sql: string, ...params: unknown[]) => {
    conditions.push(sql.replace(/\?(\d)/g, (_, n: string) => `?${values.length + Number(n)}`));
    values.push(...params);
  };

  if (query) {
    // Search looks through everything except the bin and junk, wherever the email is filed.
    add("folder NOT IN ('trash', 'spam')");
    const like = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
    add("(subject LIKE ?1 ESCAPE '\\' OR from_name LIKE ?1 ESCAPE '\\' OR from_address LIKE ?1 ESCAPE '\\' OR to_list LIKE ?1 ESCAPE '\\' OR text_body LIKE ?1 ESCAPE '\\')", like);
  } else if (folder === "starred") {
    add("is_starred = 1 AND folder != 'trash'");
  } else if ((FOLDERS as readonly string[]).includes(folder)) {
    add("folder = ?1", folder);
  } else {
    throw new HttpError(400, "That folder doesn't exist.");
  }
  if (before) {
    const [date, id] = before.split("|");
    if (!date || !id) throw new HttpError(400, "That page is not valid.");
    add("(date < ?1 OR (date = ?1 AND id < ?2))", date, id);
  }

  const { results } = await env.DB.prepare(
    `SELECT ${SUMMARY_COLUMNS} FROM mail_messages WHERE ${conditions.join(" AND ")} ORDER BY date DESC, id DESC LIMIT ${PAGE_SIZE + 1}`,
  )
    .bind(...values)
    .all<Row>();
  const page = results.slice(0, PAGE_SIZE);
  const last = page[page.length - 1];
  return json({
    documents: page.map(toSummary),
    next: results.length > PAGE_SIZE && last ? `${last.date}|${last.id}` : null,
  });
}

async function ownMessage(env: MailEnv, account: MailAccount, id: string, columns = MESSAGE_COLUMNS) {
  const row = await env.DB.prepare(`SELECT ${columns} FROM mail_messages WHERE id = ?1 AND account_id = ?2`).bind(id, account.id).first<Row>();
  if (!row) throw new HttpError(404, "That email no longer exists.");
  return row;
}

export async function getMessage(env: MailEnv, account: MailAccount, id: string): Promise<Response> {
  const row = await ownMessage(env, account, id);
  const { results } = await env.DB.prepare(`SELECT ${ATTACHMENT_COLUMNS} FROM mail_attachments WHERE message_id = ?1 ORDER BY filename`).bind(id).all<Row>();
  return json({ ...toMessage(row), attachments: results.map(toAttachment) });
}

/** Headers for anything served from a stored email: never run, never sniffed, never framed by another site. */
function fileHeaders(contentType: string, disposition: string): Headers {
  return new Headers({
    "Content-Type": contentType,
    "Content-Disposition": disposition,
    "Content-Security-Policy": "sandbox; default-src 'none'",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
  });
}

const downloadName = (filename: string) => `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`;

/** The HTML body, as text: the page shows it inside a sandboxed frame. */
export async function messageHtml(env: MailEnv, account: MailAccount, id: string): Promise<Response> {
  const row = await ownMessage(env, account, id, "html_key AS key");
  const object = row.key ? await env.MAIL_FILES.get(String(row.key)) : null;
  if (!object) throw new HttpError(404, "This email has no HTML version.");
  return new Response(object.body, { headers: fileHeaders("text/plain; charset=utf-8", "inline") });
}

export async function messageOriginal(env: MailEnv, account: MailAccount, id: string): Promise<Response> {
  const row = await ownMessage(env, account, id, "raw_key AS key, subject");
  const object = row.key ? await env.MAIL_FILES.get(String(row.key)) : null;
  if (!object) throw new HttpError(404, "The original of this email isn't stored.");
  const name = `${String(row.subject || "email").replace(/[^\w .-]+/g, "").trim().slice(0, 80) || "email"}.eml`;
  return new Response(object.body, { headers: fileHeaders("message/rfc822", downloadName(name)) });
}

export async function attachmentFile(env: MailEnv, account: MailAccount, attachmentId: string): Promise<Response> {
  const row = await env.DB.prepare("SELECT r2_key AS key, filename, content_type AS contentType FROM mail_attachments WHERE id = ?1 AND account_id = ?2")
    .bind(attachmentId, account.id)
    .first<{ key: string; filename: string; contentType: string }>();
  const object = row ? await env.MAIL_FILES.get(row.key) : null;
  if (!row || !object) throw new HttpError(404, "That attachment no longer exists.");
  return new Response(object.body, { headers: fileHeaders(row.contentType || "application/octet-stream", downloadName(row.filename)) });
}

/** Serves a file to Resend, which fetches outgoing attachments from a signed link. */
export async function signedFile(url: URL, env: MailEnv, key: string): Promise<Response> {
  if (!(await checkFileUrl(env, key, url))) throw new HttpError(403, "This link has expired.");
  const object = await env.MAIL_FILES.get(key);
  if (!object) throw new HttpError(404, "Not found.");
  return new Response(object.body, { headers: fileHeaders(object.httpMetadata?.contentType ?? "application/octet-stream", "attachment") });
}

// ---- Organising ----

/** Marks, stars or moves several emails at once. Drafts stay in Drafts; sent mail never lands in the inbox. */
export async function updateMessages(request: Request, env: MailEnv, account: MailAccount): Promise<Response> {
  const body = await readBody(request, 64_000);
  const ids = idList(body, "ids", 500);
  if (!ids.length) throw new HttpError(400, "Choose at least one email.");
  const assignments: string[] = [];
  const values: unknown[] = [account.id, JSON.stringify(ids), now()];
  if ("read" in body) {
    if (typeof body.read !== "boolean") throw new HttpError(400, "That change is not valid.");
    values.push(body.read ? 1 : 0);
    assignments.push(`is_read = ?${values.length}`);
  }
  if ("starred" in body) {
    if (typeof body.starred !== "boolean") throw new HttpError(400, "That change is not valid.");
    values.push(body.starred ? 1 : 0);
    assignments.push(`is_starred = ?${values.length}`);
  }
  if ("folder" in body) {
    const folder = body.folder as Folder;
    if (!["inbox", "sent", "archive", "spam", "trash"].includes(folder)) throw new HttpError(400, "That folder is not valid.");
    values.push(folder);
    const n = values.length;
    assignments.push(
      `folder = CASE WHEN (direction = 'in' AND ?${n} IN ('inbox', 'archive', 'spam', 'trash'))
                       OR (direction = 'out' AND folder != 'drafts' AND ?${n} IN ('sent', 'archive', 'trash'))
                     THEN ?${n} ELSE folder END`,
    );
  }
  if (!assignments.length) throw new HttpError(400, "There is nothing to change.");
  const { meta } = await env.DB.prepare(
    `UPDATE mail_messages SET ${assignments.join(", ")}, updated_at = ?3 WHERE account_id = ?1 AND id IN (SELECT value FROM json_each(?2))`,
  )
    .bind(...values)
    .run();
  return json({ updated: meta.changes });
}

/** Deletes emails for good. Only emails in the bin, junk or drafts can be. */
export async function deleteMessages(request: Request, env: MailEnv, account: MailAccount): Promise<Response> {
  const body = await readBody(request, 64_000);
  const ids = idList(body, "ids", 500);
  const where = "account_id = ?1 AND folder IN ('trash', 'spam', 'drafts') AND id IN (SELECT value FROM json_each(?2))";
  return json({ deleted: await purge(env, where, account.id, JSON.stringify(ids)) });
}

export async function emptyFolder(env: MailEnv, account: MailAccount, folder: string): Promise<Response> {
  if (folder !== "trash" && folder !== "spam") throw new HttpError(400, "Only the bin and junk can be emptied.");
  return json({ deleted: await purge(env, "account_id = ?1 AND folder = ?2", account.id, folder) });
}

async function purge(env: MailEnv, where: string, ...values: unknown[]): Promise<number> {
  const files = await filesOf(env, where, ...values);
  const { meta } = await env.DB.prepare(`DELETE FROM mail_messages WHERE ${where}`).bind(...values).run();
  await releaseFiles(env, files);
  return meta.changes;
}

// ---- Attachments being written ----

/** Takes one file as the raw request body and stores it until it's sent or saved in a draft. */
export async function uploadAttachment(request: Request, env: MailEnv, account: MailAccount): Promise<Response> {
  const length = Number(request.headers.get("Content-Length"));
  if (!Number.isInteger(length) || length <= 0 || !request.body) throw new HttpError(411, "Choose a file to attach.");
  if (length > MAX_UPLOAD_BYTES) throw new HttpError(413, `Attachments can be up to ${MAX_UPLOAD_BYTES / 1024 / 1024} MB each.`);
  let filename = "attachment";
  try {
    filename = decodeURIComponent(request.headers.get("X-Filename") ?? "attachment");
  } catch {
    // Keep the default.
  }
  filename = filename.replace(/[\r\n"\\/]/g, "_").trim().slice(0, 255) || "attachment";
  const contentType = (request.headers.get("Content-Type") || "application/octet-stream").slice(0, 200);
  await rateLimit(env.DB, `mail-upload:${account.id}`, 200, 24 * 60 * 60, "You've attached a lot of files today. Please try again tomorrow.");

  // Files attached but never sent are cleared out after a day.
  const stale = new Date(Date.now() - UNSENT_UPLOAD_HOURS * 60 * 60 * 1000).toISOString();
  const { results: old } = await env.DB.prepare(
    "DELETE FROM mail_attachments WHERE account_id = ?1 AND message_id IS NULL AND created_at < ?2 RETURNING r2_key",
  )
    .bind(account.id, stale)
    .all<{ r2_key: string }>();
  await releaseFiles(env, old.map((row) => row.r2_key));

  const id = crypto.randomUUID();
  const key = `out/${account.id}/${id}`;
  const { readable, writable } = new FixedLengthStream(length);
  const [object] = await Promise.all([
    env.MAIL_FILES.put(key, readable, { httpMetadata: { contentType } }),
    request.body.pipeTo(writable),
  ]);
  const size = object?.size ?? length;
  await env.DB.prepare(
    `INSERT INTO mail_attachments (id, account_id, message_id, r2_key, filename, content_type, size, created_at)
     VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?6, ?7)`,
  )
    .bind(id, account.id, key, filename, contentType, size, now())
    .run();
  return json({ id, filename, contentType, size, inline: false }, { status: 201 });
}

export async function deleteUpload(env: MailEnv, account: MailAccount, id: string): Promise<Response> {
  const row = await env.DB.prepare("DELETE FROM mail_attachments WHERE id = ?1 AND account_id = ?2 AND message_id IS NULL RETURNING r2_key")
    .bind(id, account.id)
    .first<{ r2_key: string }>();
  if (row) await releaseFiles(env, [row.r2_key]);
  return json({ ok: true });
}

interface AttachmentRow {
  id: string;
  messageId: string | null;
  key: string;
  filename: string;
  contentType: string;
  size: number;
}

/** The account's own attachments among `ids`: fresh uploads, or files on its emails (for forwarding). */
async function chosenAttachments(env: MailEnv, account: MailAccount, ids: string[]): Promise<AttachmentRow[]> {
  if (!ids.length) return [];
  const { results } = await env.DB.prepare(
    `SELECT id, message_id AS messageId, r2_key AS key, filename, content_type AS contentType, size
     FROM mail_attachments WHERE account_id = ?1 AND id IN (SELECT value FROM json_each(?2))`,
  )
    .bind(account.id, JSON.stringify(ids))
    .all<AttachmentRow>();
  if (results.length !== ids.length) throw new HttpError(400, "One of the attachments is no longer available. Please attach it again.");
  if (results.reduce((sum, row) => sum + row.size, 0) > MAX_ATTACHED_BYTES) {
    throw new HttpError(413, `Attachments can add up to ${MAX_ATTACHED_BYTES / 1024 / 1024} MB per email.`);
  }
  return results;
}

/** Copies attachments onto a message. The originals stay where they were, sharing the same file. */
function attachTo(env: MailEnv, account: MailAccount, messageId: string, rows: AttachmentRow[]): D1PreparedStatement[] {
  return rows.map((row) =>
    env.DB.prepare(
      `INSERT INTO mail_attachments (id, account_id, message_id, r2_key, filename, content_type, size, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    ).bind(crypto.randomUUID(), account.id, messageId, row.key, row.filename, row.contentType, row.size, now()),
  );
}

// ---- Writing ----

interface Composed {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  text: string;
  attachmentIds: string[];
  replyToMessage: string;
  draftId: string;
}

function composed(body: Record<string, unknown>): Composed {
  const subject = text(body, "subject", "Subject", { max: 998 });
  if (/[\r\n]/.test(subject)) throw new HttpError(400, "The subject can't contain line breaks.");
  const optionalId = (field: string) => {
    const value = body[field];
    if (value === undefined || value === null || value === "") return "";
    if (typeof value !== "string" || value.length > 64) throw new HttpError(400, "That email is not valid.");
    return value;
  };
  const raw = typeof body.text === "string" ? body.text : "";
  if (raw.length > MAX_BODY) throw new HttpError(400, `The message is too long (${MAX_BODY.toLocaleString("en")} characters at most).`);
  return {
    to: recipients(body, "to", "To"),
    cc: recipients(body, "cc", "Cc"),
    bcc: recipients(body, "bcc", "Bcc"),
    subject,
    text: raw.replace(/\r\n?/g, "\n"),
    attachmentIds: idList(body, "attachments", MAX_ATTACHMENTS),
    replyToMessage: optionalId("inReplyTo"),
    draftId: optionalId("draftId"),
  };
}

/** Saves (or updates) a draft. Its attachments are returned with new ids that belong to the draft. */
export async function saveDraft(request: Request, env: MailEnv, account: MailAccount, id: string | null): Promise<Response> {
  const mail = composed(await readBody(request, 256_000));
  const attachments = await chosenAttachments(env, account, mail.attachmentIds);
  const time = now();
  const draftId = id ?? crypto.randomUUID();
  if (id && (await ownMessage(env, account, id, "folder")).folder !== "drafts") throw new HttpError(409, "That draft has already been sent.");
  const fields = [JSON.stringify(mail.to), JSON.stringify(mail.cc), JSON.stringify(mail.bcc), mail.subject, snippetOf(mail.text), mail.text, mail.replyToMessage];

  const statements: D1PreparedStatement[] = [];
  if (id) {
    statements.push(
      env.DB.prepare(
        `UPDATE mail_messages SET to_list = ?3, cc_list = ?4, bcc_list = ?5, subject = ?6, snippet = ?7, text_body = ?8, in_reply_to = ?9,
           has_attachments = ?10, date = ?11, updated_at = ?11 WHERE id = ?1 AND account_id = ?2 AND folder = 'drafts'`,
      ).bind(draftId, account.id, ...fields, attachments.length ? 1 : 0, time),
    );
  } else {
    statements.push(
      env.DB.prepare(
        `INSERT INTO mail_messages (id, account_id, folder, direction, from_name, from_address, to_list, cc_list, bcc_list, subject, snippet,
           text_body, in_reply_to, has_attachments, is_read, date, created_at, updated_at)
         VALUES (?1, ?2, 'drafts', 'out', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 1, ?13, ?13, ?13)`,
      ).bind(draftId, account.id, account.displayName, account.address, ...fields, attachments.length ? 1 : 0, time),
    );
  }
  // The draft's attachment list is replaced: fresh uploads move onto it, others are copied.
  const keep = attachments.filter((row) => row.messageId === draftId).map((row) => row.id);
  statements.push(
    env.DB.prepare("DELETE FROM mail_attachments WHERE message_id = ?1 AND id NOT IN (SELECT value FROM json_each(?2))").bind(draftId, JSON.stringify(keep)),
  );
  const uploads = attachments.filter((row) => row.messageId === null);
  if (uploads.length) {
    statements.push(
      env.DB.prepare("UPDATE mail_attachments SET message_id = ?1 WHERE account_id = ?2 AND message_id IS NULL AND id IN (SELECT value FROM json_each(?3))").bind(
        draftId,
        account.id,
        JSON.stringify(uploads.map((row) => row.id)),
      ),
    );
  }
  statements.push(...attachTo(env, account, draftId, attachments.filter((row) => row.messageId !== null && row.messageId !== draftId)));
  const before = id ? (await env.DB.prepare("SELECT r2_key FROM mail_attachments WHERE message_id = ?1").bind(draftId).all<{ r2_key: string }>()).results : [];
  await env.DB.batch(statements);
  await releaseFiles(env, before.map((row) => row.r2_key));
  return getMessage(env, account, draftId);
}

/** Sends an email through Resend and files a copy in Sent. A draft being sent is removed. */
export async function sendMessage(request: Request, env: MailEnv, account: MailAccount, origin: string): Promise<Response> {
  if (!env.RESEND_API_KEY) throw new HttpError(503, NOT_SET_UP);
  const mail = composed(await readBody(request, 256_000));
  if (!mail.to.length && !mail.cc.length && !mail.bcc.length) throw new HttpError(400, "Add at least one recipient.");
  if (mail.to.length + mail.cc.length + mail.bcc.length > 50) throw new HttpError(400, "An email can go to at most 50 people.");
  if (!mail.subject && !mail.text.trim()) throw new HttpError(400, "Write a subject or a message before sending.");
  const attachments = await chosenAttachments(env, account, mail.attachmentIds);
  const draft = mail.draftId ? await ownMessage(env, account, mail.draftId, "id, folder") : null;
  if (draft && draft.folder !== "drafts") throw new HttpError(409, "That draft has already been sent.");

  const headers: Record<string, string> = {};
  if (mail.replyToMessage) {
    const original = await env.DB.prepare("SELECT message_id AS messageId, refs FROM mail_messages WHERE id = ?1 AND account_id = ?2")
      .bind(mail.replyToMessage, account.id)
      .first<{ messageId: string; refs: string }>();
    if (original?.messageId && !/[\r\n]/.test(original.messageId)) {
      headers["In-Reply-To"] = original.messageId;
      headers.References = `${original.refs.replace(/[\r\n]+/g, " ")} ${original.messageId}`.trim().slice(-2_000);
    }
  }

  await rateLimit(env.DB, `mail-send:${account.id}`, SENDS_PER_DAY, 24 * 60 * 60, `Each mailbox can send ${SENDS_PER_DAY} emails a day. Please try again tomorrow.`);

  const id = crypto.randomUUID();
  let sent: { id: string };
  try {
    sent = await sendEmail(
      env,
      {
        from: formatAddress({ name: account.displayName, address: account.address }),
        to: mail.to,
        cc: mail.cc.length ? mail.cc : undefined,
        bcc: mail.bcc.length ? mail.bcc : undefined,
        subject: mail.subject || "(no subject)",
        text: mail.text,
        html: emailHtml(mail.text),
        headers: Object.keys(headers).length ? headers : undefined,
        attachments: attachments.length
          ? await Promise.all(attachments.map(async (row) => ({ filename: row.filename, content_type: row.contentType, path: await signedFileUrl(env, origin, row.key) })))
          : undefined,
      },
      id,
    );
  } catch (error) {
    if (error instanceof ResendError) {
      console.error("Resend refused an email", error.status, error.message);
      throw new HttpError(502, error.status ? `The email wasn't sent: ${error.message}` : "The email wasn't sent because Resend couldn't be reached. Please try again.");
    }
    throw error;
  }

  const time = now();
  const statements = [
    env.DB.prepare(
      `INSERT INTO mail_messages (id, account_id, folder, direction, resend_id, in_reply_to, refs, from_name, from_address, to_list, cc_list,
         bcc_list, subject, snippet, text_body, has_attachments, is_read, delivery, date, created_at, updated_at)
       VALUES (?1, ?2, 'sent', 'out', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 1, 'sent', ?15, ?15, ?15)`,
    ).bind(
      id,
      account.id,
      sent.id,
      headers["In-Reply-To"] ?? "",
      headers.References ?? "",
      account.displayName,
      account.address,
      JSON.stringify(mail.to),
      JSON.stringify(mail.cc),
      JSON.stringify(mail.bcc),
      mail.subject || "(no subject)",
      snippetOf(mail.text),
      mail.text,
      attachments.length ? 1 : 0,
      time,
    ),
    ...attachTo(env, account, id, attachments),
    // Fresh uploads now live on the sent copy.
    env.DB.prepare("DELETE FROM mail_attachments WHERE account_id = ?1 AND message_id IS NULL AND id IN (SELECT value FROM json_each(?2))").bind(
      account.id,
      JSON.stringify(attachments.filter((row) => row.messageId === null).map((row) => row.id)),
    ),
  ];
  if (draft) statements.push(env.DB.prepare("DELETE FROM mail_messages WHERE id = ?1 AND account_id = ?2").bind(draft.id, account.id));
  if (mail.replyToMessage) {
    statements.push(env.DB.prepare("UPDATE mail_messages SET is_read = 1 WHERE id = ?1 AND account_id = ?2").bind(mail.replyToMessage, account.id));
  }
  await env.DB.batch(statements);
  return getMessage(env, account, id).then((response) => new Response(response.body, { status: 201, headers: response.headers }));
}
