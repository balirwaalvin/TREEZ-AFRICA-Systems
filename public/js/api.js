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

  return {
    createSpamCheck,
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
      updateInvoice: (id, invoice) => request(`/admin/invoices/${encodeURIComponent(id)}`, { method: 'PUT', body: invoice })
    }
  };
})();
