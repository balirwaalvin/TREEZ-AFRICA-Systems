-- Invoices and the payment receipts issued against them.
-- Money is stored in whole cents (UGX 1,200,000.00 is 120000000) so totals never drift.

CREATE TABLE invoices (
  id             TEXT PRIMARY KEY,
  number         TEXT NOT NULL UNIQUE,            -- e.g. TAH-20260929-001
  currency       TEXT NOT NULL DEFAULT 'UGX',
  client_name    TEXT NOT NULL,
  client_address TEXT NOT NULL DEFAULT '',        -- one line per address line
  client_email   TEXT NOT NULL,
  client_phone   TEXT NOT NULL DEFAULT '',
  items          TEXT NOT NULL,                   -- JSON: [{ "description", "quantity", "unitPrice" (cents) }]
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX invoices_created_at ON invoices (created_at DESC);

-- One row per payment. A receipt's payment history is every receipt on the same
-- invoice paid on or before it, so earlier receipts never change once issued.
CREATE TABLE receipts (
  id         TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices (id),
  number     TEXT NOT NULL UNIQUE,                -- e.g. TAH 8989 4402
  paid_on    TEXT NOT NULL,                       -- YYYY-MM-DD
  amount     INTEGER NOT NULL CHECK (amount > 0), -- cents
  channel    TEXT NOT NULL,                       -- e.g. ABSA Bank (U) Limited
  sent_at    TEXT,                                -- set once emailed to the client
  sent_to    TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX receipts_invoice ON receipts (invoice_id, paid_on, created_at);
CREATE INDEX receipts_created_at ON receipts (created_at DESC);
