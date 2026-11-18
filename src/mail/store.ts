import type { ResendEnv } from "./resend.ts";

export interface MailEnv extends ResendEnv {
  DB: D1Database;
  MAIL_FILES: R2Bucket;
  MAIL_DOMAIN: string;
}

export const now = () => new Date().toISOString();

/**
 * Deletes the stored files among `keys` that no message or attachment points at any more.
 * Call it after deleting rows, since an email filed in two mailboxes shares its files.
 */
export async function releaseFiles(env: MailEnv, keys: (string | null | undefined)[]): Promise<void> {
  const wanted = [...new Set(keys.filter((key): key is string => !!key))];
  if (!wanted.length) return;
  const { results } = await env.DB.prepare(
    `WITH wanted AS (SELECT value AS key FROM json_each(?1))
     SELECT r2_key AS key FROM mail_attachments WHERE r2_key IN (SELECT key FROM wanted)
     UNION SELECT html_key FROM mail_messages WHERE html_key IN (SELECT key FROM wanted)
     UNION SELECT raw_key FROM mail_messages WHERE raw_key IN (SELECT key FROM wanted)`,
  )
    .bind(JSON.stringify(wanted))
    .all<{ key: string }>();
  const kept = new Set(results.map((row) => row.key));
  const unused = wanted.filter((key) => !kept.has(key));
  for (let i = 0; i < unused.length; i += 1000) await env.MAIL_FILES.delete(unused.slice(i, i + 1000));
}

/** Every stored file the messages matching `where` use: HTML bodies, original emails and attachments. */
export async function filesOf(env: MailEnv, where: string, ...values: unknown[]): Promise<string[]> {
  const { results } = await env.DB.prepare(
    `WITH chosen AS (SELECT id, html_key, raw_key FROM mail_messages WHERE ${where})
     SELECT html_key AS key FROM chosen WHERE html_key IS NOT NULL
     UNION SELECT raw_key FROM chosen WHERE raw_key IS NOT NULL
     UNION SELECT r2_key FROM mail_attachments WHERE message_id IN (SELECT id FROM chosen)`,
  )
    .bind(...values)
    .all<{ key: string }>();
  return results.map((row) => row.key);
}
