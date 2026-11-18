// End-to-end tests for mailboxes (/api/mail and /api/admin/mailboxes), against a local server.
// Same setup as api.test.mjs. For the sending and receiving tests, build in mail-test mode and run
// the Resend stand-in pointed at the server, then set MAIL_TEST=1:
//   npx cf build --mode mail-test && npx vite preview --port 4173
//   SITE_URL=http://localhost:4173 npm run mail-catcher
//   MAIL_TEST=1 BASE_URL=http://localhost:4173 ADMIN_EMAIL=... ADMIN_PASSWORD=... npm test
// Without MAIL_TEST, they check that sending and receiving refuse to run with no Resend keys.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;
const MAIL_TEST = process.env.MAIL_TEST === '1';
const RESEND = 'http://127.0.0.1:2526';
const WEBHOOK_SECRET = 'whsec_bWFpbC10ZXN0LXdlYmhvb2stc2VjcmV0'; // the public mail-test secret
assert.ok(EMAIL && PASSWORD, 'Set ADMIN_EMAIL and ADMIN_PASSWORD.');
assert.match(new URL(BASE).hostname, /^(localhost|127\.0\.0\.1)$/, 'These tests only run against a local server.');

const runId = Date.now().toString(36);
const MAILBOX_PASSWORD = `mailbox-test-${runId}-pw`;
const alice = `alice-${runId}@treez.tech`;
const bob = `bob-${runId}@treez.tech`;
const jars = { admin: '', alice: '', bob: '' };

async function call(path, { method = 'GET', body, raw, as, origin = BASE, headers = {} } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    redirect: 'manual',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(origin && method !== 'GET' ? { Origin: origin } : {}),
      ...(as ? { Cookie: jars[as] } : {}),
      ...headers
    },
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined)
  });
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* not JSON */ }
  return { status: response.status, data, text, headers: response.headers };
}

const cookieOf = (result) => (result.headers.get('set-cookie') ?? '').split(';')[0];

function signed(body, { secret = WEBHOOK_SECRET, timestamp = Math.floor(Date.now() / 1000) } = {}) {
  const id = `msg_test_${Math.random().toString(36).slice(2)}`;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  return { 'svix-id': id, 'svix-timestamp': String(timestamp), 'svix-signature': `v1,${signature}`, 'Content-Type': 'application/json' };
}

