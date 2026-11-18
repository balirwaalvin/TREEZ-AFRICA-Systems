#!/usr/bin/env node
// Local stand-ins for the mail services, for trying receipts and mailboxes without emailing anyone.
//   npm run mail-catcher        (terminal 1)
//   npm run dev:mail-test       (terminal 2: the site, sending here instead of Titan and Resend)
//
// 127.0.0.1:2525 plays Titan's SMTP server: every receipt is saved to mail-catcher/<time>.eml.
// 127.0.0.1:2526 plays Resend's API: every mailbox email is saved to mail-catcher/<time>-sent.json.
//   Sent mail addressed to @treez.tech comes straight back in, as if received.
//   To pretend someone emailed a mailbox:
//     curl -X POST http://127.0.0.1:2526/inject -H 'Content-Type: application/json' \
//       -d '{"from":"Jane <jane@example.com>","to":["care@treez.tech"],"subject":"Hello","text":"Hi there"}'
//   The webhook goes to SITE_URL (default http://localhost:5173), or to "site" in the request.
import { createHmac, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'node:net';
import { join } from 'node:path';

const SMTP_PORT = 2525;
const RESEND_PORT = 2526;
const RESEND_KEY = 're_mail_test';
// Matches RESEND_WEBHOOK_SECRET in mail-test mode (cloudflare.config.ts).
const WEBHOOK_SECRET = 'whsec_bWFpbC10ZXN0LXdlYmhvb2stc2VjcmV0';
const MAIL_DOMAIN = 'treez.tech';
const SITE_URL = process.env.SITE_URL ?? 'http://localhost:5173';
const OUT = join(process.cwd(), 'mail-catcher');
mkdirSync(OUT, { recursive: true });
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

// ---- SMTP (receipts) ----

createServer((socket) => {
  let buffer = '';
  let data = null; // collecting a message body after DATA
  const reply = (line) => socket.write(`${line}\r\n`);
  reply('220 mail-catcher ready');

  socket.on('data', (chunk) => {
    buffer += chunk.toString('latin1');
    for (;;) {
      if (data !== null) {
        const end = buffer.indexOf('\r\n.\r\n');
        if (end === -1) return;
        data += buffer.slice(0, end);
        buffer = buffer.slice(end + 5);
        const file = join(OUT, `${stamp()}.eml`);
        // Undo the sender's dot-stuffing.
        writeFileSync(file, Buffer.from(data.replace(/^\.\./gm, '.'), 'latin1'));
        console.log(`saved ${file}`);
        data = null;
        reply('250 Queued');
        continue;
      }
      const end = buffer.indexOf('\r\n');
      if (end === -1) return;
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const command = line.toUpperCase();
      console.log(`> ${command.startsWith('AUTH') ? 'AUTH …' : line}`);
      if (command.startsWith('EHLO')) { reply('250-mail-catcher'); reply('250 AUTH PLAIN'); }
      else if (command.startsWith('AUTH')) reply('235 Accepted');
      else if (command.startsWith('MAIL FROM') || command.startsWith('RCPT TO')) reply('250 OK');
      else if (command === 'DATA') { data = ''; reply('354 Send the message, end with .'); }
      else if (command === 'QUIT') { reply('221 Bye'); socket.end(); return; }
      else reply('502 Not supported');
    }
  });
  socket.on('error', () => {});
}).listen(SMTP_PORT, '127.0.0.1', () => console.log(`SMTP catcher on 127.0.0.1:${SMTP_PORT}, saving to ${OUT}`));

// ---- Resend API ----

const received = new Map(); // email id → { email, files: Map(attachment id → { meta, content }), raw }
const base = `http://127.0.0.1:${RESEND_PORT}`;

function sign(id, timestamp, body) {
  const key = Buffer.from(WEBHOOK_SECRET.replace(/^whsec_/, ''), 'base64');
  return `v1,${createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')}`;
}

async function webhook(site, event) {
  const body = JSON.stringify(event);
  const id = `msg_${randomUUID()}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const response = await fetch(`${site}/api/mail/inbound`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': sign(id, timestamp, body) },
    body
  });
  const answer = await response.text();
  console.log(`webhook ${event.type} → ${response.status} ${answer}`);
  return { status: response.status, body: answer };
}

const list = (value) => (value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]);

/** Pretends an email arrived at Resend, then tells the site about it. */
async function receive(input, site = SITE_URL) {
  const id = randomUUID();
  const files = new Map();
  const attachments = list(input.attachments).map((attachment) => {
    const attachmentId = randomUUID();
    const content = Buffer.from(attachment.content ?? '', 'base64');
    const meta = {
      id: attachmentId,
      filename: attachment.filename ?? 'file.bin',
      content_type: attachment.content_type ?? 'application/octet-stream',
      content_disposition: attachment.inline ? 'inline' : 'attachment',
      content_id: attachment.content_id ?? null,
      size: content.length
    };
    files.set(attachmentId, { meta, content });
    return meta;
  });
  const email = {
    object: 'email',
    id,
    to: list(input.to),
    cc: list(input.cc),
    bcc: list(input.bcc),
    reply_to: list(input.reply_to),
    from: input.from ?? 'Someone <someone@example.com>',
    subject: input.subject ?? '(no subject)',
    html: input.html ?? null,
    text: input.text ?? null,
    headers: { from: input.from ?? 'Someone <someone@example.com>', ...(input.headers ?? {}) },
    message_id: input.message_id ?? `<${id}@example.com>`,
    created_at: new Date().toISOString(),
    authentication: { spf: 'pass', dkim: 'pass', dmarc: input.dmarc ?? 'pass' },
    raw: { download_url: `${base}/raw/${id}`, expires_at: new Date(Date.now() + 3600e3).toISOString() },
    attachments
  };
  const raw = `From: ${email.from}\r\nTo: ${email.to.join(', ')}\r\nSubject: ${email.subject}\r\nMessage-ID: ${email.message_id}\r\n\r\n${email.text ?? email.html ?? ''}\r\n`;
  received.set(id, { email, files, raw });
  const result = await webhook(site, {
    type: 'email.received',
    created_at: email.created_at,
    data: {
      email_id: id, created_at: email.created_at, from: email.from, to: email.to, cc: email.cc, bcc: email.bcc,
      received_for: list(input.received_for ?? [...email.to, ...email.cc, ...email.bcc]),
      message_id: email.message_id, subject: email.subject,
      attachments: attachments.map(({ id: aid, filename, content_type, content_disposition, content_id }) => ({ id: aid, filename, content_type, content_disposition, content_id }))
    }
  });
  return { id, webhook: result };
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (error) { reject(error); }
    });
    request.on('error', reject);
  });
}

createHttpServer(async (request, response) => {
  const send = (status, data, type = 'application/json') => {
    response.writeHead(status, { 'Content-Type': type });
    response.end(type === 'application/json' ? JSON.stringify(data) : data);
  };
  const url = new URL(request.url, base);
  const parts = url.pathname.split('/').filter(Boolean);
  try {
    // Unauthenticated: test helpers and the signed download links.
    if (request.method === 'POST' && url.pathname === '/inject') {
      const input = await readJson(request);
      return send(200, await receive(input, input.site ?? SITE_URL));
    }
    if (request.method === 'POST' && url.pathname === '/event') {
      const { site = SITE_URL, ...event } = await readJson(request);
      return send(200, await webhook(site, event));
    }
    if (request.method === 'GET' && parts[0] === 'raw') {
      const stored = received.get(parts[1]);
      return stored ? send(200, stored.raw, 'message/rfc822') : send(404, { message: 'Not found' });
    }
    if (request.method === 'GET' && parts[0] === 'files') {
      const file = received.get(parts[1])?.files.get(parts[2]);
      if (!file) return send(404, { message: 'Not found' });
      response.writeHead(200, { 'Content-Type': file.meta.content_type, 'Content-Length': file.content.length });
      return response.end(file.content);
    }

    if (request.headers.authorization !== `Bearer ${RESEND_KEY}`) return send(401, { message: 'API key is invalid' });

    if (request.method === 'POST' && url.pathname === '/emails') {
      const email = await readJson(request);
      const id = randomUUID();
      // Resend fetches each attachment from its link, so this checks the site's signed links work.
      const fetched = [];
      for (const attachment of email.attachments ?? []) {
        const file = await fetch(attachment.path);
        const content = Buffer.from(await file.arrayBuffer());
        fetched.push({ filename: attachment.filename, content_type: attachment.content_type, status: file.status, size: content.length, content: content.toString('base64') });
      }
      const file = join(OUT, `${stamp()}-sent.json`);
      writeFileSync(file, JSON.stringify({ id, idempotencyKey: request.headers['idempotency-key'], ...email, attachments: fetched }, null, 2));
      console.log(`saved ${file}`);
      if (fetched.some((attachment) => attachment.status !== 200)) return send(422, { message: 'An attachment link could not be downloaded.' });

      // Mail to our own domain loops back in, as Resend would deliver it to the MX.
      const site = email.attachments?.[0]?.path ? new URL(email.attachments[0].path).origin : (request.headers['x-site'] ?? SITE_URL);
      const local = [...list(email.to), ...list(email.cc), ...list(email.bcc)].filter((address) => new RegExp(`@${MAIL_DOMAIN.replace('.', '\\.')}>?$`, 'i').test(address));
      setTimeout(async () => {
        try {
          if (local.length) {
            await receive({
              from: email.from, to: list(email.to), cc: list(email.cc), received_for: local, subject: email.subject, text: email.text, html: email.html,
              headers: email.headers, attachments: fetched.map(({ filename, content_type, content }) => ({ filename, content_type, content }))
            }, site);
          }
          await webhook(site, { type: 'email.delivered', created_at: new Date().toISOString(), data: { email_id: id } });
        } catch (error) {
          console.error('Could not reach the site:', error.message);
        }
      }, 300);
      return send(200, { id });
    }
    if (request.method === 'GET' && parts[0] === 'emails' && parts[1] === 'receiving') {
      const stored = received.get(parts[2]);
      if (!stored) return send(404, { message: 'Email not found' });
      if (parts[3] === 'attachments') {
        return send(200, {
          object: 'list', has_more: false,
          data: [...stored.files.values()].map(({ meta }) => ({ ...meta, download_url: `${base}/files/${parts[2]}/${meta.id}`, expires_at: new Date(Date.now() + 3600e3).toISOString() }))
        });
      }
      return send(200, stored.email);
    }
    send(404, { message: 'Not found' });
  } catch (error) {
    console.error(error);
    send(500, { message: error.message });
  }
}).listen(RESEND_PORT, '127.0.0.1', () => console.log(`Resend stand-in on ${base}, webhooks to ${SITE_URL}`));
