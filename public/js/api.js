/* ============================================
   TREEZ AFRICA SYSTEMS — Client for the site's own API (src/index.ts)
   ============================================ */

window.TREEZ_API = (() => {
  // Local development pairs Cloudflare's always-pass test key with the test secret in .dev.vars.
  const TURNSTILE_SITE_KEY = window.location.hostname === 'localhost'
    ? '1x00000000000000000000BB'
    : '0x4AAAAAAFy7x9aP5SjtIyxx';
  const TURNSTILE_WAIT_MS = 30000;

  async function request(path, { method = 'GET', body } = {}) {
    let response;
    try {
      response = await fetch(`/api${path}`, {
        method,
        credentials: 'same-origin',
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined
      });
    } catch {
      throw new Error('We could not reach the server. Please check your connection and try again.');
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(data?.error || 'Something went wrong. Please try again.');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  let turnstileScript;
  function loadTurnstile() {
    turnstileScript ||= new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = () => resolve(window.turnstile);
      script.onerror = () => {
        turnstileScript = null;
        reject(new Error('The security check could not load.'));
      };
      document.head.appendChild(script);
    });
    return turnstileScript;
  }

  /**
   * Renders the spam check into `container`. It stays invisible unless Cloudflare needs the
   * visitor to click it. Tokens are single-use, so call reset() after any failed submission.
   */
  function createSpamCheck(container) {
    let widgetId = null;
    const ready = loadTurnstile().then((turnstile) => {
      widgetId = turnstile.render(container, { sitekey: TURNSTILE_SITE_KEY, appearance: 'interaction-only' });
      return turnstile;
    });
    // Rendering can only fail once the form is used, which is when the visitor needs to hear about it.
    ready.catch(() => {});

    return {
      async getToken() {
        let turnstile;
        try {
          turnstile = await ready;
        } catch {
          throw new Error('The security check could not load. Please disable any content blocker for this site and try again.');
        }
        const deadline = Date.now() + TURNSTILE_WAIT_MS;
        while (Date.now() < deadline) {
          const token = turnstile.getResponse(widgetId);
          if (token) return token;
          await new Promise((resolve) => { setTimeout(resolve, 200); });
        }
        throw new Error('The security check did not finish. Please complete it if shown, then try again.');
      },
      reset() {
        if (widgetId !== null) window.turnstile?.reset(widgetId);
      }
    };
  }

  // Raw responses (an email's HTML) come back as text rather than JSON.
  async function requestText(path) {
    let response;
    try {
      response = await fetch(`/api${path}`, { credentials: 'same-origin' });
    } catch {
      throw new Error('We could not reach the server. Please check your connection and try again.');
    }
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      const error = new Error(data?.error || 'Something went wrong. Please try again.');
      error.status = response.status;
      throw error;
    }
    return response.text();
  }

  /** Sends one file as the raw request body, reporting progress from 0 to 1. */
  function upload(path, file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api${path}`);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.setRequestHeader('X-Filename', encodeURIComponent(file.name));
      xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress?.(event.loaded / event.total); };
      xhr.onload = () => {
        let data = null;
        try { data = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
        if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
        const error = new Error(data?.error || 'The file could not be attached.');
        error.status = xhr.status;
        reject(error);
      };
      xhr.onerror = () => reject(new Error('We could not reach the server. Please check your connection and try again.'));
      xhr.send(file);
    });
  }

  const id = encodeURIComponent;

  return {
    createSpamCheck,
    mail: {
      session: () => request('/mail/session'),
      login: (address, password) => request('/mail/login', { method: 'POST', body: { address, password } }),
      logout: () => request('/mail/logout', { method: 'POST', body: {} }),
      updateAccount: (settings) => request('/mail/account', { method: 'PUT', body: settings }),
      changePassword: (current, password) => request('/mail/account/password', { method: 'POST', body: { current, password } }),
      folders: () => request('/mail/folders'),
      list: ({ folder, q, before }) => request(`/mail/messages?${new URLSearchParams({ folder, ...(q ? { q } : {}), ...(before ? { before } : {}) })}`),
      get: (messageId) => request(`/mail/messages/${id(messageId)}`),
      html: (messageId) => requestText(`/mail/messages/${id(messageId)}/html`),
      attachmentUrl: (attachmentId) => `/api/mail/attachments/${id(attachmentId)}`,
      originalUrl: (messageId) => `/api/mail/messages/${id(messageId)}/original`,
      update: (ids, changes) => request('/mail/messages', { method: 'PATCH', body: { ids, ...changes } }),
      remove: (ids) => request('/mail/messages/delete', { method: 'POST', body: { ids } }),
      empty: (folder) => request(`/mail/folders/${id(folder)}/empty`, { method: 'POST', body: {} }),
      upload: (file, onProgress) => upload('/mail/uploads', file, onProgress),
      removeUpload: (uploadId) => request(`/mail/uploads/${id(uploadId)}`, { method: 'DELETE' }),
      saveDraft: (draftId, mail) => request(draftId ? `/mail/drafts/${id(draftId)}` : '/mail/drafts', { method: draftId ? 'PUT' : 'POST', body: mail }),
      send: (mail) => request('/mail/send', { method: 'POST', body: mail })
    },
    sendMessage: (fields) => request('/messages', { method: 'POST', body: fields }),
    recordView: (fields) => request('/views', { method: 'POST', body: fields }),
    listPosts: () => request('/posts'),
    getPost: (id) => request(`/posts/${encodeURIComponent(id)}`),
    admin: {
      session: () => request('/admin/session'),
      login: (email, password) => request('/admin/login', { method: 'POST', body: { email, password } }),
      logout: () => request('/admin/logout', { method: 'POST', body: {} }),
      messages: () => request('/admin/messages'),
      updateMessage: (id, changes) => request(`/admin/messages/${encodeURIComponent(id)}`, { method: 'PATCH', body: changes }),
      posts: () => request('/admin/posts'),
      createPost: (post) => request('/admin/posts', { method: 'POST', body: post }),
      updatePost: (id, post) => request(`/admin/posts/${encodeURIComponent(id)}`, { method: 'PUT', body: post }),
      deletePost: (id) => request(`/admin/posts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
      views: (since) => request(`/admin/views?since=${encodeURIComponent(since)}`),
      receipts: () => request('/admin/receipts'),
      createReceipt: (invoice, receipt) => request('/admin/receipts', { method: 'POST', body: { invoice, receipt } }),
      deleteReceipt: (id) => request(`/admin/receipts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
      sendReceipt: (id, pdf) => request(`/admin/receipts/${encodeURIComponent(id)}/send`, { method: 'POST', body: { pdf } }),
      updateInvoice: (id, invoice) => request(`/admin/invoices/${encodeURIComponent(id)}`, { method: 'PUT', body: invoice }),
      mailboxes: () => request('/admin/mailboxes'),
      createMailbox: (mailbox) => request('/admin/mailboxes', { method: 'POST', body: mailbox }),
      updateMailbox: (id, changes) => request(`/admin/mailboxes/${encodeURIComponent(id)}`, { method: 'PATCH', body: changes }),
      deleteMailbox: (id) => request(`/admin/mailboxes/${encodeURIComponent(id)}`, { method: 'DELETE' })
    }
  };
})();