async function inject(email) {
  const response = await fetch(`${RESEND}/inject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ site: BASE, ...email }) });
  return response.json();
}

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
async function inbox(as, folder = 'inbox') {
  return (await call(`/api/mail/messages?folder=${folder}`, { as })).data.documents;
}

test('admins sign in for the mailbox tests', async () => {
  const result = await call('/api/admin/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
  assert.equal(result.status, 200);
  jars.admin = cookieOf(result);
});

test('every mail route refuses a request with no mailbox session', async () => {
  const routes = [
    ['GET', '/api/mail/session'], ['GET', '/api/mail/folders'], ['GET', '/api/mail/messages'], ['GET', '/api/mail/messages/x'],
    ['GET', '/api/mail/messages/x/html'], ['GET', '/api/mail/messages/x/original'], ['GET', '/api/mail/attachments/x'],
    ['PATCH', '/api/mail/messages', { ids: ['x'], read: true }], ['POST', '/api/mail/messages/delete', { ids: ['x'] }],
    ['POST', '/api/mail/folders/trash/empty', {}], ['POST', '/api/mail/drafts', {}], ['PUT', '/api/mail/drafts/x', {}],
    ['POST', '/api/mail/send', {}], ['DELETE', '/api/mail/uploads/x'], ['PUT', '/api/mail/account', {}],
    ['POST', '/api/mail/account/password', {}], ['GET', '/api/mail/anything-else']
  ];
  for (const [method, path, body] of routes) assert.equal((await call(path, { method, body })).status, 401, `${method} ${path}`);
  // An admin session is not a mailbox session.
  assert.equal((await call('/api/mail/session', { as: 'admin' })).status, 401);
});

test('only admins manage mailboxes, and only for the mail domain', async () => {
  assert.equal((await call('/api/admin/mailboxes')).status, 401);
  assert.equal((await call('/api/admin/mailboxes', { method: 'POST', body: { address: 'x', displayName: 'X', password: MAILBOX_PASSWORD } })).status, 401);
  const bad = [
    [{ address: `x-${runId}@example.com`, displayName: 'X', password: MAILBOX_PASSWORD }, /@treez\.tech/],
    [{ address: `.dot-${runId}`, displayName: 'X', password: MAILBOX_PASSWORD }, /letters, numbers/],
    [{ address: `x-${runId}`, displayName: 'X', password: 'too-short' }, /12 characters/],
    [{ address: `x-${runId}`, displayName: '', password: MAILBOX_PASSWORD }, /Name is required/]
  ];
  for (const [body, message] of bad) {
    const result = await call('/api/admin/mailboxes', { method: 'POST', body, as: 'admin' });
    assert.equal(result.status, 400, JSON.stringify(body));
    assert.match(result.data.error, message);
  }
  for (const [address, displayName] of [[`alice-${runId}`, 'Alice Test'], [bob, 'Bob Test']]) {
    const created = await call('/api/admin/mailboxes', { method: 'POST', body: { address, displayName, password: MAILBOX_PASSWORD }, as: 'admin' });
    assert.equal(created.status, 201);
    assert.equal(created.data.disabled, false);
  }
  const duplicate = await call('/api/admin/mailboxes', { method: 'POST', body: { address: alice.toUpperCase(), displayName: 'Again', password: MAILBOX_PASSWORD }, as: 'admin' });
  assert.equal(duplicate.status, 409);
  const list = await call('/api/admin/mailboxes', { as: 'admin' });
  assert.ok(list.data.documents.some((mailbox) => mailbox.address === alice));
  assert.ok(!JSON.stringify(list.data).includes('pbkdf2'), 'password hashes never leave the server');
});

test('wrong passwords and unknown mailboxes get the same answer', async () => {
  const wrong = await call('/api/mail/login', { method: 'POST', body: { address: alice, password: 'wrong-password-here' } });
  const unknown = await call('/api/mail/login', { method: 'POST', body: { address: `nobody-${runId}`, password: 'wrong-password-here' } });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal(wrong.data.error, unknown.data.error);
});

test('signing in to a mailbox sets a locked-down session cookie', async () => {
  // The domain is optional, and addresses aren't case-sensitive.
  const result = await call('/api/mail/login', { method: 'POST', body: { address: `ALICE-${runId}`, password: MAILBOX_PASSWORD } });
  assert.equal(result.status, 200);
  assert.equal(result.data.address, alice);
  const cookie = result.headers.get('set-cookie');
  assert.match(cookie, /^__Host-treez_mail=/);
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) assert.ok(cookie.includes(flag), flag);
  jars.alice = cookieOf(result);
  jars.bob = cookieOf(await call('/api/mail/login', { method: 'POST', body: { address: bob, password: MAILBOX_PASSWORD } }));
  assert.equal((await call('/api/mail/session', { as: 'alice' })).data.displayName, 'Alice Test');
  // A mailbox session is not an admin session.
  assert.equal((await call('/api/admin/session', { as: 'alice' })).status, 401);
  // Writes from other sites are refused.
  assert.equal((await call('/api/mail/drafts', { method: 'POST', body: {}, as: 'alice', origin: 'https://evil.example' })).status, 403);
});

test('drafts keep attachments, and other mailboxes can never see them', async () => {
  const upload = await call('/api/mail/uploads', { method: 'POST', raw: 'hello file', as: 'alice', headers: { 'Content-Type': 'text/plain', 'X-Filename': encodeURIComponent('notes "v1".txt') } });
  assert.equal(upload.status, 201);
  assert.equal(upload.data.filename, 'notes _v1_.txt');
  assert.equal(upload.data.size, 10);
  // Bob can't attach Alice's upload.
  const stolen = await call('/api/mail/drafts', { method: 'POST', body: { to: [], subject: 'x', text: '', attachments: [upload.data.id] }, as: 'bob' });
  assert.equal(stolen.status, 400);

  const draft = await call('/api/mail/drafts', { method: 'POST', body: { to: ['Someone <someone@example.com>'], subject: 'Plan', text: 'First go', attachments: [upload.data.id] }, as: 'alice' });
  assert.equal(draft.status, 200);
  assert.equal(draft.data.folder, 'drafts');
  assert.equal(draft.data.attachments.length, 1);
  const attachmentId = draft.data.attachments[0].id;

  const file = await call(`/api/mail/attachments/${attachmentId}`, { as: 'alice' });
  assert.equal(file.text, 'hello file');
  assert.match(file.headers.get('content-disposition'), /^attachment;/);
  assert.match(file.headers.get('content-security-policy'), /sandbox/);
  assert.equal(file.headers.get('x-content-type-options'), 'nosniff');

  assert.equal((await call(`/api/mail/messages/${draft.data.id}`, { as: 'bob' })).status, 404);
  assert.equal((await call(`/api/mail/attachments/${attachmentId}`, { as: 'bob' })).status, 404);
  const bobPatch = await call('/api/mail/messages', { method: 'PATCH', body: { ids: [draft.data.id], starred: true }, as: 'bob' });
  assert.equal(bobPatch.data.updated, 0);
  assert.equal((await call('/api/mail/messages/delete', { method: 'POST', body: { ids: [draft.data.id] }, as: 'bob' })).data.deleted, 0);

  const updated = await call(`/api/mail/drafts/${draft.data.id}`, { method: 'PUT', body: { to: [], subject: 'Plan v2', text: 'Second go', attachments: [] }, as: 'alice' });
  assert.equal(updated.data.subject, 'Plan v2');
  assert.equal(updated.data.attachments.length, 0);
  assert.equal((await call(`/api/mail/attachments/${attachmentId}`, { as: 'alice' })).status, 404);

  const deleted = await call('/api/mail/messages/delete', { method: 'POST', body: { ids: [draft.data.id] }, as: 'alice' });
  assert.equal(deleted.data.deleted, 1);
});

test('outgoing mail is validated before anything is sent', async () => {
  const cases = [
    [{ to: [], subject: 'Hi', text: 'x' }, 400, /at least one recipient/],
    [{ to: ['not an address'], subject: 'Hi', text: 'x' }, 400, /not a valid email address/],
    [{ to: ['a@example.com\r\nBcc: evil@example.com'], subject: 'Hi', text: 'x' }, 400, /not a valid/],
    [{ to: ['a@example.com'], subject: 'Hi\r\nBcc: evil@example.com', text: 'x' }, 400, /line breaks/],
    [{ to: Array.from({ length: 51 }, (_, i) => `p${i}@example.com`), subject: 'Hi', text: 'x' }, 400, /not valid/],
    [{ to: ['a@example.com'], subject: 'Hi', text: 'x', attachments: ['missing'] }, 400, /no longer available/]
  ];
  for (const [body, status, message] of cases) {
    const result = await call('/api/mail/send', { method: 'POST', body, as: 'alice' });
    if (!MAIL_TEST && result.status === 503) continue; // with no Resend key, nothing gets as far as validation
    assert.equal(result.status, status, JSON.stringify(body).slice(0, 80));
    assert.match(result.data.error, message);
  }
});

test('the webhook only accepts requests signed by Resend', async () => {
  const body = JSON.stringify({ type: 'email.received', data: { email_id: 'nope', to: [alice] } });
  const unsigned = await call('/api/mail/inbound', { method: 'POST', raw: body, origin: null, headers: { 'Content-Type': 'application/json' } });
  assert.equal(unsigned.status, MAIL_TEST ? 401 : 503);
  if (!MAIL_TEST) return;
  const forged = await call('/api/mail/inbound', { method: 'POST', raw: body, origin: null, headers: signed(body, { secret: 'whsec_d3Jvbmctc2VjcmV0' }) });
  assert.equal(forged.status, 401);
  const stale = await call('/api/mail/inbound', { method: 'POST', raw: body, origin: null, headers: signed(body, { timestamp: Math.floor(Date.now() / 1000) - 3600 }) });
  assert.equal(stale.status, 401);
  const tampered = signed(body);
  const changed = await call('/api/mail/inbound', { method: 'POST', raw: body.replace('nope', 'other'), origin: null, headers: tampered });
  assert.equal(changed.status, 401);
  // Correctly signed events for no known mailbox are accepted and ignored.
  const ignored = JSON.stringify({ type: 'email.opened', data: { email_id: 'x' } });
  assert.equal((await call('/api/mail/inbound', { method: 'POST', raw: ignored, origin: null, headers: signed(ignored) })).status, 200);
});

test('sending needs Resend set up', { skip: MAIL_TEST }, async () => {
  const result = await call('/api/mail/send', { method: 'POST', body: { to: ['a@example.com'], subject: 'Hi', text: 'x' }, as: 'alice' });
  assert.equal(result.status, 503);
  assert.match(result.data.error, /isn't set up yet/);
});

test('received mail is filed once in each addressed mailbox', { skip: !MAIL_TEST }, async () => {
  const injected = await inject({
    from: 'Client Person <client@example.com>',
    to: [alice],
    cc: [`BOB-${runId}@treez.tech`, 'someone-else@example.com'],
    subject: `Hello ${runId}`,
    text: 'Plain words',
    html: '<p>Rich <b>words</b></p><script>alert(1)</script>',
    attachments: [{ filename: 'brief.pdf', content_type: 'application/pdf', content: Buffer.from('%PDF-brief').toString('base64') }]
  });
  assert.equal(injected.webhook.status, 200);
  assert.equal(JSON.parse(injected.webhook.body).filed, 2);

  const [message] = (await inbox('alice')).filter((item) => item.subject === `Hello ${runId}`);
  assert.ok(message, 'filed in Alice\'s inbox');
  assert.equal(message.fromName, 'Client Person');
  assert.equal(message.isRead, false);
  assert.ok((await inbox('bob')).some((item) => item.subject === `Hello ${runId}`), 'filed in Bob\'s inbox (Cc)');

  const full = (await call(`/api/mail/messages/${message.id}`, { as: 'alice' })).data;
  assert.equal(full.text, 'Plain words');
  assert.equal(full.hasHtml, true);
  assert.deepEqual(full.auth, { spf: 'pass', dkim: 'pass', dmarc: 'pass' });
  const html = await call(`/api/mail/messages/${message.id}/html`, { as: 'alice' });
  assert.match(html.headers.get('content-type'), /^text\/plain/, 'HTML is never served as a page');
  assert.match(html.headers.get('content-security-policy'), /sandbox/);
  assert.match(html.text, /<b>words<\/b>/);
  const attachment = await call(`/api/mail/attachments/${full.attachments[0].id}`, { as: 'alice' });
  assert.equal(attachment.text, '%PDF-brief');
  assert.match((await call(`/api/mail/messages/${message.id}/original`, { as: 'alice' })).text, /Subject: Hello/);

  // Resend retries webhooks; a repeat of the same email files nothing new.
  const replay = await fetch(`${RESEND}/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ site: BASE, type: 'email.received', data: { email_id: injected.id, to: [alice], cc: [bob] } })
  }).then((response) => response.json());
  assert.equal(JSON.parse(replay.body).filed, 0);
  assert.equal((await inbox('alice')).filter((item) => item.subject === `Hello ${runId}`).length, 1);
  // Mail for addresses with no mailbox is accepted and dropped.
  const nobody = await inject({ from: 'Someone <s@example.com>', to: [`nobody-${runId}@treez.tech`], subject: 'For nobody' });
  assert.equal(JSON.parse(nobody.webhook.body).filed, 0);
});

