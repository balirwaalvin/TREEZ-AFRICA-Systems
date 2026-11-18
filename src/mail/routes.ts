import { HttpError } from "../http.ts";
import { changePassword, mailLogin, mailLogout, requireAccount, session, updateSettings } from "./accounts.ts";
import {
  attachmentFile,
  deleteMessages,
  deleteUpload,
  emptyFolder,
  folderCounts,
  getMessage,
  listMessages,
  messageHtml,
  messageOriginal,
  saveDraft,
  sendMessage,
  signedFile,
  updateMessages,
  uploadAttachment,
} from "./messages.ts";
import type { MailEnv } from "./store.ts";

/** Routes under /api/mail. The webhook (/api/mail/inbound) is routed before the same-origin check. */
export async function mailRoute(request: Request, env: MailEnv, url: URL, path: string): Promise<Response> {
  const { method } = request;
  const param = (pattern: RegExp) => {
    const match = path.match(pattern);
    return match ? decodeURIComponent(match[1]!) : null;
  };

  if (path === "/api/mail/login" && method === "POST") return mailLogin(request, env);
  if (path === "/api/mail/logout" && method === "POST") return mailLogout(request, env.DB);
  const fileKey = param(/^\/api\/mail\/files\/([^/]+)$/);
  if (fileKey !== null && method === "GET") return signedFile(url, env, fileKey);

  // Everything else needs a signed-in mailbox, including unknown paths.
  const account = await requireAccount(request, env.DB);
  if (path === "/api/mail/session" && method === "GET") return session(env.DB, account);
  if (path === "/api/mail/account" && method === "PUT") return updateSettings(request, env, account);
  if (path === "/api/mail/account/password" && method === "POST") return changePassword(request, env, account);
  if (path === "/api/mail/folders" && method === "GET") return folderCounts(env, account);
  const emptied = param(/^\/api\/mail\/folders\/([^/]+)\/empty$/);
  if (emptied !== null && method === "POST") return emptyFolder(env, account, emptied);

  if (path === "/api/mail/messages" && method === "GET") return listMessages(url, env, account);
  if (path === "/api/mail/messages" && method === "PATCH") return updateMessages(request, env, account);
  if (path === "/api/mail/messages/delete" && method === "POST") return deleteMessages(request, env, account);
  const messageId = param(/^\/api\/mail\/messages\/([^/]+)$/);
  if (messageId !== null && method === "GET") return getMessage(env, account, messageId);
  const htmlId = param(/^\/api\/mail\/messages\/([^/]+)\/html$/);
  if (htmlId !== null && method === "GET") return messageHtml(env, account, htmlId);
  const originalId = param(/^\/api\/mail\/messages\/([^/]+)\/original$/);
  if (originalId !== null && method === "GET") return messageOriginal(env, account, originalId);
  const attachmentId = param(/^\/api\/mail\/attachments\/([^/]+)$/);
  if (attachmentId !== null && method === "GET") return attachmentFile(env, account, attachmentId);

  if (path === "/api/mail/uploads" && method === "POST") return uploadAttachment(request, env, account);
  const uploadId = param(/^\/api\/mail\/uploads\/([^/]+)$/);
  if (uploadId !== null && method === "DELETE") return deleteUpload(env, account, uploadId);
  if (path === "/api/mail/drafts" && method === "POST") return saveDraft(request, env, account, null);
  const draftId = param(/^\/api\/mail\/drafts\/([^/]+)$/);
  if (draftId !== null && method === "PUT") return saveDraft(request, env, account, draftId);
  if (path === "/api/mail/send" && method === "POST") return sendMessage(request, env, account, url.origin);

  throw new HttpError(404, "Not found.");
}
