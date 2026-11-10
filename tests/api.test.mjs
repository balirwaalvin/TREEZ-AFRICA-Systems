// End-to-end API tests against a running server, using a scratch database:
//   npm run db:migrate:local
//   npm run admin:create -- test@example.com --local
//   npm run dev
//   BASE_URL=http://localhost:5173 ADMIN_EMAIL=test@example.com ADMIN_PASSWORD=... npm test
// They create and rate-limit data, and restarting with an empty database resets them.
// Never point them at the live site.
import assert from 'node:assert/strict';
import { test } from 'node:test';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;
assert.ok(EMAIL && PASSWORD, 'Set ADMIN_EMAIL and ADMIN_PASSWORD.');
assert.match(new URL(BASE).hostname, /^(localhost|127\.0\.0\.1)$/, 'These tests only run against a local server.');

let cookie = '';

async function call(path, { method = 'GET', body, origin = BASE, session = false, headers = {} } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    redirect: 'manual',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(origin && method !== 'GET' ? { Origin: origin } : {}),
      ...(session ? { Cookie: cookie } : {}),
      ...headers
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const raw = await response.text();
  let data = null;
  try { data = JSON.parse(raw); } catch { /* not JSON */ }
  return { status: response.status, data, raw, headers: response.headers };
}

const validMessage = {
  name: 'Test Person', email: 'person@example.com', phone: '+256700000000',
  subject: 'Hello', message: 'A test enquiry', turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX'
};
const validPost = {
  title: 'Test post', category: 'Testing', author: 'Tester', date: '2026-11-04',
  readTime: '1 min', excerpt: 'Excerpt', content: 'Body text', published: true
};

// Amounts are cents: UGX 2,200,000.00 is 220000000.
const runId = Date.now().toString().slice(-6);
const validInvoice = {
  number: `TEST-${runId}`, currency: 'UGX', clientName: 'Test Client Ltd', clientAddress: 'Plot 1\nKampala',
  clientEmail: 'client@example.com', clientPhone: '+256700000000',
  items: [{ description: 'Development:\nTest platform', quantity: 1, unitPrice: 220000000 }]
};
const payment = (number, paidOn, amount) => ({ number: `TEST ${runId} ${number}`, paidOn, amount, channel: 'ABSA Bank (U) Limited' });
const tinyPdf = btoa('%PDF-1.7\n%test\n');

test('pages are served and source files are not', async () => {
  assert.equal((await call('/')).status, 200);
  assert.equal((await call('/contact/')).status, 200);
  const missing = await call('/definitely-not-a-page/');
  assert.equal(missing.status, 404);
  assert.match(missing.raw, /Page Not Found/);
  for (const path of ['/package.json', '/cloudflare.config.ts', '/src/index.ts', '/migrations/0001_init.sql', '/README.md']) {
    assert.equal((await call(path)).status, 404, path);
  }
});

test('unknown API paths return JSON 404, not a page', async () => {
  const result = await call('/api/nope');
  assert.equal(result.status, 404);
  assert.equal(result.data.error, 'Not found.');
});

test('every admin route refuses a request with no session', async () => {
  const routes = [
    ['GET', '/api/admin/session'], ['GET', '/api/admin/messages'], ['GET', '/api/admin/posts'],
    ['GET', '/api/admin/views'], ['GET', '/api/admin/anything-else'],
    ['POST', '/api/admin/posts', validPost], ['PUT', '/api/admin/posts/x', validPost],
    ['DELETE', '/api/admin/posts/x'], ['PATCH', '/api/admin/messages/x', { status: 'closed' }],
    ['GET', '/api/admin/receipts'], ['POST', '/api/admin/receipts', {}], ['DELETE', '/api/admin/receipts/x'],
    ['POST', '/api/admin/receipts/x/send', { pdf: 'JVBERi0=' }], ['PUT', '/api/admin/invoices/x', {}]
  ];
  for (const [method, path, body] of routes) {
    assert.equal((await call(path, { method, body })).status, 401, `${method} ${path}`);
  }
});

test('a forged session cookie is refused', async () => {
  const result = await call('/api/admin/messages', { headers: { Cookie: '__Host-treez_admin=forged-token' } });
  assert.equal(result.status, 401);
});