test('mail failing DMARC goes to Junk', { skip: !MAIL_TEST }, async () => {
  await inject({ from: 'Fake Bank <alerts@bank.example>', to: [alice], subject: `Spoof ${runId}`, text: 'Click here', dmarc: 'fail' });
  assert.ok((await inbox('alice', 'spam')).some((item) => item.subject === `Spoof ${runId}`));
  assert.ok(!(await inbox('alice')).some((item) => item.subject === `Spoof ${runId}`));
});

test('replies thread, attach files, and arrive in the other mailbox', { skip: !MAIL_TEST }, async () => {
  const [original] = (await inbox('bob')).filter((item) => item.subject === `Hello ${runId}`);
  const upload = await call('/api/mail/uploads', { method: 'POST', raw: 'quote body', as: 'bob', headers: { 'Content-Type': 'application/pdf', 'X-Filename': 'quote.pdf' } });
  const sent = await call('/api/mail/send', {
    method: 'POST',
    body: { to: ['Client Person <client@example.com>'], cc: [alice], subject: `Re: Hello ${runId}`, text: 'Here you go.\n\n> Plain words', attachments: [upload.data.id], inReplyTo: original.id },
    as: 'bob'
  });
  assert.equal(sent.status, 201);
  assert.equal(sent.data.folder, 'sent');
  assert.equal(sent.data.attachments.length, 1);
  await wait(1500);
  const sentNow = (await inbox('bob', 'sent')).find((item) => item.id === sent.data.id);
  assert.equal(sentNow.delivery, 'delivered', 'delivery webhook updated the sent copy');
  const received = (await inbox('alice')).find((item) => item.subject === `Re: Hello ${runId}`);
  assert.ok(received, 'Cc to a local mailbox comes back in');
  const full = (await call(`/api/mail/messages/${received.id}`, { as: 'alice' })).data;
  assert.equal(full.fromAddress, bob);
  assert.equal((await call(`/api/mail/attachments/${full.attachments[0].id}`, { as: 'alice' })).text, 'quote body');
  // The uploaded file now belongs to the sent copy, not to an unsent upload.
  assert.equal((await call(`/api/mail/uploads/${upload.data.id}`, { method: 'DELETE', as: 'bob' })).status, 200);
  assert.equal((await call(`/api/mail/attachments/${sent.data.attachments[0].id}`, { as: 'bob' })).text, 'quote body');
});

