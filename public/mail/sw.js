/* ============================================
   TREEZ AFRICA SYSTEMS — Mail service worker
   Served at mail.treez.tech/sw.js (and /mail/sw.js locally), so it looks after the mail app only.
   - Shows new-mail notifications sent by the Worker (src/mail/push.ts), and opens the email on tap.
   - Keeps the app's own page, styles and scripts so it still opens without a connection.
     Mail itself (anything under /api/) is never stored on the device.
   ============================================ */

const CACHE = 'treez-mail-v1';
const SHELL = './';
const ICON = '/assets/images/mail/icon-192.png';
const BADGE = '/assets/images/mail/badge-96.png';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

// Same-site files only: the page's security policy doesn't let the worker fetch elsewhere.
const isAppFile = (url) => url.origin === self.location.origin && /^\/(css|js|assets)\//.test(url.pathname);

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;

  // The page: always the latest when online, the saved copy when not.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok && !response.redirected) (await caches.open(CACHE)).put(SHELL, response.clone());
        return response;
      } catch {
        return (await caches.match(SHELL)) ?? Response.error();
      }
    })());
    return;
  }

  // Styles, scripts and images: the saved copy at once, refreshed in the background.
  if (isAppFile(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const saved = await cache.match(request);
      const fresh = fetch(request).then((response) => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      });
      if (saved) {
        event.waitUntil(fresh.catch(() => {}));
        return saved;
      }
      return fresh;
    })());
  }
});

// ---- Notifications ----

async function setBadge(unread) {
  if (typeof unread !== 'number' || !('setAppBadge' in self.navigator)) return;
  try {
    if (unread > 0) await self.navigator.setAppBadge(unread);
    else await self.navigator.clearAppBadge();
  } catch {
    // Not every platform has a badge.
  }
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil((async () => {
    await setBadge(data.unread);
    // Any open window refreshes its list straight away.
    for (const client of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) client.postMessage({ type: 'new-mail' });
    // Always shown: browsers stop delivering to sites that receive pushes without showing anything.
    await self.registration.showNotification(data.title || 'New email', {
      body: data.body || '',
      icon: ICON,
      badge: BADGE,
      tag: data.tag || undefined,
      timestamp: Date.now(),
      data: { url: data.url || '#inbox' }
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '#inbox', self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((client) => client.url.startsWith(self.registration.scope));
    if (open) {
      await open.focus();
      open.postMessage({ type: 'open', url: target });
      return;
    }
    await self.clients.openWindow(target);
  })());
});

// Browsers occasionally replace a device's subscription. Hand the new one to the server.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    const options = event.oldSubscription?.options;
    if (!options?.applicationServerKey) return;
    const subscription = event.newSubscription ?? (await self.registration.pushManager.subscribe(options));
    await fetch('/api/mail/push', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription.toJSON())
    });
  })());
});
