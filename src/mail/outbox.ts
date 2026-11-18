import { snippetOf } from "./text.ts";
import { now, type MailEnv } from "./store.ts";

/**
 * Files a copy of an email the site sent by itself (a receipt, say) in the Sent folder of the
 * mailbox it came from, so it can be found at /mail/ like any other sent email. Nothing is
 * filed when no mailbox owns the address.
 */
export async function fileSentCopy(
  env: MailEnv,
  email: {
    from: string;
    fromName: string;
    to: string[];
    subject: string;
    text: string;
    resendId: string;
    attachment?: { filename: string; contentType: string; bytes: Uint8Array };
  },
): Promise<void> {
  const account = await env.DB.prepare(
    "SELECT id FROM mail_accounts WHERE address = ?1 OR id IN (SELECT account_id FROM mail_aliases WHERE address = ?1)",
  )
    .bind(email.from.toLowerCase())
    .first<{ id: string }>();
  if (!account) return;

  const id = crypto.randomUUID();
  const time = now();
  const statements = [
    env.DB.prepare(
      `INSERT INTO mail_messages (id, account_id, folder, direction, resend_id, from_name, from_address, to_list, subject, snippet,
         text_body, has_attachments, is_read, delivery, date, created_at, updated_at)
       VALUES (?1, ?2, 'sent', 'out', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 1, 'sent', ?11, ?11, ?11)`,
    ).bind(id, account.id, email.resendId, email.fromName, email.from, JSON.stringify(email.to), email.subject, snippetOf(email.text), email.text, email.attachment ? 1 : 0, time),
  ];
  if (email.attachment) {
    const key = `out/${account.id}/${crypto.randomUUID()}`;
    await env.MAIL_FILES.put(key, email.attachment.bytes, { httpMetadata: { contentType: email.attachment.contentType } });
    statements.push(
      env.DB.prepare(
        `INSERT INTO mail_attachments (id, account_id, message_id, r2_key, filename, content_type, size, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      ).bind(crypto.randomUUID(), account.id, id, key, email.attachment.filename, email.attachment.contentType, email.attachment.bytes.length, time),
    );
  }
  await env.DB.batch(statements);
}