test('folders only allow moves that make sense, and only the bin deletes for good', async () => {
  const draft = (await call('/api/mail/drafts', { method: 'POST', body: { to: [], subject: `Folder ${runId}`, text: 'x', attachments: [] }, as: 'alice' })).data;
  // Drafts never move.
  await call('/api/mail/messages', { method: 'PATCH', body: { ids: [draft.id], folder: 'inbox' }, as: 'alice' });
  assert.equal((await call(`/api/mail/messages/${draft.id}`, { as: 'alice' })).data.folder, 'drafts');
  assert.equal((await call('/api/mail/messages', { method: 'PATCH', body: { ids: [draft.id], folder: 'bogus' }, as: 'alice' })).status, 400);
  if (MAIL_TEST) {
    const [received] = (await inbox('alice')).filter((item) => item.subject === `Hello ${runId}`);
    assert.equal((await call('/api/mail/messages/delete', { method: 'POST', body: { ids: [received.id] }, as: 'alice' })).data.deleted, 0, 'inbox mail must go to the bin first');
    await call('/api/mail/messages', { method: 'PATCH', body: { ids: [received.id], folder: 'sent' }, as: 'alice' });
    assert.equal((await call(`/api/mail/messages/${received.id}`, { as: 'alice' })).data.folder, 'inbox', 'received mail never lands in Sent');
    await call('/api/mail/messages', { method: 'PATCH', body: { ids: [received.id], folder: 'trash', starred: true }, as: 'alice' });
    const counts = (await call('/api/mail/folders', { as: 'alice' })).data;
    assert.equal(counts.trash.total, 1);
    assert.equal((await call('/api/mail/folders/trash/empty', { method: 'POST', body: {}, as: 'alice' })).data.deleted, 1);
    // Bob's copy of the same email, and its shared attachment, are untouched.
    const [bobs] = (await inbox('bob')).filter((item) => item.subject === `Hello ${runId}`);
    const bobFull = (await call(`/api/mail/messages/${bobs.id}`, { as: 'bob' })).data;
    assert.equal((await call(`/api/mail/attachments/${bobFull.attachments[0].id}`, { as: 'bob' })).text, '%PDF-brief');
  }
  assert.equal((await call('/api/mail/folders/inbox/empty', { method: 'POST', body: {}, as: 'alice' })).status, 400);
  await call('/api/mail/messages/delete', { method: 'POST', body: { ids: [draft.id] }, as: 'alice' });
});

