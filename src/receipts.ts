import { HttpError, json, readBody, text } from "./http.ts";
import { SmtpError, sendMail, type SmtpConfig } from "./smtp.ts";

export interface ReceiptEnv {
  DB: D1Database;
  SMTP_HOST: string;
  SMTP_PORT: string;
  SMTP_USER: string;
  SMTP_PASSWORD?: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ITEMS = 50;
const MAX_CENTS = 1e13; // ten billion units of any currency is far beyond a real invoice
const MAX_PDF_BYTES = 5 * 1024 * 1024;
const LIST_LIMIT = 2000;

const INVOICE_COLUMNS = `id, number, currency, client_name AS clientName, client_address AS clientAddress,
  client_email AS clientEmail, client_phone AS clientPhone, items, created_at AS createdAt, updated_at AS updatedAt`;
const RECEIPT_COLUMNS = `id, invoice_id AS invoiceId, number, paid_on AS paidOn, amount, channel,
  sent_at AS sentAt, sent_to AS sentTo, created_at AS createdAt`;

interface Item {
  description: string;
  quantity: number;
  unitPrice: number;
}

interface Invoice {
  id: string;
  number: string;
  currency: string;
  clientName: string;
  clientAddress: string;
  clientEmail: string;
  clientPhone: string;
  items: Item[];
  createdAt: string;
  updatedAt: string;
}

interface Receipt {
  id: string;
  invoiceId: string;
  number: string;
  paidOn: string;
  amount: number;
  channel: string;
  sentAt: string | null;
  sentTo: string;
  createdAt: string;
}

type InvoiceRow = Omit<Invoice, "items"> & { items: string };
const toInvoice = (row: InvoiceRow): Invoice => ({ ...row, items: JSON.parse(row.items) as Item[] });

const lineAmount = (item: Item) => Math.round(item.quantity * item.unitPrice);
export const invoiceTotal = (items: Item[]) => items.reduce((sum, item) => sum + lineAmount(item), 0);

// ---- Formatting, matching the eReceipt template ----

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-10-02" → "October 2, 2026" */
export function longDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return `${MONTHS[(month ?? 1) - 1]} ${day}, ${year}`;
}

