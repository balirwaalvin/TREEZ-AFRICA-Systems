import { HttpError, json } from "../http.ts";
import { addressesOf, mailboxFor, parseAddress } from "./address.ts";
import { notify } from "./push.ts";
import { receivedAttachments, receivedEmail, verifyWebhook } from "./resend.ts";
import { now, type MailEnv } from "./store.ts";
import { htmlToText, snippetOf } from "./text.ts";

/**
 * Resend calls POST /api/mail/inbound for every event the webhook subscribes to:
 * - email.received files a new email into each matching mailbox;
 * - email.delivered / bounced / complained / delivery_delayed update a sent email's status.
 * Resend retries anything that isn't a 2xx, so filing an email is safe to repeat.
 */

const MAX_WEBHOOK_BYTES = 1_000_000;
const MAX_TEXT = 100_000;
const DELIVERY: Record<string, string> = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.delivery_delayed": "delayed",
};

interface WebhookEvent {
  type?: string;
  data?: {
    email_id?: string;
    to?: unknown;
    cc?: unknown;
    bcc?: unknown;
    received_for?: unknown;
  };
}

export async function handleWebhook(request: Request, env: MailEnv, ctx: ExecutionContext): Promise<Response> {
  if (!env.RESEND_WEBHOOK_SECRET) throw new HttpError(503, "Receiving isn't set up yet.");
  const declared = Number(request.headers.get("Content-Length") ?? 0);
  if (declared > MAX_WEBHOOK_BYTES) throw new HttpError(413, "Too large.");
  const body = await request.text();
  if (body.length > MAX_WEBHOOK_BYTES) throw new HttpError(413, "Too large.");
  if (!(await verifyWebhook(request, env.RESEND_WEBHOOK_SECRET, body))) throw new HttpError(401, "Signature check failed.");

  let event: WebhookEvent;
  try {
    event = JSON.parse(body) as WebhookEvent;
  } catch {
    throw new HttpError(400, "The request could not be read.");
  }
  const emailId = event.data?.email_id;
  if (typeof emailId !== "string" || !emailId) return json({ ok: true, ignored: true });

  if (event.type === "email.received") return json({ ok: true, filed: await fileReceived(env, ctx, emailId, event.data!) });
  const delivery = DELIVERY[event.type ?? ""];
  if (delivery) {
    // A later "delayed" or "delivered" never hides a bounce or complaint.
    await env.DB.prepare(
      `UPDATE mail_messages SET delivery = ?2 WHERE resend_id = ?1 AND direction = 'out'
       AND (delivery IN ('', 'sent', 'delayed') OR ?2 IN ('bounced', 'complained'))`,
    )
      .bind(emailId, delivery)
      .run();
  }
  return json({ ok: true });
}