test('search finds mail by words, and quotes are treated as text', async () => {
  const draft = (await call('/api/mail/drafts', { method: 'POST', body: { to: [], subject: `Find ${runId} 100% sure_thing`, text: "Robert'); DROP TABLE mail_messages;--", attachments: [] }, as: 'alice' })).data;
  const found = await call(`/api/mail/messages?q=${encodeURIComponent(`${runId} 100%`)}`, { as: 'alice' });
  assert.ok(found.data.documents.some((item) => item.id === draft.id));
  const wildcard = await call(`/api/mail/messages?q=${encodeURIComponent('%')}`, { as: 'bob' });
  assert.ok(!wildcard.data.documents.some((item) => item.id === draft.id), "search never reaches another mailbox");
  assert.equal((await call(`/api/mail/messages/${draft.id}`, { as: 'alice' })).data.text, "Robert'); DROP TABLE mail_messages;--");
  await call('/api/mail/messages/delete', { method: 'POST', body: { ids: [draft.id] }, as: 'alice' });
});

test('people can change their own name, signature and password', async () => {
  const settings = await call('/api/mail/account', { method: 'PUT', body: { displayName: 'Alice Renamed', signature: 'Alice\nTREEZ' }, as: 'alice' });
  assert.equal(settings.data.displayName, 'Alice Renamed');
  const wrong = await call('/api/mail/account/password', { method: 'POST', body: { current: 'not-my-password', password: `${MAILBOX_PASSWORD}-new` }, as: 'alice' });
  assert.equal(wrong.status, 400);
  const short = await call('/api/mail/account/password', { method: 'POST', body: { current: MAILBOX_PASSWORD, password: 'short' }, as: 'alice' });
  assert.equal(short.status, 400);
  const other = cookieOf(await call('/api/mail/login', { method: 'POST', body: { address: alice, password: MAILBOX_PASSWORD } }));
  const changed = await call('/api/mail/account/password', { method: 'POST', body: { current: MAILBOX_PASSWORD, password: `${MAILBOX_PASSWORD}-new` }, as: 'alice' });
  assert.equal(changed.status, 200);
  assert.equal((await call('/api/mail/session', { as: 'alice' })).status, 200, 'this device stays signed in');
  assert.equal((await call('/api/mail/session', { headers: { Cookie: other } })).status, 401, 'other devices are signed out');
});

