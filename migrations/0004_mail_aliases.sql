-- Extra addresses delivered to a mailbox, e.g. care@treez.tech landing in balirwa@treez.tech's inbox.
-- The mailbox can also send as these addresses.
CREATE TABLE mail_aliases (
  address    TEXT PRIMARY KEY COLLATE NOCASE,   -- e.g. care@treez.tech
  account_id TEXT NOT NULL REFERENCES mail_accounts (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
CREATE INDEX mail_aliases_account ON mail_aliases (account_id);