test('writes from another site, or with no Origin, are refused', async () => {
  assert.equal((await call('/api/messages', { method: 'POST', body: validMessage, origin: 'https://evil.example' })).status, 403);
  assert.equal((await call('/api/messages', { method: 'POST', body: validMessage, origin: null })).status, 403);
  assert.equal((await call('/api/admin/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD }, origin: 'https://evil.example' })).status, 403);
});

test('messages are validated before anything is stored', async () => {
  const bad = [
    [{ ...validMessage, name: '  ' }, 400],
    [{ ...validMessage, email: 'not-an-email' }, 400],
    [{ ...validMessage, message: '' }, 400],
    [{ ...validMessage, name: 123 }, 400],
    [{ ...validMessage, message: 'x'.repeat(10_001) }, 400],
    [{ ...validMessage, message: 'x'.repeat(40_000) }, 413]
  ];
  for (const [body, status] of bad) assert.equal((await call('/api/messages', { method: 'POST', body })).status, status);
  const plain = await fetch(`${BASE}/api/messages`, { method: 'POST', headers: { Origin: BASE, 'Content-Type': 'text/plain' }, body: JSON.stringify(validMessage) });
  assert.equal(plain.status, 415);
});

test('wrong passwords and unknown emails get the same answer', async () => {
  const wrong = await call('/api/admin/login', { method: 'POST', body: { email: EMAIL, password: 'wrong-password-here' } });
  const unknown = await call('/api/admin/login', { method: 'POST', body: { email: 'nobody@example.com', password: 'wrong-password-here' } });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal(wrong.data.error, unknown.data.error);
  assert.equal(wrong.headers.get('set-cookie'), null);
});

test('signing in sets a locked-down session cookie', async () => {
  const result = await call('/api/admin/login', { method: 'POST', body: { email: EMAIL.toUpperCase(), password: PASSWORD } });
  assert.equal(result.status, 200);
  assert.equal(result.data.email, EMAIL);
  const setCookie = result.headers.get('set-cookie');
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) assert.ok(setCookie.includes(flag), flag);
  cookie = setCookie.split(';')[0];
  assert.equal((await call('/api/admin/session', { session: true })).data.email, EMAIL);
});

test('a message goes from the public form into the admin inbox', async () => {
  const created = await call('/api/messages', { method: 'POST', body: { ...validMessage, role: 'admin', status: 'closed', notes: 'injected' } });
  assert.equal(created.status, 201);
  const id = created.data.id;

  const inbox = await call('/api/admin/messages', { session: true });
  const message = inbox.data.documents.find((item) => item.id === id);
  assert.equal(message.name, validMessage.name);
  assert.equal(message.status, 'new', 'visitors cannot set the status');
  assert.equal(message.notes, '', 'visitors cannot set notes');
  assert.ok(message.createdAt);

  const updated = await call(`/api/admin/messages/${id}`, { method: 'PATCH', session: true, body: { status: 'contacted', notes: 'Called them', name: 'Changed' } });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.status, 'contacted');
  assert.equal(updated.data.notes, 'Called them');
  assert.equal(updated.data.name, validMessage.name, 'other fields stay read-only');

  assert.equal((await call(`/api/admin/messages/${id}`, { method: 'PATCH', session: true, body: { status: 'archived' } })).status, 400);
  assert.equal((await call(`/api/admin/messages/${id}`, { method: 'PATCH', session: true, body: {} })).status, 400);
  assert.equal((await call('/api/admin/messages/missing', { method: 'PATCH', session: true, body: { status: 'new' } })).status, 404);
});

test('drafts stay private and published posts are public', async () => {
  const created = await call('/api/admin/posts', { method: 'POST', session: true, body: { ...validPost, published: false } });
  assert.equal(created.status, 201);
  const { id } = created.data;
  assert.equal(created.data.published, false);
  assert.equal(created.data.readTime, validPost.readTime);

  assert.equal((await call(`/api/posts/${id}`)).status, 404);
  assert.ok(!(await call('/api/posts')).data.documents.some((post) => post.id === id));

  assert.equal((await call(`/api/admin/posts/${id}`, { method: 'PUT', session: true, body: validPost })).status, 200);
  const live = await call(`/api/posts/${id}`);
  assert.equal(live.status, 200);
  assert.equal(live.data.published, true);
  assert.equal(live.data.content, validPost.content);
  const listed = (await call('/api/posts')).data.documents.find((post) => post.id === id);
  assert.ok(listed);
  assert.equal(listed.content, undefined, 'the list stays light');

  assert.equal((await call(`/api/admin/posts/${id}`, { method: 'PUT', session: true, body: { ...validPost, date: 'not a date' } })).status, 400);
  assert.equal((await call(`/api/admin/posts/${id}`, { method: 'DELETE', session: true })).status, 200);
  assert.equal((await call(`/api/posts/${id}`)).status, 404);
  assert.equal((await call(`/api/admin/posts/${id}`, { method: 'DELETE', session: true })).status, 404);
});

test('page views are recorded and readable only by admins', async () => {
  const path = `/test-${Date.now()}/`;
  assert.equal((await call('/api/views', { method: 'POST', body: { page: 'Test', path } })).status, 201);
  assert.equal((await call('/api/views', { method: 'POST', body: { page: 'Test' } })).status, 400);
  const since = new Date(Date.now() - 60_000).toISOString();
  const views = await call(`/api/admin/views?since=${encodeURIComponent(since)}`, { session: true });
  assert.ok(views.data.total >= 1);
  assert.ok(views.data.documents.some((view) => view.path === path));
  assert.equal((await call('/api/admin/views?since=garbage', { session: true })).status, 400);
});

test('quoted input is stored as text, not run as SQL', async () => {
  const hostile = "Robert'); DROP TABLE messages;--";
  const created = await call('/api/messages', { method: 'POST', body: { ...validMessage, name: hostile } });
  assert.equal(created.status, 201);
  const inbox = await call('/api/admin/messages', { session: true });
  assert.equal(inbox.data.documents.find((item) => item.id === created.data.id).name, hostile);
  const encoded = encodeURIComponent("x' OR '1'='1");
  assert.equal((await call(`/api/posts/${encoded}`)).status, 404);
});

test('a receipt and its follow-up payment are recorded against one invoice', async () => {
  const first = await call('/api/admin/receipts', { method: 'POST', session: true, body: { invoice: validInvoice, receipt: payment('0001', '2026-10-02', 120000000) } });
  assert.equal(first.status, 201);
  const invoiceId = first.data.invoice.id;
  assert.equal(first.data.receipt.invoiceId, invoiceId);
  assert.equal(first.data.receipt.amount, 120000000);
  assert.equal(first.data.receipt.sentAt, null);

  const next = (receipt, invoice = { ...validInvoice, id: invoiceId }) => call('/api/admin/receipts', { method: 'POST', session: true, body: { invoice, receipt } });
  const over = await next(payment('0002', '2026-10-27', 100000001));
  assert.equal(over.status, 400);
  assert.match(over.data.error, /more than the balance of UGX1,000,000\.00/);
  const backdated = await next(payment('0002', '2026-10-01', 100000000));
  assert.equal(backdated.status, 400);
  assert.match(backdated.data.error, /before the last payment/);
  const reused = await next(payment('0001', '2026-10-27', 100000000));
  assert.equal(reused.status, 409);
  const future = await next(payment('0002', '2999-01-01', 100000000));
  assert.equal(future.status, 400);

  const second = await next(payment('0002', '2026-10-27', 100000000));
  assert.equal(second.status, 201);
  assert.equal(second.data.invoice.id, invoiceId, 'the follow-up joins the same invoice');
  assert.equal((await next(payment('0003', '2026-10-28', 1))).data.error, 'This invoice is already paid in full.');

  const list = await call('/api/admin/receipts', { session: true });
  assert.equal(list.status, 200);
  assert.equal(list.data.invoices.filter((invoice) => invoice.id === invoiceId).length, 1);
  assert.deepEqual(list.data.invoices.find((invoice) => invoice.id === invoiceId).items, validInvoice.items);
  assert.equal(list.data.receipts.filter((receipt) => receipt.invoiceId === invoiceId).length, 2);

  const lowered = await call(`/api/admin/invoices/${invoiceId}`, { method: 'PUT', session: true, body: { ...validInvoice, items: [{ ...validInvoice.items[0], unitPrice: 100000000 }] } });
  assert.equal(lowered.status, 400, "the total can't drop below what has been paid");
  const renamed = await call(`/api/admin/invoices/${invoiceId}`, { method: 'PUT', session: true, body: { ...validInvoice, clientName: 'Renamed Client Ltd' } });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.data.clientName, 'Renamed Client Ltd');
});

