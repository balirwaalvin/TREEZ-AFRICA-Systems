-- Mailboxes for treez.tech addresses, used at /mail/. Mail is sent and received through Resend.
-- Message bodies (HTML) and attachment files live in the R2 bucket bound as MAIL_FILES.

-- One row per address, each with its own password. Created by admins, never by sign-up.
CREATE TABLE mail_accounts (
  id            TEXT PRIMARY KEY,
  address       TEXT NOT NULL UNIQUE COLLATE NOCASE,  -- e.g. care@treez.tech
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  signature     TEXT NOT NULL DEFAULT '',
  disabled      INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
  last_login_at TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- Only a hash of each session token is stored, as for admins.
CREATE TABLE mail_sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES mail_accounts (id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX mail_sessions_expires_at ON mail_sessions (expires_at);
CREATE INDEX mail_sessions_account ON mail_sessions (account_id);

-- Every email in every mailbox. An email received by two mailboxes is two rows.
CREATE TABLE mail_messages (
  id              TEXT PRIMARY KEY,
  account_id      TEXT NOT NULL REFERENCES mail_accounts (id) ON DELETE CASCADE,
  folder          TEXT NOT NULL CHECK (folder IN ('inbox', 'sent', 'drafts', 'archive', 'spam', 'trash')),
  direction       TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  resend_id       TEXT,                           -- Resend's id for the received or sent email
  message_id      TEXT NOT NULL DEFAULT '',       -- the email's Message-ID header
  in_reply_to     TEXT NOT NULL DEFAULT '',
  refs            TEXT NOT NULL DEFAULT '',       -- the References header
  from_name       TEXT NOT NULL DEFAULT '',
  from_address    TEXT NOT NULL DEFAULT '',
  to_list         TEXT NOT NULL DEFAULT '[]',     -- JSON: ["Name <a@b.c>", ...]
  cc_list         TEXT NOT NULL DEFAULT '[]',
  bcc_list        TEXT NOT NULL DEFAULT '[]',
  reply_to        TEXT NOT NULL DEFAULT '',
  subject         TEXT NOT NULL DEFAULT '',
  snippet         TEXT NOT NULL DEFAULT '',
  text_body       TEXT NOT NULL DEFAULT '',
  html_key        TEXT,                           -- R2 key of the HTML body, if it has one
  has_attachments INTEGER NOT NULL DEFAULT 0,
  is_read         INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  is_starred      INTEGER NOT NULL DEFAULT 0 CHECK (is_starred IN (0, 1)),
  auth            TEXT NOT NULL DEFAULT '',       -- JSON: SPF/DKIM/DMARC results for received mail
  delivery        TEXT NOT NULL DEFAULT '',       -- sent mail: sent, delivered, bounced, complained, delayed
  date            TEXT NOT NULL,                  -- received or sent time; drafts use their last edit
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX mail_messages_folder ON mail_messages (account_id, folder, date DESC);
CREATE INDEX mail_messages_starred ON mail_messages (account_id, is_starred, date DESC);
CREATE INDEX mail_messages_resend ON mail_messages (resend_id);
-- Resend retries webhooks, so the same received email must never be filed twice in one mailbox.
CREATE UNIQUE INDEX mail_messages_received_once ON mail_messages (account_id, resend_id) WHERE direction = 'in';

-- Files attached to messages. Uploads waiting to be sent have no message yet.
-- Several rows can share one R2 object (an email sent to two mailboxes, or forwarded),
-- so an object is only deleted once no row points at it.
CREATE TABLE mail_attachments (
  id           TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL REFERENCES mail_accounts (id) ON DELETE CASCADE,
  message_id   TEXT REFERENCES mail_messages (id) ON DELETE CASCADE,
  r2_key       TEXT NOT NULL,
  filename     TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size         INTEGER NOT NULL DEFAULT 0,
  content_id   TEXT NOT NULL DEFAULT '',
  inline       INTEGER NOT NULL DEFAULT 0 CHECK (inline IN (0, 1)),
  created_at   TEXT NOT NULL
);
CREATE INDEX mail_attachments_message ON mail_attachments (message_id);
CREATE INDEX mail_attachments_key ON mail_attachments (r2_key);
CREATE INDEX mail_attachments_unsent ON mail_attachments (account_id, created_at) WHERE message_id IS NULL;