/** Stores a fetched file in R2 without holding it all in memory when its size is known. */
async function storeDownload(env: MailEnv, url: string, key: string, contentType: string): Promise<number> {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Download for ${key} failed with ${response.status}`);
  const length = Number(response.headers.get("Content-Length") ?? NaN);
  const encoded = !!response.headers.get("Content-Encoding");
  if (!Number.isInteger(length) || length < 0 || encoded) {
    const object = await env.MAIL_FILES.put(key, await response.arrayBuffer(), { httpMetadata: { contentType } });
    return object?.size ?? 0;
  }
  const { readable, writable } = new FixedLengthStream(length);
  const [object] = await Promise.all([env.MAIL_FILES.put(key, readable, { httpMetadata: { contentType } }), response.body.pipeTo(writable)]);
  return object?.size ?? length;
}

const header = (headers: Record<string, unknown> | undefined, name: string): string => {
  const value = headers?.[name];
  return (Array.isArray(value) ? value.join(" ") : typeof value === "string" ? value : "").slice(0, 4_000);
};

async function fileReceived(env: MailEnv, ctx: ExecutionContext, emailId: string, data: NonNullable<WebhookEvent["data"]>): Promise<number> {
  // Everyone the email was addressed to, including Bcc and the envelope recipients.
  const addresses = new Set(
    [data.to, data.cc, data.bcc, data.received_for]
      .flatMap(addressesOf)
      .map((address) => mailboxFor(address, env.MAIL_DOMAIN))
      .filter((address): address is string => !!address),
  );
  if (!addresses.size) return 0;

  const { results: accounts } = await env.DB.prepare(
    `SELECT id FROM mail_accounts WHERE disabled = 0
     AND (address IN (SELECT value FROM json_each(?1)) OR id IN (SELECT account_id FROM mail_aliases WHERE address IN (SELECT value FROM json_each(?1))))
     AND id NOT IN (SELECT account_id FROM mail_messages WHERE resend_id = ?2 AND direction = 'in')`,
  )
    .bind(JSON.stringify([...addresses]), emailId)
    .all<{ id: string }>();
  if (!accounts.length) return 0;

  const email = await receivedEmail(env, emailId);
  const base = `in/${emailId}`;
  const htmlKey = email.html ? `${base}/body.html` : null;
  const rawKey = email.raw?.download_url ? `${base}/original.eml` : null;

  const work: Promise<unknown>[] = [];
  if (htmlKey) work.push(env.MAIL_FILES.put(htmlKey, email.html!, { httpMetadata: { contentType: "text/html; charset=utf-8" } }));
  if (rawKey) work.push(storeDownload(env, email.raw!.download_url!, rawKey, "message/rfc822"));
  const attachments = email.attachments?.length ? ((await receivedAttachments(env, emailId)).data ?? []) : [];
  const stored = attachments.map(async (attachment) => {
    const contentType = attachment.content_type || "application/octet-stream";
    const key = `${base}/${attachment.id}`;
    const size = await storeDownload(env, attachment.download_url, key, contentType);
    return { attachment, key, contentType, size: size || attachment.size || 0 };
  });
  await Promise.all(work);
  const files = await Promise.all(stored);

  const from = parseAddress(header(email.headers, "from") || email.from || "") ?? { name: "", address: email.from ?? "" };
  const textBody = (email.text || (email.html ? htmlToText(email.html) : "")).slice(0, MAX_TEXT);
  const subject = (email.subject ?? "").replace(/[\r\n]+/g, " ").slice(0, 1_000);
  const auth = email.authentication ?? {};
  // A failed DMARC check means the sender's own domain disowns the email.
  const folder = auth.dmarc === "fail" ? "spam" : "inbox";
  const date = email.created_at && !Number.isNaN(Date.parse(email.created_at)) ? new Date(email.created_at).toISOString() : now();
  const time = now();

  const statements: D1PreparedStatement[] = [];
  const filed: { accountId: string; messageId: string }[] = [];
  for (const account of accounts) {
    const messageId = crypto.randomUUID();
    filed.push({ accountId: account.id, messageId });
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO mail_messages (id, account_id, folder, direction, resend_id, message_id, in_reply_to, refs,
           from_name, from_address, to_list, cc_list, reply_to, subject, snippet, text_body, html_key, raw_key,
           has_attachments, auth, date, created_at, updated_at)
         VALUES (?1, ?2, ?3, 'in', ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?21)`,
      ).bind(
        messageId,
        account.id,
        folder,
        emailId,
        (email.message_id ?? header(email.headers, "message-id")).slice(0, 1_000),
        header(email.headers, "in-reply-to"),
        header(email.headers, "references"),
        from.name.slice(0, 300),
        from.address.slice(0, 320),
        JSON.stringify(email.to ?? []),
        JSON.stringify(email.cc ?? []),
        (email.reply_to?.[0] ?? "").slice(0, 320),
        subject,
        snippetOf(textBody),
        textBody,
        htmlKey,
        rawKey,
        files.some(({ attachment }) => attachment.content_disposition !== "inline") ? 1 : 0,
        JSON.stringify({ spf: auth.spf ?? "", dkim: auth.dkim ?? "", dmarc: auth.dmarc ?? "" }),
        date,
        time,
      ),
    );
    for (const { attachment, key, contentType, size } of files) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO mail_attachments (id, account_id, message_id, r2_key, filename, content_type, size, content_id, inline, created_at)
           SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10 WHERE EXISTS (SELECT 1 FROM mail_messages WHERE id = ?3)`,
        ).bind(
          crypto.randomUUID(),
          account.id,
          messageId,
          key,
          (attachment.filename || "attachment").replace(/[\r\n"\\/]/g, "_").slice(0, 255),
          contentType.slice(0, 200),
          size,
          (attachment.content_id ?? "").replace(/^<|>$/g, "").slice(0, 500),
          attachment.content_disposition === "inline" ? 1 : 0,
          time,
        ),
      );
    }
  }
  await env.DB.batch(statements);
  // Junk stays quiet. Notifying happens after Resend gets its answer.
  if (folder === "inbox") ctx.waitUntil(notifyNewMail(env, filed, { from, subject, snippet: snippetOf(textBody) }));
  return accounts.length;
}

/** Tells each mailbox's devices about the email just filed in its inbox. */
async function notifyNewMail(
  env: MailEnv,
  filed: { accountId: string; messageId: string }[],
  email: { from: { name: string; address: string }; subject: string; snippet: string },
): Promise<void> {
  try {
    // Only rows that were really inserted (a retry racing this one inserts nothing), with each inbox's unread count.
    const { results } = await env.DB.prepare(
      `SELECT m.id, m.account_id AS accountId,
         (SELECT COUNT(*) FROM mail_messages u WHERE u.account_id = m.account_id AND u.folder = 'inbox' AND u.is_read = 0) AS unread
       FROM mail_messages m WHERE m.id IN (SELECT value FROM json_each(?1))`,
    )
      .bind(JSON.stringify(filed.map((item) => item.messageId)))
      .all<{ id: string; accountId: string; unread: number }>();
    const title = (email.from.name || email.from.address || "New email").slice(0, 120);
    const body = [email.subject || "(no subject)", email.snippet].filter(Boolean).join("\n").slice(0, 400);
    await notify(
      env,
      results.map((row) => ({
        accountId: row.accountId,
        message: { title, body, url: `#inbox/${encodeURIComponent(row.id)}`, tag: row.id, unread: row.unread },
      })),
    );
  } catch (error) {
    console.error("New mail notifications failed", error);
  }
}