test('receipts and invoices are validated before anything is stored', async () => {
  const bad = [
    [{ ...validInvoice, clientEmail: 'not-an-email' }, payment('0101', '2026-10-02', 100)],
    [{ ...validInvoice, currency: 'shillings' }, payment('0102', '2026-10-02', 100)],
    [{ ...validInvoice, items: [] }, payment('0103', '2026-10-02', 100)],
    [{ ...validInvoice, items: [{ description: 'x', quantity: 0.001, unitPrice: 100 }] }, payment('0104', '2026-10-02', 100)],
    [{ ...validInvoice, items: [{ description: 'x', quantity: 1, unitPrice: 1.5 }] }, payment('0105', '2026-10-02', 100)],
    [{ ...validInvoice, number: `TEST-${runId}-B` }, payment('0106', '2026-02-30', 100)],
    [{ ...validInvoice, number: `TEST-${runId}-C` }, payment('0107', '2026-10-02', 0)],
    [{ ...validInvoice, number: `TEST-${runId}-D` }, { ...payment('0108', '2026-10-02', 100), channel: '' }]
  ];
  for (const [invoice, receipt] of bad) {
    assert.equal((await call('/api/admin/receipts', { method: 'POST', session: true, body: { invoice, receipt } })).status, 400, JSON.stringify({ invoice, receipt }).slice(0, 200));
  }
  const duplicateInvoice = await call('/api/admin/receipts', { method: 'POST', session: true, body: { invoice: validInvoice, receipt: payment('0109', '2026-10-02', 100) } });
  assert.equal(duplicateInvoice.status, 409, 'a second invoice cannot reuse a number');
  assert.equal((await call('/api/admin/receipts', { method: 'POST', session: true, body: { invoice: { ...validInvoice, id: 'missing' }, receipt: payment('0110', '2026-10-02', 100) } })).status, 404);
});

