-- Devices that asked to be told about new mail (Web Push), at mail.treez.tech.
-- Each one belongs to the sign-in it was turned on from, so signing out, a password change
-- elsewhere or switching the mailbox off stops its notifications along with the session.
CREATE TABLE mail_push_subscriptions (
  endpoint     TEXT PRIMARY KEY,                -- the browser's push service URL for this device
  account_id   TEXT NOT NULL REFERENCES mail_accounts (id) ON DELETE CASCADE,
  session_hash TEXT NOT NULL REFERENCES mail_sessions (token_hash) ON DELETE CASCADE,
  p256dh       TEXT NOT NULL,                   -- the device's public key, base64url
  auth         TEXT NOT NULL,                   -- the device's auth secret, base64url
  created_at   TEXT NOT NULL
);
CREATE INDEX mail_push_subscriptions_account ON mail_push_subscriptions (account_id);
CREATE INDEX mail_push_subscriptions_session ON mail_push_subscriptions (session_hash);