/** 120000000, "UGX" → "UGX1,200,000.00" */
export function money(cents: number, currency: string): string {
  const sign = cents < 0 ? "-" : "";
  const whole = Math.floor(Math.abs(cents) / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${currency}${whole}.${String(Math.abs(cents) % 100).padStart(2, "0")}`;
}

// ---- Validation ----

function cents(value: unknown, label: string, { allowZero = false } = {}): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || (!allowZero && value === 0) || value > MAX_CENTS) {
    throw new HttpError(400, `${label} must be ${allowZero ? "zero or more" : "more than zero"}.`);
  }
  return value;
}

function items(value: unknown): Item[] {
  if (!Array.isArray(value) || !value.length) throw new HttpError(400, "Add at least one item.");
  if (value.length > MAX_ITEMS) throw new HttpError(400, `An invoice can have at most ${MAX_ITEMS} items.`);
  return value.map((raw, index) => {
    if (typeof raw !== "object" || raw === null) throw new HttpError(400, `Item ${index + 1} is not valid.`);
    const item = raw as Record<string, unknown>;
    const quantity = item.quantity;
    if (typeof quantity !== "number" || !(quantity > 0) || quantity > 1_000_000 || Math.round(quantity * 100) !== quantity * 100) {
      throw new HttpError(400, `Item ${index + 1}: quantity must be more than zero, with at most two decimals.`);
    }
    return {
      description: text(item, "description", `Item ${index + 1} description`, { required: true, max: 500 }),
      quantity,
      unitPrice: cents(item.unitPrice, `Item ${index + 1} unit price`, { allowZero: true }),
    };
  });
}

function invoiceFields(body: Record<string, unknown>) {
  const currency = text(body, "currency", "Currency", { required: true, max: 3 }).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new HttpError(400, "Currency must be a three-letter code such as UGX.");
  const clientEmail = text(body, "clientEmail", "Client email", { required: true, max: 254 });
  if (!EMAIL.test(clientEmail)) throw new HttpError(400, "Please enter a valid client email address.");
  const lineItems = items(body.items);
  if (invoiceTotal(lineItems) <= 0) throw new HttpError(400, "The invoice total must be more than zero.");
  return {
    number: text(body, "number", "Invoice number", { required: true, max: 40 }),
    currency,
    clientName: text(body, "clientName", "Client name", { required: true, max: 200 }),
    clientAddress: text(body, "clientAddress", "Client address", { max: 1_000 }),
    clientEmail,
    clientPhone: text(body, "clientPhone", "Client phone", { max: 60 }),
    items: lineItems,
  };
}

function receiptFields(body: Record<string, unknown>) {
  const paidOn = text(body, "paidOn", "Date paid", { required: true, max: 10 });
  const parsed = new Date(`${paidOn}T00:00:00Z`);
  if (!DATE.test(paidOn) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== paidOn) {
    throw new HttpError(400, "Date paid is not a valid date.");
  }
  // A day of slack covers time zones ahead of UTC.
  if (parsed.getTime() > Date.now() + 24 * 60 * 60 * 1000) throw new HttpError(400, "Date paid can't be in the future.");
  return {
    number: text(body, "number", "Receipt number", { required: true, max: 40 }),
    paidOn,
    amount: cents(body.amount, "Amount paid"),
    channel: text(body, "channel", "Payment channel", { required: true, max: 120 }),
  };
}

function object(body: Record<string, unknown>, field: string, label: string): Record<string, unknown> {
  const value = body[field];
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new HttpError(400, `${label} is missing.`);
  return value as Record<string, unknown>;
}

/** Turns a UNIQUE constraint failure into a message naming the clashing number. */
function duplicateNumber(error: unknown, invoiceNumber: string, receiptNumber?: string): never {
  const message = String((error as Error)?.message ?? "");
  if (message.includes("UNIQUE") && message.includes("invoices.number")) {
    throw new HttpError(409, `Invoice number ${invoiceNumber} is already used. Choose another number.`);
  }
  if (message.includes("UNIQUE") && message.includes("receipts.number")) {
    throw new HttpError(409, `Receipt number ${receiptNumber} is already used. Choose another number.`);
  }
  throw error;
}

// ---- Queries ----

async function findInvoice(env: ReceiptEnv, id: string): Promise<Invoice> {
  const row = await env.DB.prepare(`SELECT ${INVOICE_COLUMNS} FROM invoices WHERE id = ?1`).bind(id).first<InvoiceRow>();
  if (!row) throw new HttpError(404, "That invoice no longer exists.");
  return toInvoice(row);
}

async function paidSoFar(env: ReceiptEnv, invoiceId: string): Promise<number> {
  const row = await env.DB.prepare("SELECT COALESCE(SUM(amount), 0) AS paid FROM receipts WHERE invoice_id = ?1").bind(invoiceId).first<{ paid: number }>();
  return row?.paid ?? 0;
}

/** Payments on the receipt's invoice up to and including this one, oldest first. */
async function history(env: ReceiptEnv, receipt: Receipt): Promise<Receipt[]> {
  const { results } = await env.DB.prepare(
    `SELECT ${RECEIPT_COLUMNS} FROM receipts
     WHERE invoice_id = ?1 AND (paid_on < ?2 OR (paid_on = ?2 AND created_at <= ?3))
     ORDER BY paid_on, created_at`,
  )
    .bind(receipt.invoiceId, receipt.paidOn, receipt.createdAt)
    .all<Receipt>();
  return results;
}

// ---- Handlers ----

export async function listReceipts(env: ReceiptEnv): Promise<Response> {
  const [invoices, receipts] = await env.DB.batch([
    env.DB.prepare(`SELECT ${INVOICE_COLUMNS} FROM invoices ORDER BY created_at DESC LIMIT ${LIST_LIMIT}`),
    env.DB.prepare(`SELECT ${RECEIPT_COLUMNS} FROM receipts ORDER BY created_at DESC LIMIT ${LIST_LIMIT}`),
  ]);
  return json({
    invoices: ((invoices?.results ?? []) as InvoiceRow[]).map(toInvoice),
    receipts: receipts?.results ?? [],
  });
}

/**
 * Records a payment. The body carries the invoice too: with an `id` it updates that invoice's
 * details, without one it creates the invoice. Both rows are written in one batch.
 */
export async function createReceipt(request: Request, env: ReceiptEnv): Promise<Response> {
  const body = await readBody(request, 200_000);
  const invoiceBody = object(body, "invoice", "Invoice");
  const invoice = invoiceFields(invoiceBody);
  const payment = receiptFields(object(body, "receipt", "Receipt"));
  const now = new Date().toISOString();
  const total = invoiceTotal(invoice.items);

  const existingId = typeof invoiceBody.id === "string" && invoiceBody.id ? invoiceBody.id : null;
  let invoiceId = existingId ?? crypto.randomUUID();
  let createdAt = now;
  let paid = 0;
  if (existingId) {
    const existing = await findInvoice(env, existingId);
    invoiceId = existing.id;
    createdAt = existing.createdAt;
    paid = await paidSoFar(env, existingId);
    // Back-dating a payment would change the payment history on receipts already sent.
    const latest = await env.DB.prepare("SELECT MAX(paid_on) AS paidOn FROM receipts WHERE invoice_id = ?1").bind(existingId).first<{ paidOn: string | null }>();
    if (latest?.paidOn && payment.paidOn < latest.paidOn) {
      throw new HttpError(400, `Date paid can't be before the last payment on this invoice (${longDate(latest.paidOn)}).`);
    }
  }
  const balance = total - paid;
  if (payment.amount > balance) {
    throw new HttpError(
      400,
      balance > 0
        ? `This payment is more than the balance of ${money(balance, invoice.currency)}.`
        : "This invoice is already paid in full.",
    );
  }

  const receiptId = crypto.randomUUID();
  const invoiceStatement = existingId
    ? env.DB.prepare(
        `UPDATE invoices SET number = ?1, currency = ?2, client_name = ?3, client_address = ?4, client_email = ?5,
           client_phone = ?6, items = ?7, updated_at = ?8 WHERE id = ?9`,
      ).bind(invoice.number, invoice.currency, invoice.clientName, invoice.clientAddress, invoice.clientEmail, invoice.clientPhone, JSON.stringify(invoice.items), now, invoiceId)
    : env.DB.prepare(
        `INSERT INTO invoices (id, number, currency, client_name, client_address, client_email, client_phone, items, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)`,
      ).bind(invoiceId, invoice.number, invoice.currency, invoice.clientName, invoice.clientAddress, invoice.clientEmail, invoice.clientPhone, JSON.stringify(invoice.items), now);

  try {
    await env.DB.batch([
      invoiceStatement,
      env.DB.prepare(
        `INSERT INTO receipts (id, invoice_id, number, paid_on, amount, channel, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
      ).bind(receiptId, invoiceId, payment.number, payment.paidOn, payment.amount, payment.channel, now),
    ]);
  } catch (error) {
    duplicateNumber(error, invoice.number, payment.number);
  }

  const receipt = await env.DB.prepare(`SELECT ${RECEIPT_COLUMNS} FROM receipts WHERE id = ?1`).bind(receiptId).first<Receipt>();
  return json({ invoice: { id: invoiceId, ...invoice, createdAt, updatedAt: now }, receipt }, { status: 201 });
}

/** Edits an invoice's client details or items. The total can't drop below what has been paid. */
export async function updateInvoice(request: Request, env: ReceiptEnv, id: string): Promise<Response> {
  const invoice = invoiceFields(await readBody(request, 200_000));
  const existing = await findInvoice(env, id);
  const paid = await paidSoFar(env, id);
  if (invoiceTotal(invoice.items) < paid) {
    throw new HttpError(400, `The total can't be less than the ${money(paid, invoice.currency)} already paid.`);
  }
  const now = new Date().toISOString();
  try {
    await env.DB.prepare(
      `UPDATE invoices SET number = ?1, currency = ?2, client_name = ?3, client_address = ?4, client_email = ?5,
         client_phone = ?6, items = ?7, updated_at = ?8 WHERE id = ?9`,
    )
      .bind(invoice.number, invoice.currency, invoice.clientName, invoice.clientAddress, invoice.clientEmail, invoice.clientPhone, JSON.stringify(invoice.items), now, id)
      .run();
  } catch (error) {
    duplicateNumber(error, invoice.number);
  }
  return json({ id, ...invoice, createdAt: existing.createdAt, updatedAt: now });
}

/**
 * Deletes a receipt that was never emailed, e.g. one saved by mistake. Sent receipts are the
 * client's record of payment, so they stay. An invoice left with no receipts goes too.
 */
export async function deleteReceipt(env: ReceiptEnv, id: string): Promise<Response> {
  const receipt = await env.DB.prepare(`SELECT ${RECEIPT_COLUMNS} FROM receipts WHERE id = ?1`).bind(id).first<Receipt>();
  if (!receipt) throw new HttpError(404, "That receipt no longer exists.");
  if (receipt.sentAt) throw new HttpError(409, "This receipt has already been sent to the client, so it can't be deleted.");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM receipts WHERE id = ?1 AND sent_at IS NULL").bind(id),
    env.DB.prepare("DELETE FROM invoices WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM receipts WHERE invoice_id = ?1)").bind(receipt.invoiceId),
  ]);
  return json({ ok: true });
}

