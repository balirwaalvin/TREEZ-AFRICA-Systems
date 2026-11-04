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
    ['DELETE', '/api/admin/posts/x'], ['PATCH', '/api/admin/messages/x', { status: 'closed' }]
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