test('switched-off mailboxes are signed out and can only then be deleted', async () => {
  const id = (await call('/api/admin/mailboxes', { as: 'admin' })).data.documents.find((mailbox) => mailbox.address === bob).id;
  assert.equal((await call(`/api/admin/mailboxes/${id}`, { method: 'DELETE', as: 'admin' })).status, 409);
  const off = await call(`/api/admin/mailboxes/${id}`, { method: 'PATCH', body: { disabled: true }, as: 'admin' });
  assert.equal(off.data.disabled, true);
  assert.equal((await call('/api/mail/session', { as: 'bob' })).status, 401);
  const login = await call('/api/mail/login', { method: 'POST', body: { address: bob, password: MAILBOX_PASSWORD } });
  assert.equal(login.status, 403);
  assert.equal((await call(`/api/admin/mailboxes/${id}`, { method: 'DELETE', as: 'admin' })).status, 200);
  assert.equal((await call(`/api/admin/mailboxes/${id}`, { method: 'PATCH', body: { disabled: false }, as: 'admin' })).status, 404);
});

test('signing out revokes the mailbox session on the server', async () => {
  const before = jars.alice;
  await call('/api/mail/logout', { method: 'POST', body: {}, as: 'alice' });
  assert.equal((await call('/api/mail/session', { headers: { Cookie: before } })).status, 401);
});