test('only unsent receipts can be deleted, and sending needs a real PDF', async () => {
  const created = await call('/api/admin/receipts', { method: 'POST', session: true, body: { invoice: { ...validInvoice, number: `TEST-${runId}-E` }, receipt: payment('0201', '2026-10-02', 100) } });
  assert.equal(created.status, 201);
  const { id, invoiceId } = created.data.receipt;
  const send = (body) => call(`/api/admin/receipts/${id}/send`, { method: 'POST', session: true, body });

  assert.equal((await send({})).status, 400);
  assert.equal((await send({ pdf: btoa('not a pdf') })).status, 400);
  assert.equal((await send({ pdf: '***' })).status, 400);
  assert.equal((await call('/api/admin/receipts/missing/send', { method: 'POST', session: true, body: { pdf: tinyPdf } })).status, 404);

  // With `npm run dev:mail-test` the email reaches the local mail catcher; plain `npm run dev`
  // has no mailbox password, so it is refused before anything is sent.
  const sent = await send({ pdf: tinyPdf });
  if (sent.status === 503) {
    assert.match(sent.data.error, /Email isn't set up yet/);
    assert.equal((await call(`/api/admin/receipts/${id}`, { method: 'DELETE', session: true })).status, 200);
    const after = await call('/api/admin/receipts', { session: true });
    assert.ok(!after.data.invoices.some((invoice) => invoice.id === invoiceId), 'an invoice left with no receipts is removed');
    return;
  }
  assert.equal(sent.status, 200);
  assert.ok(sent.data.sentAt);
  assert.equal(sent.data.sentTo, validInvoice.clientEmail);
  const refused = await call(`/api/admin/receipts/${id}`, { method: 'DELETE', session: true });
  assert.equal(refused.status, 409, 'a sent receipt is the client\'s record and stays');
});

test('signing out revokes the session on the server', async () => {
  const before = cookie;
  const result = await call('/api/admin/logout', { method: 'POST', session: true, body: {} });
  assert.equal(result.status, 200);
  assert.match(result.headers.get('set-cookie'), /Max-Age=0/);
  const replayed = await call('/api/admin/messages', { headers: { Cookie: before } });
  assert.equal(replayed.status, 401);
});

test('repeated form posts and sign-in guesses get rate limited', async () => {
  let messageStatus;
  for (let i = 0; i < 6 && messageStatus !== 429; i += 1) {
    messageStatus = (await call('/api/messages', { method: 'POST', body: validMessage })).status;
  }
  assert.equal(messageStatus, 429);

  let last;
  for (let i = 0; i < 11 && last?.status !== 429; i += 1) {
    last = await call('/api/admin/login', { method: 'POST', body: { email: EMAIL, password: 'still-the-wrong-one' } });
  }
  assert.equal(last.status, 429);
  assert.ok(Number(last.headers.get('retry-after')) > 0);
  const blocked = await call('/api/admin/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
  assert.equal(blocked.status, 429, 'the correct password is also refused during a lockout');
});