/**
 * Emails the receipt to the client with the PDF the admin previewed attached, and a copy to the
 * receipts mailbox. The PDF is made in the admin's browser; see public/js/receipt-pdf.js.
 */
export async function sendReceipt(request: Request, env: ReceiptEnv, id: string): Promise<Response> {
  const body = await readBody(request, Math.ceil((MAX_PDF_BYTES * 4) / 3) + 10_000);
  const receipt = await env.DB.prepare(`SELECT ${RECEIPT_COLUMNS} FROM receipts WHERE id = ?1`).bind(id).first<Receipt>();
  if (!receipt) throw new HttpError(404, "That receipt no longer exists.");
  const invoice = await findInvoice(env, receipt.invoiceId);
  const pdf = decodePdf(body.pdf);

  if (!env.SMTP_PASSWORD) {
    throw new HttpError(503, "Email isn't set up yet: the password for the receipts mailbox hasn't been added to Cloudflare. The receipt is saved, so you can send it once that's done.");
  }

  const payments = await history(env, receipt);
  const paid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const balance = invoiceTotal(invoice.items) - paid;
  const config: SmtpConfig = {
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT),
    user: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
    // Only a local test server runs without TLS; Titan always uses it.
    secure: !["localhost", "127.0.0.1"].includes(env.SMTP_HOST),
  };

  try {
    await sendMail(config, {
      from: { name: "TREEZ AFRICA SYSTEMS", email: env.SMTP_USER },
      to: invoice.clientEmail,
      bcc: [env.SMTP_USER],
      replyTo: env.SMTP_USER,
      subject: `Your receipt ${receipt.number} from TREEZ AFRICA SYSTEMS`,
      ...receiptEmail(invoice, receipt, paid, balance),
      attachments: [{ filename: `Receipt-${receipt.number.replace(/\s+/g, "-")}.pdf`, contentType: "application/pdf", content: pdf }],
    });
  } catch (error) {
    if (!(error instanceof SmtpError)) throw error;
    console.error("Receipt email failed", error.code, error.message);
    if (error.code === 535) throw new HttpError(502, "Titan refused to sign in to the receipts mailbox. Check that the mailbox password saved in Cloudflare is current.");
    if (error.code === 0) throw new HttpError(502, `Couldn't reach Titan's mail server (${error.message}) Please try again.`);
    throw new HttpError(502, `Titan didn't accept the email: ${error.message}`);
  }

  const sentAt = new Date().toISOString();
  const updated = await env.DB.prepare(`UPDATE receipts SET sent_at = ?1, sent_to = ?2 WHERE id = ?3 RETURNING ${RECEIPT_COLUMNS}`)
    .bind(sentAt, invoice.clientEmail, id)
    .first<Receipt>();
  return json(updated);
}

function decodePdf(value: unknown): Uint8Array {
  if (typeof value !== "string" || !value) throw new HttpError(400, "The receipt PDF is missing.");
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  } catch {
    throw new HttpError(400, "The receipt PDF could not be read.");
  }
  if (bytes.length > MAX_PDF_BYTES) throw new HttpError(413, "The receipt PDF is too large.");
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") throw new HttpError(400, "The receipt file is not a PDF.");
  return bytes;
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);

function receiptEmail(invoice: Invoice, receipt: Receipt, paid: number, balance: number) {
  const amount = money(receipt.amount, invoice.currency);
  const date = longDate(receipt.paidOn);
  const rows: [string, string][] = [
    ["Receipt number", receipt.number],
    ["Invoice number", invoice.number],
    ["Amount received", amount],
    ["Date paid", date],
    ["Payment channel", receipt.channel],
    ["Total paid to date", money(paid, invoice.currency)],
    ["Balance", balance > 0 ? money(balance, invoice.currency) : "Paid in full"],
  ];

  const text = [
    `Dear ${invoice.clientName},`,
    "",
    `Thank you for your payment. We received ${amount} on ${date} for invoice ${invoice.number}.`,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    "Your eReceipt is attached as a PDF.",
    "If anything looks wrong, just reply to this email.",
    "",
    "TREEZ AFRICA SYSTEMS",
    "Namirembe Road, Kampala, Uganda",
    "https://treez.tech",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en"><body style="margin:0;padding:0;background:#f4f5f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e3e5e8;border-radius:6px;font-family:Arial,Helvetica,sans-serif;color:#1d2228;">
<tr><td style="padding:28px 32px 8px;">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8a6a12;">TREEZ AFRICA SYSTEMS</p>
<h1 style="margin:0;font-size:22px;line-height:1.3;">${escapeHtml(amount)} received</h1>
</td></tr>
<tr><td style="padding:16px 32px 4px;font-size:15px;line-height:1.6;">
<p style="margin:0 0 12px;">Dear ${escapeHtml(invoice.clientName)},</p>
<p style="margin:0 0 16px;">Thank you for your payment. We received <strong>${escapeHtml(amount)}</strong> on ${escapeHtml(date)} for invoice ${escapeHtml(invoice.number)}.</p>
</td></tr>
<tr><td style="padding:0 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-top:1px solid #e3e5e8;">
${rows
  .map(
    ([label, value]) =>
      `<tr><td style="padding:9px 0;border-bottom:1px solid #eef0f2;color:#5c6670;">${escapeHtml(label)}</td><td align="right" style="padding:9px 0;border-bottom:1px solid #eef0f2;font-weight:bold;">${escapeHtml(value)}</td></tr>`,
  )
  .join("\n")}
</table>
</td></tr>
<tr><td style="padding:20px 32px 28px;font-size:14px;line-height:1.6;color:#3a424b;">
<p style="margin:0 0 8px;">Your eReceipt is attached as a PDF.</p>
<p style="margin:0;">If anything looks wrong, just reply to this email.</p>
</td></tr>
</table>
<p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8a9199;">TREEZ AFRICA SYSTEMS · Namirembe Road, Kampala, Uganda · <a href="https://treez.tech" style="color:#8a9199;">treez.tech</a></p>
</td></tr></table>
</body></html>`;

  return { text, html };
}
