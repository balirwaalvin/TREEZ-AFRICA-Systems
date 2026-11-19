/* ============================================
   TREEZ AFRICA SYSTEMS — Mail (mail.treez.tech)
   A mailbox for one treez.tech address: read, organise, write and send.
   The API is src/mail/; email HTML is shown in a sandboxed frame that can't run scripts.
   ============================================ */

(() => {
  const api = window.TREEZ_API.mail;
  const DOMAIN = 'treez.tech';
  const FOLDERS = { inbox: 'Inbox', starred: 'Starred', sent: 'Sent', drafts: 'Drafts', archive: 'Archive', spam: 'Junk', trash: 'Bin' };
  const POLL_MS = 60 * 1000;
  const AUTOSAVE_MS = 2500;
  const MAX_FILE_BYTES = 15 * 1024 * 1024;
  const baseTitle = document.title;

  const $ = (id) => document.getElementById(id);
  const els = {
    login: $('mailLogin'),
    loginForm: $('mailLoginForm'),
    loginMessage: $('loginMessage'),
    app: $('mailApp'),
    layout: $('mailLayout'),
    sidebarToggle: document.querySelector('.mail-menu-toggle'),
    list: $('messageList'),
    listTitle: $('listTitle'),
    selectAll: $('selectAll'),
    bulk: $('bulkActions'),
    loadMore: $('loadMore'),
    emptyFolder: $('emptyFolder'),
    reader: $('reader'),
    search: $('searchInput'),
    accountButton: $('accountButton'),
    accountMenu: $('accountMenu'),
    compose: $('compose'),
    composeForm: $('composeForm'),
    composeTitle: $('composeTitle'),
    composeStatus: $('composeStatus'),
    composeMessage: $('composeMessage'),
    composeAttachments: $('composeAttachments'),
    composeFiles: $('composeFiles'),
    known: $('knownAddresses'),
    settings: $('settingsDialog'),
    shortcuts: $('shortcutsDialog'),
    confirm: $('confirmDialog'),
    toast: $('toast')
  };

  const state = {
    account: null,
    folder: 'inbox',
    query: '',
    messages: [],
    next: null,
    listToken: 0,
    openId: null,
    open: null,
    selected: new Set(),
    counts: {},
    showImages: new Set(),
    known: new Set(),
    poll: null
  };

  // ---- Helpers ----

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const icons = () => window.lucide?.createIcons();
  const sameDay = (a, b) => a.toDateString() === b.toDateString();

  function listDate(iso) {
    const date = new Date(iso);
    const today = new Date();
    if (sameDay(date, today)) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (date.getFullYear() === today.getFullYear()) return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
    return date.toLocaleDateString([], { day: 'numeric', month: 'numeric', year: 'numeric' });
  }
  const fullDate = (iso) => new Date(iso).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  function fileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  /** "Jane Doe <jane@x.com>" → { name, address } */
  function parseAddress(value) {
    const match = String(value).trim().match(/^(.*?)\s*<([^<>]+)>$/);
    const address = (match ? match[2] : value).trim();
    const name = (match ? match[1] : '').trim().replace(/^"(.*)"$/, '$1');
    return { name, address };
  }
  const formatAddress = (name, address) => (name ? `${/[,;"<>@]/.test(name) ? `"${name.replace(/"/g, '')}"` : name} <${address}>` : address);
  const shortName = (value) => { const { name, address } = parseAddress(value); return name || address; };
  const myAddresses = () => [state.account.address, ...(state.account.aliases ?? [])].map((address) => address.toLowerCase());
  const isMe = (value) => myAddresses().includes(parseAddress(value).address.toLowerCase());
  /** The extra address (care@…) an incoming email came in through, when it wasn't sent to the mailbox's own address. */
  function viaAlias(message) {
    if (message.direction !== 'in' || !state.account.aliases?.length) return null;
    const to = [...(message.toList ?? []), ...(message.ccList ?? [])].map((value) => parseAddress(value).address.toLowerCase());
    if (to.includes(state.account.address.toLowerCase())) return null;
    return state.account.aliases.find((alias) => to.includes(alias)) ?? null;
  }

  /** Splits "a@x.com, \"Doe, Jane\" <j@x.com>; b@y.com" on commas and semicolons outside quotes and <>. */
  function splitAddresses(value) {
    const parts = [];
    let current = '';
    let quoted = false;
    let angled = false;
    for (const character of String(value)) {
      if (character === '"') quoted = !quoted;
      else if (character === '<' && !quoted) angled = true;
      else if (character === '>' && !quoted) angled = false;
      if ((character === ',' || character === ';') && !quoted && !angled) { parts.push(current); current = ''; } else current += character;
    }
    parts.push(current);
    return parts.map((part) => part.trim()).filter(Boolean);
  }
  const validAddress = (value) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(parseAddress(value).address);

  function initials(name) {
    return String(name || '?').replace(/["<>]/g, '').trim().split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
  }
  function hue(text) {
    let hash = 0;
    for (const character of String(text)) hash = (hash * 31 + character.charCodeAt(0)) % 360;
    return hash;
  }
  const avatar = (name, address) => `<span class="mail-avatar" style="--hue:${hue(address)}" aria-hidden="true">${escapeHtml(initials(name || address))}</span>`;

  function showMessage(element, message, kind = '') {
    element.textContent = message;
    element.className = `mail-message${kind ? ` ${kind}` : ''}`;
  }

  let toastTimer = null;
  function toast(text, undo) {
    clearTimeout(toastTimer);
    els.toast.querySelector('[data-toast-text]').textContent = text;
    const button = els.toast.querySelector('[data-toast-undo]');
    button.hidden = !undo;
    button.onclick = undo ? () => { els.toast.hidden = true; undo(); } : null;
    els.toast.hidden = false;
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, undo ? 8000 : 4000);
  }

  function confirmAction({ title, body, confirm }) {
    const dialog = els.confirm;
    dialog.querySelector('[data-confirm-title]').textContent = title;
    dialog.querySelector('[data-confirm-body]').textContent = body;
    dialog.querySelector('[data-confirm-button]').textContent = confirm;
    dialog.returnValue = '';
    dialog.showModal();
    return new Promise((resolve) => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true }));
  }

  /** A session can end while the page is open (signed out elsewhere, password changed). */
  function handleError(error, fallback) {
    if (error?.status === 401) { showLogin('Your session ended. Please sign in again.'); return; }
    toast(error?.message || fallback);
  }

  // ---- Signing in and out ----

  async function start() {
    try {
      state.account = await api.session();
      showApp();
    } catch {
      showLogin();
    }
  }

  function showLogin(message = '') {
    clearInterval(state.poll);
    els.app.hidden = true;
    els.compose.hidden = true;
    els.login.hidden = false;
    document.title = baseTitle;
    showMessage(els.loginMessage, message, message ? 'error' : '');
    els.loginForm.elements.address.focus();
    icons();
  }

  els.loginForm.elements.address.addEventListener('input', (event) => {
    event.target.closest('.mail-address-input').classList.toggle('has-domain', event.target.value.includes('@'));
  });

  els.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = els.loginForm.elements;
    const button = els.loginForm.querySelector('button[type="submit"]');
    if (!form.address.value.trim() || !form.password.value) { showMessage(els.loginMessage, 'Enter your email address and password.', 'error'); return; }
    button.disabled = true;
    showMessage(els.loginMessage, 'Signing in…');
    try {
      state.account = await api.login(form.address.value.trim(), form.password.value);
      els.loginForm.reset();
      showApp();
    } catch (error) {
      showMessage(els.loginMessage, error.message || 'Unable to sign in.', 'error');
    } finally {
      button.disabled = false;
    }
  });

  async function logout() {
    await saveDraftNow().catch(() => {});
    // Signed-out devices get no notifications. Signing in again turns them back on.
    await dropSubscription();
    setAppBadge(0);
    await api.logout().catch(() => {});
    state.account = null;
    state.messages = [];
    closeComposeNow();
    window.location.hash = '';
    showLogin();
  }

  function showApp() {
    els.login.hidden = true;
    els.app.hidden = false;
    renderAccount();
    applyHash();
    refreshCounts();
    syncPush();
    clearInterval(state.poll);
    state.poll = setInterval(() => { if (document.visibilityState === 'visible') checkForNewMail(); }, POLL_MS);
    icons();
  }

  function renderAccount() {
    const { displayName, address } = state.account;
    $('accountName').textContent = displayName;
    $('accountAddress').textContent = address;
    const badge = $('accountAvatar');
    badge.textContent = initials(displayName);
    badge.style.setProperty('--hue', hue(address));
  }

  // ---- Folders and the URL ----

  function applyHash() {
    // The app's "Compose" shortcut (manifest.webmanifest).
    if (window.location.hash === '#compose') {
      history.replaceState(null, '', '#inbox');
      openCompose();
    }
    const [folder, id] = window.location.hash.slice(1).split('/');
    const next = FOLDERS[folder] ? folder : 'inbox';
    // Opening an email (even a search result) keeps the list as it is; only a new folder reloads it.
    if (next !== state.folder || !state.listLoadedOnce) {
      state.folder = next;
      state.query = '';
      els.search.value = '';
      state.selected.clear();
      loadList();
    }
    document.querySelectorAll('[data-folder]').forEach((link) => link.classList.toggle('active', link.dataset.folder === state.folder));
    els.layout.classList.remove('is-sidebar-open');
    els.sidebarToggle.setAttribute('aria-expanded', 'false');
    if (id) openMessage(decodeURIComponent(id));
    else closeReader();
  }
  window.addEventListener('hashchange', () => { if (state.account) applyHash(); });

  const goTo = (folder, id) => { window.location.hash = id ? `${folder}/${encodeURIComponent(id)}` : folder; };

  async function refreshCounts() {
    try {
      state.counts = await api.folders();
    } catch (error) {
      if (error.status === 401) handleError(error);
      return;
    }
    for (const [folder, count] of Object.entries(state.counts)) {
      const badge = document.querySelector(`[data-count="${folder}"]`);
      if (!badge) continue;
      // Unread counts for most folders; Drafts shows how many there are.
      const value = folder === 'drafts' ? count.total : ['sent', 'trash'].includes(folder) ? 0 : count.unread;
      badge.textContent = value ? String(value) : '';
    }
    updateTitle();
    renderToolbar();
  }

  function updateTitle() {
    if (!state.account) return;
    const unread = state.counts.inbox?.unread ?? 0;
    setAppBadge(unread);
    document.title = `${unread ? `(${unread}) ` : ''}${FOLDERS[state.folder]} · ${state.account.address}`;
  }

  // ---- The message list ----

  async function loadList({ append = false } = {}) {
    const token = ++state.listToken;
    state.listLoadedOnce = true;
    if (!append) {
      state.messages = [];
      state.next = null;
      els.list.innerHTML = '<p class="mail-empty">Loading…</p>';
    }
    els.listTitle.textContent = state.query ? `Results for “${state.query}”` : FOLDERS[state.folder];
    updateTitle();
    renderToolbar();
    try {
      const page = await api.list({ folder: state.folder, q: state.query, before: append ? state.next : '' });
      if (token !== state.listToken) return;
      state.messages = append ? [...state.messages, ...page.documents] : page.documents;
      state.next = page.next;
      rememberAddresses(page.documents);
      renderList();
    } catch (error) {
      if (token !== state.listToken) return;
      els.list.innerHTML = `<p class="mail-empty">${escapeHtml(error.message || 'Could not load emails.')}</p>`;
      handleError(error, 'Could not load emails.');
    }
  }

  function rememberAddresses(messages) {
    for (const message of messages) {
      if (message.direction === 'in' && message.fromAddress) state.known.add(formatAddress(message.fromName, message.fromAddress));
      for (const to of message.toList ?? []) if (!isMe(to)) state.known.add(to);
    }
    els.known.innerHTML = [...state.known].slice(-300).map((address) => `<option value="${escapeHtml(address)}"></option>`).join('');
  }

  function rowPeople(message) {
    if (message.folder === 'drafts' || message.direction === 'out') {
      const names = (message.toList ?? []).map(shortName).join(', ');
      return `To: ${names || '(no recipients)'}`;
    }
    return message.fromName || message.fromAddress;
  }

  function rowTags(message) {
    const tags = [];
    if (message.folder === 'drafts') tags.push('<span class="mail-tag mail-tag-draft">Draft</span>');
    const alias = viaAlias(message);
    if (alias) tags.push(`<span class="mail-tag">${escapeHtml(alias.split('@')[0])}@</span>`);
    if (state.query && message.folder !== 'inbox') tags.push(`<span class="mail-tag">${escapeHtml(FOLDERS[message.folder])}</span>`);
    if (message.delivery === 'bounced') tags.push('<span class="mail-tag mail-tag-bad">Bounced</span>');
    if (message.delivery === 'complained') tags.push('<span class="mail-tag mail-tag-bad">Marked as spam</span>');
    return tags.join(' ');
  }

  function renderList() {
    if (!state.messages.length) {
      const empty = state.query ? 'No emails match your search.' : { inbox: 'Your inbox is empty.', starred: 'Star emails to keep them here.', drafts: 'No drafts.', spam: 'No junk. Nice.', trash: 'The bin is empty.' }[state.folder] ?? 'Nothing here yet.';
      els.list.innerHTML = `<div class="mail-empty"><i data-lucide="${state.query ? 'search-x' : 'inbox'}"></i><p>${empty}</p></div>`;
    } else {
      els.list.innerHTML = state.messages.map((message) => {
        const classes = ['mail-row', !message.isRead && 'is-unread', message.id === state.openId && 'is-open', state.selected.has(message.id) && 'is-selected'].filter(Boolean).join(' ');
        return `<div class="${classes}" role="listitem" data-row="${escapeHtml(message.id)}" tabindex="0">
          <label class="mail-check" title="Select"><input type="checkbox" data-select="${escapeHtml(message.id)}" ${state.selected.has(message.id) ? 'checked' : ''} aria-label="Select email"><span></span></label>
          <span class="mail-row-from">${escapeHtml(rowPeople(message))}</span>
          <span class="mail-row-meta">${message.hasAttachments ? '<i data-lucide="paperclip" aria-label="Has attachments"></i>' : ''}${message.isStarred ? '<i data-lucide="star" class="is-starred" aria-label="Starred"></i>' : ''}<time datetime="${escapeHtml(message.date)}">${escapeHtml(listDate(message.date))}</time></span>
          <span class="mail-row-text">${rowTags(message)} <strong>${escapeHtml(message.subject || '(no subject)')}</strong>${message.snippet ? ` — ${escapeHtml(message.snippet)}` : ''}</span>
        </div>`;
      }).join('');
    }
    els.loadMore.hidden = !state.next;
    renderToolbar();
    icons();
  }

  function renderToolbar() {
    const selected = state.selected.size;
    els.bulk.hidden = !selected;
    els.selectAll.checked = selected > 0 && selected === state.messages.length;
    els.selectAll.indeterminate = selected > 0 && selected < state.messages.length;
    const folder = state.folder;
    const bin = folder === 'trash' || folder === 'spam';
    const show = (name, visible) => { els.bulk.querySelector(`[data-bulk="${name}"]`).hidden = !visible; };
    show('read', folder !== 'drafts');
    show('unread', folder !== 'drafts');
    show('archive', !bin && folder !== 'drafts' && folder !== 'archive');
    show('restore', bin || folder === 'archive');
    show('trash', !bin && folder !== 'drafts');
    show('delete', bin || folder === 'drafts');
    const total = state.counts[folder]?.total ?? 0;
    els.emptyFolder.hidden = state.query || !bin || !total;
    els.emptyFolder.textContent = folder === 'spam' ? 'Empty Junk' : 'Empty Bin';
  }

  /** Every minute: refresh the counts and add any new emails to the top of the list. */
  async function checkForNewMail() {
    await refreshCounts();
    if (state.query || state.selected.size || !['inbox', 'starred'].includes(state.folder)) return;
    try {
      const page = await api.list({ folder: state.folder });
      const known = new Set(state.messages.map((message) => message.id));
      const fresh = page.documents.filter((message) => !known.has(message.id));
      if (!fresh.length) return;
      state.messages = [...fresh, ...state.messages].sort((a, b) => (a.date < b.date ? 1 : -1));
      rememberAddresses(fresh);
      renderList();
    } catch {
      // Try again next time.
    }
  }

  const byId = (id) => state.messages.find((message) => message.id === id);

  function patchLocal(ids, changes) {
    for (const id of ids) {
      const message = byId(id);
      if (message) Object.assign(message, changes);
      if (state.open?.id === id) Object.assign(state.open, changes);
    }
  }

  /** Whether an email still belongs in the list being shown after a change. */
  function belongsHere(message) {
    if (state.query) return !['trash', 'spam'].includes(message.folder);
    if (state.folder === 'starred') return message.isStarred && message.folder !== 'trash';
    return message.folder === state.folder;
  }

  async function setFlags(ids, changes) {
    const local = {};
    if ('read' in changes) local.isRead = changes.read;
    if ('starred' in changes) local.isStarred = changes.starred;
    patchLocal(ids, local);
    renderList();
    if (state.open && ids.includes(state.open.id)) renderReaderActions();
    try {
      await api.update(ids, changes);
    } catch (error) {
      handleError(error, 'That change could not be saved.');
    }
    refreshCounts();
  }

  /** Moves emails, then offers to undo by moving each back where it was. */
  async function move(ids, folder, label) {
    const targets = ids.map((id) => byId(id) ?? (state.open?.id === id ? state.open : null)).filter(Boolean);
    const previous = new Map(targets.map((message) => [message.id, message.folder]));
    // Sent mail can't go to the inbox: "back" means Sent.
    const destination = (message) => (folder === 'inbox' && message.direction === 'out' ? 'sent' : folder);
    const groups = new Map();
    for (const message of targets) {
      const to = destination(message);
      if (!groups.has(to)) groups.set(to, []);
      groups.get(to).push(message.id);
    }
    try {
      await Promise.all([...groups].map(([to, group]) => api.update(group, { folder: to })));
    } catch (error) {
      handleError(error, 'Those emails could not be moved.');
      return;
    }
    for (const message of targets) message.folder = destination(message);
    afterRemoval(ids);
    refreshCounts();
    toast(label, async () => {
      const back = new Map();
      for (const [id, from] of previous) {
        if (!back.has(from)) back.set(from, []);
        back.get(from).push(id);
      }
      await Promise.all([...back].map(([from, group]) => api.update(group, { folder: from }))).catch((error) => handleError(error, 'Undo failed.'));
      refreshCounts();
      loadList();
    });
  }

  async function deleteForever(ids) {
    const count = ids.length;
    const ok = await confirmAction({
      title: count === 1 ? 'Delete this email forever?' : `Delete ${count} emails forever?`,
      body: "They'll be gone for good, along with their attachments. This can't be undone.",
      confirm: 'Delete forever'
    });
    if (!ok) return;
    try {
      await api.remove(ids);
    } catch (error) {
      handleError(error, 'Those emails could not be deleted.');
      return;
    }
    for (const id of ids) { const message = byId(id); if (message) message.folder = 'deleted'; }
    afterRemoval(ids);
    refreshCounts();
    toast(count === 1 ? 'Email deleted.' : `${count} emails deleted.`);
  }

  function afterRemoval(ids) {
    const openGone = state.open && ids.includes(state.open.id) && !belongsHere(state.open);
    // Opening the next email after archiving the open one keeps you moving through the inbox.
    let nextId = null;
    if (openGone) {
      const index = state.messages.findIndex((message) => message.id === state.open.id);
      const after = state.messages.slice(index + 1).find((message) => belongsHere(message) && !ids.includes(message.id));
      nextId = window.matchMedia('(min-width: 761px)').matches ? after?.id ?? null : null;
    }
    state.messages = state.messages.filter((message) => belongsHere(message));
    for (const id of ids) state.selected.delete(id);
    renderList();
    if (openGone) goTo(state.folder, nextId);
  }

  els.list.addEventListener('click', (event) => {
    const checkbox = event.target.closest('[data-select]');
    if (checkbox) {
      const id = checkbox.dataset.select;
      if (checkbox.checked) state.selected.add(id); else state.selected.delete(id);
      checkbox.closest('.mail-row').classList.toggle('is-selected', checkbox.checked);
      renderToolbar();
      return;
    }
    if (event.target.closest('.mail-check')) return;
    const row = event.target.closest('[data-row]');
    if (row) openRow(row.dataset.row);
  });
  els.list.addEventListener('keydown', (event) => {
    const row = event.target.closest('[data-row]');
    if (row && (event.key === 'Enter' || event.key === ' ') && event.target === row) { event.preventDefault(); openRow(row.dataset.row); }
  });

  function openRow(id) {
    const message = byId(id);
    if (message?.folder === 'drafts') { openDraft(id); return; }
    goTo(state.folder, id);
  }

  els.selectAll.addEventListener('change', () => {
    if (els.selectAll.checked) state.messages.forEach((message) => state.selected.add(message.id));
    else state.selected.clear();
    renderList();
  });

  els.bulk.addEventListener('click', (event) => {
    const button = event.target.closest('[data-bulk]');
    if (!button) return;
    const ids = [...state.selected];
    if (!ids.length) return;
    const action = button.dataset.bulk;
    const n = ids.length === 1 ? 'Email' : `${ids.length} emails`;
    if (action === 'read' || action === 'unread') setFlags(ids, { read: action === 'read' });
    else if (action === 'archive') move(ids, 'archive', `${n} archived.`);
    else if (action === 'trash') move(ids, 'trash', `${n} moved to the Bin.`);
    else if (action === 'restore') move(ids, 'inbox', `${n} moved back.`);
    else if (action === 'delete') deleteForever(ids);
  });

  els.emptyFolder.addEventListener('click', async () => {
    const folder = state.folder;
    const name = folder === 'spam' ? 'Junk' : 'the Bin';
    const ok = await confirmAction({ title: `Empty ${name}?`, body: `Every email in ${name} will be deleted forever. This can't be undone.`, confirm: `Empty ${name}` });
    if (!ok) return;
    try {
      const { deleted } = await api.empty(folder);
      toast(`${deleted} ${deleted === 1 ? 'email' : 'emails'} deleted.`);
    } catch (error) {
      handleError(error, 'Could not empty the folder.');
    }
    goTo(folder);
    loadList();
    refreshCounts();
  });

  els.loadMore.addEventListener('click', () => loadList({ append: true }));

  $('searchForm').addEventListener('submit', (event) => {
    event.preventDefault();
    state.query = els.search.value.trim();
    state.selected.clear();
    closeReader();
    if (window.location.hash.includes('/')) history.replaceState(null, '', `#${state.folder}`);
    loadList();
  });
  els.search.addEventListener('search', () => {
    if (!els.search.value && state.query) { state.query = ''; loadList(); }
  });

  // ---- Reading ----

  function closeReader() {
    state.openId = null;
    state.open = null;
    els.layout.classList.remove('is-reading');
    els.reader.innerHTML = '<div class="mail-reader-empty"><div><i data-lucide="mail"></i><p>Choose an email to read it.</p></div></div>';
    document.querySelectorAll('.mail-row.is-open').forEach((row) => row.classList.remove('is-open'));
    icons();
  }

  async function openMessage(id) {
    state.openId = id;
    els.layout.classList.add('is-reading');
    document.querySelectorAll('.mail-row').forEach((row) => row.classList.toggle('is-open', row.dataset.row === id));
    els.reader.innerHTML = '<div class="mail-reader-empty"><p>Loading…</p></div>';
    let message;
    try {
      message = await api.get(id);
    } catch (error) {
      if (state.openId !== id) return;
      els.reader.innerHTML = `<div class="mail-reader-empty"><p>${escapeHtml(error.message || 'This email could not be opened.')}</p></div>`;
      if (error.status === 401) handleError(error);
      return;
    }
    if (state.openId !== id) return;
    if (message.folder === 'drafts') { closeReader(); openDraft(id, message); return; }
    state.open = message;
    renderReader();
    if (!message.isRead) setFlags([id], { read: true });
  }

  function senderLine(message) {
    const from = message.direction === 'out' ? message.fromName || state.account.displayName : message.fromName || message.fromAddress;
    const fromAddress = message.fromAddress || state.account.address;
    const list = (label, values) => (values?.length ? `<div class="mail-sender-to">${label}: ${values.map((value) => escapeHtml(value)).join(', ')}</div>` : '');
    return `<div class="mail-sender">
      ${avatar(from, fromAddress)}
      <div>
        <div class="mail-sender-name">${escapeHtml(from)} <small>&lt;${escapeHtml(fromAddress)}&gt;</small></div>
        ${list('To', message.toList)}${list('Cc', message.ccList)}${list('Bcc', message.bccList)}
        ${message.replyTo && message.replyTo !== message.fromAddress ? list('Reply to', [message.replyTo]) : ''}
      </div>
      <time class="mail-sender-date" datetime="${escapeHtml(message.date)}">${escapeHtml(fullDate(message.date))}</time>
    </div>`;
  }

  const DELIVERY = { sent: ['Sending', ''], delivered: ['Delivered', 'mail-tag-good'], bounced: ['Bounced', 'mail-tag-bad'], complained: ['Marked as spam by recipient', 'mail-tag-bad'], delayed: ['Delivery delayed', ''] };

  function banners(message) {
    const out = [];
    const auth = message.auth || {};
    const failed = ['spf', 'dkim', 'dmarc'].filter((check) => auth[check] === 'fail');
    if (message.direction === 'in' && failed.length) {
      out.push(`<div class="mail-banner mail-banner-warn"><i data-lucide="shield-alert"></i><span>This email failed the ${failed.map((check) => check.toUpperCase()).join(', ')} sender ${failed.length === 1 ? 'check' : 'checks'}, so it may not really be from ${escapeHtml(message.fromAddress)}. Be careful with its links and attachments.</span></div>`);
    }
    if (message.folder === 'spam') out.push('<div class="mail-banner"><i data-lucide="shield-alert"></i><span>This email is in Junk.</span><button class="mail-button mail-button-small" data-read="not-junk" type="button">Not junk</button></div>');
    if (message.folder === 'trash') out.push('<div class="mail-banner"><i data-lucide="trash-2"></i><span>This email is in the Bin.</span><button class="mail-button mail-button-small" data-read="restore" type="button">Move back</button></div>');
    if (message.delivery === 'bounced') out.push('<div class="mail-banner mail-banner-warn"><i data-lucide="circle-alert"></i><span>This email bounced: at least one recipient\'s mail server refused it. Check the address and try again.</span></div>');
    return out.join('');
  }

  function renderReader() {
    const message = state.open;
    const visible = (message.attachments ?? []).filter((attachment) => !(attachment.inline && message.hasHtml));
    const delivery = message.direction === 'out' && DELIVERY[message.delivery];
    els.reader.innerHTML = `
      <div class="mail-reader-actions" id="readerActions"></div>
      <header class="mail-reader-head">
        <h1>${escapeHtml(message.subject || '(no subject)')} ${delivery ? `<span class="mail-tag ${delivery[1]}">${delivery[0]}</span>` : ''}</h1>
        ${senderLine(message)}
      </header>
      ${banners(message)}
      <div class="mail-body" id="readerBody"></div>
      ${visible.length ? `<ul class="mail-attachments">${visible.map((attachment) => `<li><a class="mail-attachment" href="${api.attachmentUrl(attachment.id)}" download="${escapeHtml(attachment.filename)}"><i data-lucide="paperclip"></i><span>${escapeHtml(attachment.filename)}</span><small>${fileSize(attachment.size)}</small></a></li>`).join('')}</ul>` : ''}
      <div class="mail-reply-bar">
        ${message.direction === 'in' ? '<button class="mail-button" data-read="reply" type="button"><i data-lucide="reply"></i> Reply</button>' : ''}
        <button class="mail-button" data-read="reply-all" type="button"><i data-lucide="reply-all"></i> Reply all</button>
        <button class="mail-button" data-read="forward" type="button"><i data-lucide="forward"></i> Forward</button>
      </div>`;
    renderReaderActions();
    renderBody(message);
    els.reader.scrollTop = 0;
  }

  function renderReaderActions() {
    const message = state.open;
    const bar = $('readerActions');
    if (!message || !bar) return;
    const button = (action, icon, label, extra = '') => `<button class="mail-icon-button ${extra}" data-read="${action}" type="button" title="${label}" aria-label="${label}"><i data-lucide="${icon}"></i></button>`;
    const parts = [button('back', 'arrow-left', 'Back to list', 'mail-back')];
    if (message.folder === 'trash') parts.push(button('restore', 'undo-2', 'Move back'), button('delete', 'trash', 'Delete forever'));
    else if (message.folder === 'spam') parts.push(button('not-junk', 'inbox', 'Not junk'), button('trash', 'trash-2', 'Move to Bin'), button('delete', 'trash', 'Delete forever'));
    else {
      parts.push(message.folder === 'archive' ? button('restore', 'inbox', message.direction === 'out' ? 'Move to Sent' : 'Move to Inbox') : button('archive', 'archive', 'Archive'));
      if (message.direction === 'in') parts.push(button('junk', 'shield-alert', 'Report junk'));
      parts.push(button('trash', 'trash-2', 'Move to Bin'));
    }
    parts.push(button('unread', 'mail', 'Mark as unread'));
    parts.push(button('star', 'star', message.isStarred ? 'Unstar' : 'Star', message.isStarred ? 'is-on' : ''));
    parts.push('<span class="mail-spacer"></span>');
    if (message.direction === 'in') parts.push(button('reply', 'reply', 'Reply'));
    parts.push(button('forward', 'forward', 'Forward'));
    if (message.hasOriginal) parts.push(`<a class="mail-icon-button" href="${api.originalUrl(message.id)}" title="Download original (.eml)" aria-label="Download original"><i data-lucide="file-down"></i></a>`);
    bar.innerHTML = parts.join('');
    icons();
  }

  /** Plain text, with links made clickable and quoted lines dimmed, built as DOM nodes rather than HTML. */
  function textNode(text) {
    const pre = document.createElement('div');
    pre.className = 'mail-body-text';
    const lines = String(text || '').split('\n');
    lines.forEach((line, index) => {
      const holder = line.startsWith('>') ? Object.assign(document.createElement('span'), { className: 'mail-quote' }) : pre;
      let last = 0;
      for (const match of line.matchAll(/\b(?:https?:\/\/|mailto:)[^\s<>"']+[^\s<>"'.,;:!?)\]]/g)) {
        holder.append(line.slice(last, match.index));
        const link = document.createElement('a');
        link.href = match[0];
        link.textContent = match[0];
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        holder.append(link);
        last = match.index + match[0].length;
      }
      holder.append(line.slice(last));
      if (holder !== pre) pre.append(holder);
      if (index < lines.length - 1) pre.append('\n');
    });
    return pre;
  }

  const REMOTE = /<img\b[^>]*\ssrc\s*=\s*["']?\s*(?:https?:)?\/\/|url\(\s*["']?\s*(?:https?:)?\/\/|\sbackground\s*=\s*["']?\s*(?:https?:)?\/\//i;

  function readAsDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /** Pictures embedded in the email (cid: links) become data: URLs, since the frame can't fetch from this site. */
  async function inlineImages(html, message) {
    if (!/cid:/i.test(html)) return html;
    for (const attachment of message.attachments ?? []) {
      if (!attachment.contentId || !/^image\//.test(attachment.contentType)) continue;
      try {
        const response = await fetch(api.attachmentUrl(attachment.id), { credentials: 'same-origin' });
        if (!response.ok) continue;
        const data = await readAsDataUrl(await response.blob());
        const cid = attachment.contentId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        html = html.replace(new RegExp(`cid:${cid}`, 'gi'), data);
      } catch {
        // Leave that picture out.
      }
    }
    return html;
  }

  async function renderBody(message) {
    const body = $('readerBody');
    if (!message.hasHtml) { body.replaceChildren(textNode(message.text || '(This email has no text.)')); return; }
    body.innerHTML = '<p class="mail-muted">Loading…</p>';
    let html;
    try {
      // A refresh tag could send the frame to another page; the page's own policy blocks that too.
      html = (await inlineImages(await api.html(message.id), message)).replace(/<meta\b[^>]*http-equiv\s*=\s*["']?\s*refresh[^>]*>/gi, '');
    } catch {
      if (state.open?.id === message.id) body.replaceChildren(textNode(message.text));
      return;
    }
    if (state.open?.id !== message.id) return;
    const remote = REMOTE.test(html);
    const allowed = state.showImages.has(message.id);
    // The frame runs no scripts and has no access to this page; its policy also blocks
    // pictures from other sites (which can track opening the email) until they're asked for.
    const policy = `default-src 'none'; img-src data: ${allowed ? 'https: http:' : ''}; style-src 'unsafe-inline' ${allowed ? 'https:' : ''}; font-src data: ${allowed ? 'https:' : ''}`;
    const frame = document.createElement('iframe');
    frame.className = 'mail-body-frame';
    frame.title = 'Email content';
    frame.setAttribute('sandbox', 'allow-popups allow-popups-to-escape-sandbox');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><base target="_blank"><style>html{color-scheme:light}body{margin:0;padding:16px;font:14px/1.5 Arial,Helvetica,sans-serif;color:#1a1a1a;background:#fff;overflow-wrap:anywhere}img{max-width:100%;height:auto}pre{white-space:pre-wrap}</style></head><body>${html}</body></html>`;
    const parts = [];
    if (remote && !allowed) {
      const banner = document.createElement('div');
      banner.className = 'mail-banner';
      banner.innerHTML = '<i data-lucide="image-off"></i><span>Pictures from the web are hidden to protect your privacy.</span><button class="mail-button mail-button-small" data-read="show-images" type="button">Show pictures</button>';
      banner.style.margin = '0 0 12px';
      parts.push(banner);
    }
    parts.push(frame);
    body.replaceChildren(...parts);
    icons();
  }

  els.reader.addEventListener('click', (event) => {
    const button = event.target.closest('[data-read]');
    if (!button || !state.open) return;
    readerAction(button.dataset.read);
  });

  function readerAction(action) {
    const message = state.open;
    if (!message) return;
    const ids = [message.id];
    if (action === 'back') goTo(state.folder);
    else if (action === 'reply') openReply(message, false);
    else if (action === 'reply-all') openReply(message, true);
    else if (action === 'forward') openForward(message);
    else if (action === 'archive') move(ids, 'archive', 'Email archived.');
    else if (action === 'restore') move(ids, 'inbox', message.direction === 'out' ? 'Moved to Sent.' : 'Moved to Inbox.');
    else if (action === 'junk') move(ids, 'spam', 'Moved to Junk.');
    else if (action === 'not-junk') move(ids, 'inbox', 'Moved to Inbox.');
    else if (action === 'trash') move(ids, 'trash', 'Moved to the Bin.');
    else if (action === 'delete') deleteForever(ids);
    else if (action === 'unread') { setFlags(ids, { read: false }); goTo(state.folder); }
    else if (action === 'star') setFlags(ids, { starred: !message.isStarred });
    else if (action === 'show-images') { state.showImages.add(message.id); renderBody(message); }
  }

  // ---- Writing ----

  const compose = {
    open: false,
    draftId: null,
    inReplyTo: '',
    attachments: [], // { key, id, filename, size, status: 'uploading' | 'done' | 'error', progress, pending }
    dirty: false,
    timer: null,
    saving: Promise.resolve(),
    sending: false
  };
  const field = (name) => els.composeForm.elements[name];
  const signatureBlock = () => (state.account.signature ? `\n\n--\n${state.account.signature}` : '');

  function quoteOf(message) {
    const who = formatAddress(message.fromName || state.account.displayName, message.fromAddress || state.account.address);
    const quoted = String(message.text || '').split('\n').map((line) => (line.startsWith('>') ? `>${line}` : `> ${line}`)).join('\n');
    return `On ${fullDate(message.date)}, ${who} wrote:\n${quoted}`;
  }
  const prefixed = (prefix, subject) => (new RegExp(`^${prefix}:`, 'i').test(subject || '') ? subject : `${prefix}: ${subject || ''}`.trim());

  function openReply(message, all) {
    let to;
    let cc = [];
    if (message.direction === 'out') {
      to = message.toList;
      if (all) cc = message.ccList;
    } else {
      to = [message.replyTo || formatAddress(message.fromName, message.fromAddress)];
      if (all) {
        to = [...to, ...message.toList.filter((address) => !isMe(address))];
        cc = message.ccList.filter((address) => !isMe(address));
      }
    }
    const unique = (values) => [...new Map(values.map((value) => [parseAddress(value).address.toLowerCase(), value])).values()];
    openCompose({
      title: all ? 'Reply all' : 'Reply',
      to: unique(to),
      cc: unique(cc).filter((value) => !unique(to).some((other) => parseAddress(other).address.toLowerCase() === parseAddress(value).address.toLowerCase())),
      subject: prefixed('Re', message.subject),
      text: `${signatureBlock()}\n\n${quoteOf(message)}`,
      inReplyTo: message.id,
      from: message.direction === 'out' ? message.fromAddress : viaAlias(message)
    });
  }

  function openForward(message) {
    const from = formatAddress(message.fromName || state.account.displayName, message.fromAddress || state.account.address);
    const header = ['---------- Forwarded message ----------', `From: ${from}`, `Date: ${fullDate(message.date)}`, `Subject: ${message.subject}`, `To: ${message.toList.join(', ')}`, ...(message.ccList.length ? [`Cc: ${message.ccList.join(', ')}`] : [])].join('\n');
    const attachments = (message.attachments ?? []).filter((attachment) => !(attachment.inline && message.hasHtml));
    openCompose({
      title: 'Forward',
      subject: prefixed('Fwd', message.subject),
      text: `${signatureBlock()}\n\n${header}\n\n${message.text || ''}`,
      attachments: attachments.map((attachment) => ({ id: attachment.id, filename: attachment.filename, size: attachment.size, status: 'done' })),
      focus: 'to'
    });
  }

  async function openDraft(id, loaded) {
    try {
      const draft = loaded ?? await api.get(id);
      openCompose({
        title: 'Draft',
        draftId: draft.id,
        to: draft.toList,
        cc: draft.ccList,
        bcc: draft.bccList,
        subject: draft.subject,
        text: draft.text,
        inReplyTo: draft.draftReplyTo,
        from: draft.fromAddress,
        attachments: draft.attachments.map((attachment) => ({ id: attachment.id, filename: attachment.filename, size: attachment.size, status: 'done' })),
        focus: draft.toList.length ? 'text' : 'to'
      });
    } catch (error) {
      handleError(error, 'That draft could not be opened.');
    }
  }

  async function openCompose(options = {}) {
    // One email at a time: whatever was being written is kept as a draft first.
    if (compose.open) await closeCompose();
    compose.open = true;
    compose.draftId = options.draftId ?? null;
    compose.inReplyTo = options.inReplyTo ?? '';
    compose.attachments = (options.attachments ?? []).map((attachment) => ({ ...attachment, key: crypto.randomUUID() }));
    compose.dirty = !!options.attachments?.length && !options.draftId;
    field('to').value = (options.to ?? []).join(', ');
    field('cc').value = (options.cc ?? []).join(', ');
    field('bcc').value = (options.bcc ?? []).join(', ');
    // Mailboxes with extra addresses (care@…) choose which one the email comes from.
    const senders = [state.account.address, ...(state.account.aliases ?? [])];
    field('from').innerHTML = senders.map((address) => `<option value="${escapeHtml(address)}">${escapeHtml(formatAddress(state.account.displayName, address))}</option>`).join('');
    field('from').value = senders.includes(options.from) ? options.from : state.account.address;
    els.composeForm.querySelector('[data-field="from"]').hidden = senders.length < 2;
    field('subject').value = options.subject ?? '';
    field('text').value = options.text ?? signatureBlock();
    els.composeForm.querySelector('[data-field="cc"]').hidden = !field('cc').value;
    els.composeForm.querySelector('[data-field="bcc"]').hidden = !field('bcc').value;
    els.composeTitle.textContent = options.title ?? 'New email';
    els.composeStatus.textContent = options.draftId ? 'Draft' : '';
    showMessage(els.composeMessage, '');
    els.compose.classList.remove('is-minimized');
    els.compose.hidden = false;
    renderComposeAttachments();
    icons();
    const focus = options.focus ?? (options.to?.length ? 'text' : 'to');
    const target = field(focus);
    target.focus();
    if (focus === 'text') target.setSelectionRange(0, 0);
    target.scrollTop = 0;
  }

  function composedMail() {
    return {
      to: splitAddresses(field('to').value),
      cc: splitAddresses(field('cc').value),
      bcc: splitAddresses(field('bcc').value),
      subject: field('subject').value.replace(/[\r\n]+/g, ' ').trim(),
      text: field('text').value,
      attachments: compose.attachments.filter((attachment) => attachment.status === 'done').map((attachment) => attachment.id),
      inReplyTo: compose.inReplyTo || undefined,
      from: field('from').value || state.account.address
    };
  }

  /** Worth keeping as a draft: anything beyond an empty form with a signature. */
  function hasContent(mail) {
    return mail.to.length || mail.cc.length || mail.bcc.length || mail.subject || mail.attachments.length || mail.text.replace(signatureBlock(), '').trim();
  }

  function scheduleSave() {
    compose.dirty = true;
    els.composeStatus.textContent = '';
    clearTimeout(compose.timer);
    compose.timer = setTimeout(() => saveDraftNow(), AUTOSAVE_MS);
  }

  /** Saves the draft now. Saves are queued, so two never race each other. */
  function saveDraftNow() {
    clearTimeout(compose.timer);
    compose.saving = compose.saving.then(async () => {
      if (!compose.open || !compose.dirty || compose.sending) return;
      const mail = composedMail();
      if (!hasContent(mail)) return;
      // Invalid addresses can still be saved in a draft; they're only checked when sending.
      const loose = { ...mail, to: mail.to.filter(validAddress), cc: mail.cc.filter(validAddress), bcc: mail.bcc.filter(validAddress) };
      compose.dirty = false;
      els.composeStatus.textContent = 'Saving…';
      try {
        const draft = await api.saveDraft(compose.draftId, loose);
        compose.draftId = draft.id;
        // The draft's attachments come back with ids of their own. Files still uploading are kept.
        const sentIds = new Set(mail.attachments);
        compose.attachments = [
          ...draft.attachments.map((attachment) => ({ id: attachment.id, filename: attachment.filename, size: attachment.size, status: 'done', key: crypto.randomUUID() })),
          ...compose.attachments.filter((attachment) => !(attachment.status === 'done' && sentIds.has(attachment.id)))
        ];
        renderComposeAttachments();
        els.composeStatus.textContent = `Draft saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        if (state.folder === 'drafts') loadList();
        refreshCounts();
      } catch (error) {
        compose.dirty = true;
        els.composeStatus.textContent = 'Not saved';
        if (error.status === 401) handleError(error);
      }
    });
    return compose.saving;
  }

  function closeComposeNow() {
    clearTimeout(compose.timer);
    compose.open = false;
    compose.draftId = null;
    compose.attachments = [];
    els.compose.hidden = true;
  }

  async function closeCompose() {
    const wasDirty = compose.dirty;
    await saveDraftNow();
    const saved = compose.draftId && wasDirty;
    closeComposeNow();
    if (saved) toast('Draft saved.');
  }

  async function discardCompose() {
    clearTimeout(compose.timer);
    await compose.saving;
    const { draftId, attachments } = compose;
    closeComposeNow();
    try {
      if (draftId) await api.remove([draftId]);
      // Files uploaded but never saved in a draft are removed too (the server clears them after a day anyway).
      else await Promise.all(attachments.filter((attachment) => attachment.pending).map((attachment) => api.removeUpload(attachment.id)));
    } catch {
      // Nothing more to do.
    }
    refreshCounts();
    if (state.folder === 'drafts') loadList();
    toast(draftId ? 'Draft discarded.' : 'Email discarded.');
  }

  async function sendCompose() {
    const mail = composedMail();
    const bad = [...mail.to, ...mail.cc, ...mail.bcc].filter((address) => !validAddress(address));
    if (bad.length) { showMessage(els.composeMessage, `Check ${bad.length === 1 ? 'this address' : 'these addresses'}: ${bad.join(', ')}`, 'error'); return; }
    if (!mail.to.length && !mail.cc.length && !mail.bcc.length) { showMessage(els.composeMessage, 'Add at least one recipient.', 'error'); field('to').focus(); return; }
    if (compose.attachments.some((attachment) => attachment.status === 'uploading')) { showMessage(els.composeMessage, 'Wait for the attachments to finish uploading.', 'error'); return; }
    if (compose.attachments.some((attachment) => attachment.status === 'error')) { showMessage(els.composeMessage, 'Remove the attachments that failed to upload, or attach them again.', 'error'); return; }
    if (!mail.subject) {
      const ok = await confirmAction({ title: 'Send without a subject?', body: 'Emails without a subject are easy to overlook.', confirm: 'Send anyway' });
      if (!ok) return;
    }
    clearTimeout(compose.timer);
    await compose.saving;
    compose.sending = true;
    const button = els.composeForm.querySelector('button[type="submit"]');
    button.disabled = true;
    els.composeStatus.textContent = 'Sending…';
    showMessage(els.composeMessage, '');
    try {
      await api.send({ ...composedMail(), draftId: compose.draftId || undefined });
      compose.sending = false;
      closeComposeNow();
      toast('Email sent.');
      refreshCounts();
      if (['sent', 'drafts'].includes(state.folder)) loadList();
    } catch (error) {
      compose.sending = false;
      els.composeStatus.textContent = '';
      showMessage(els.composeMessage, error.message || 'The email could not be sent.', 'error');
      if (error.status === 401) handleError(error);
    } finally {
      button.disabled = false;
    }
  }

  function renderComposeAttachments() {
    els.composeAttachments.innerHTML = compose.attachments.map((attachment) => `
      <li data-attachment="${attachment.key}" class="${attachment.status === 'error' ? 'is-error' : ''}" title="${escapeHtml(attachment.error || attachment.filename)}">
        <i data-lucide="${attachment.status === 'error' ? 'circle-alert' : 'paperclip'}"></i>
        <span>${escapeHtml(attachment.filename)}</span>
        <small>${attachment.status === 'uploading' ? `${Math.round((attachment.progress || 0) * 100)}%` : attachment.status === 'error' ? 'failed' : fileSize(attachment.size)}</small>
        <button type="button" data-remove-attachment="${attachment.key}" aria-label="Remove ${escapeHtml(attachment.filename)}"><i data-lucide="x"></i></button>
        ${attachment.status === 'uploading' ? `<span class="mail-progress" style="width:${Math.round((attachment.progress || 0) * 100)}%"></span>` : ''}
      </li>`).join('');
    icons();
  }

  function attachFiles(files) {
    for (const file of files) {
      const entry = { key: crypto.randomUUID(), filename: file.name, size: file.size, status: 'uploading', progress: 0 };
      if (file.size > MAX_FILE_BYTES) {
        Object.assign(entry, { status: 'error', error: `Files can be up to ${MAX_FILE_BYTES / 1024 / 1024} MB.` });
        showMessage(els.composeMessage, `${file.name} is too large. Attachments can be up to ${MAX_FILE_BYTES / 1024 / 1024} MB each.`, 'error');
      }
      compose.attachments.push(entry);
      if (entry.status === 'error') continue;
      let lastPaint = 0;
      api.upload(file, (progress) => {
        entry.progress = progress;
        if (Date.now() - lastPaint > 150) { lastPaint = Date.now(); renderComposeAttachments(); }
      }).then((uploaded) => {
        if (!compose.attachments.includes(entry)) { api.removeUpload(uploaded.id).catch(() => {}); return; }
        Object.assign(entry, { id: uploaded.id, size: uploaded.size, status: 'done', pending: true });
        renderComposeAttachments();
        scheduleSave();
      }).catch((error) => {
        Object.assign(entry, { status: 'error', error: error.message });
        renderComposeAttachments();
        showMessage(els.composeMessage, `${file.name}: ${error.message}`, 'error');
      });
    }
    renderComposeAttachments();
  }

  els.composeForm.addEventListener('input', scheduleSave);
  els.composeForm.addEventListener('submit', (event) => { event.preventDefault(); sendCompose(); });
  els.composeFiles.addEventListener('change', () => { attachFiles([...els.composeFiles.files]); els.composeFiles.value = ''; });
  els.composeAttachments.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-attachment]');
    if (!button) return;
    const entry = compose.attachments.find((attachment) => attachment.key === button.dataset.removeAttachment);
    compose.attachments = compose.attachments.filter((attachment) => attachment !== entry);
    if (entry?.pending && entry.id) api.removeUpload(entry.id).catch(() => {});
    renderComposeAttachments();
    scheduleSave();
  });
  els.compose.addEventListener('click', (event) => {
    const button = event.target.closest('[data-compose]');
    if (!button) return;
    const action = button.dataset.compose;
    if (action === 'close') closeCompose();
    else if (action === 'discard') discardCompose();
    else if (action === 'minimize') els.compose.classList.toggle('is-minimized');
    else if (action === 'show-cc' || action === 'show-bcc') {
      const name = action.slice(5);
      els.composeForm.querySelector(`[data-field="${name}"]`).hidden = false;
      field(name).focus();
    }
  });
  els.compose.querySelector('.mail-compose-bar').addEventListener('dblclick', () => els.compose.classList.toggle('is-minimized'));
  // Files can be dropped onto the compose window.
  ['dragenter', 'dragover'].forEach((type) => els.compose.addEventListener(type, (event) => {
    if (![...(event.dataTransfer?.types ?? [])].includes('Files')) return;
    event.preventDefault();
    els.compose.classList.add('is-dragging');
  }));
  ['dragleave', 'drop'].forEach((type) => els.compose.addEventListener(type, (event) => {
    if (type === 'dragleave' && els.compose.contains(event.relatedTarget)) return;
    els.compose.classList.remove('is-dragging');
    if (type === 'drop' && event.dataTransfer?.files.length) { event.preventDefault(); attachFiles([...event.dataTransfer.files]); }
  }));
  // Leaving the page keeps what was being written.
  window.addEventListener('beforeunload', (event) => {
    if (compose.open && (compose.dirty || compose.attachments.some((attachment) => attachment.status === 'uploading'))) {
      saveDraftNow();
      event.preventDefault();
    }
  });

  // ---- Settings ----

  function openSettings() {
    const form = $('settingsForm').elements;
    form.displayName.value = state.account.displayName;
    form.signature.value = state.account.signature;
    $('passwordForm').reset();
    showMessage($('settingsMessage'), '');
    showMessage($('passwordMessage'), '');
    els.settings.showModal();
    icons();
  }

  $('settingsForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target.elements;
    showMessage($('settingsMessage'), 'Saving…');
    try {
      state.account = await api.updateAccount({ displayName: form.displayName.value, signature: form.signature.value });
      renderAccount();
      showMessage($('settingsMessage'), 'Saved.', 'success');
    } catch (error) {
      showMessage($('settingsMessage'), error.message, 'error');
    }
  });

  $('passwordForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target.elements;
    const message = $('passwordMessage');
    if (form.password.value.length < 12) { showMessage(message, 'Use at least 12 characters.', 'error'); return; }
    if (form.password.value !== form.confirm.value) { showMessage(message, "The new passwords don't match.", 'error'); return; }
    showMessage(message, 'Changing…');
    try {
      await api.changePassword(form.current.value, form.password.value);
      event.target.reset();
      showMessage(message, 'Password changed. Other devices have been signed out.', 'success');
    } catch (error) {
      showMessage(message, error.message, 'error');
    }
  });

  // ---- Installing the app, and notifications ----

  const PUSH_CHOICE = 'treez-mail-push';           // 'off' once someone turns notifications off here
  const PROMPT_DISMISSED = 'treez-mail-push-prompt'; // '1' once the inbox prompt is closed
  const storage = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode */ } }
  };
  const push = {
    supported: 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
    key: null, // the server's public key; '' when notifications aren't set up there
    subscribed: false
  };
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  // Relative, so it's /sw.js at mail.treez.tech and /mail/sw.js locally.
  const serviceWorker = 'serviceWorker' in navigator ? navigator.serviceWorker.register('sw.js').catch(() => null) : Promise.resolve(null);

  function keyBytes(base64url) {
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4)), (char) => char.charCodeAt(0));
  }
  function sameKey(buffer, key) {
    if (!buffer) return true;
    const a = new Uint8Array(buffer);
    const b = keyBytes(key);
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }

  async function loadPushKey() {
    if (push.key !== null) return push.key;
    try {
      push.key = (await api.pushSettings()).publicKey || '';
    } catch {
      return '';
    }
    return push.key;
  }

  async function currentSubscription() {
    const registration = await serviceWorker;
    return registration ? registration.pushManager.getSubscription() : null;
  }

  /** On every sign-in: if this device has notifications on, link it to this mailbox again. */
  async function syncPush() {
    if (!push.supported) return renderPush();
    const key = await loadPushKey();
    if (key && Notification.permission === 'granted' && storage.get(PUSH_CHOICE) !== 'off') {
      try {
        const registration = await serviceWorker;
        let subscription = await registration?.pushManager.getSubscription();
        // A subscription made with an older server key can't be used any more.
        if (subscription && !sameKey(subscription.options?.applicationServerKey, key)) {
          await subscription.unsubscribe();
          subscription = null;
        }
        if (!subscription && registration) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
        if (subscription) {
          await api.pushSubscribe(subscription.toJSON());
          push.subscribed = true;
        }
      } catch {
        push.subscribed = false;
      }
    } else {
      push.subscribed = false;
    }
    renderPush();
  }

  async function turnOnPush() {
    const message = $('pushMessage');
    // Asked first, while the click still counts as the person's own action (Safari insists).
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      if (permission === 'denied') showMessage(message, 'Notifications are blocked for this site. Allow them in your browser settings, then try again.', 'error');
      renderPush();
      return;
    }
    if (!(await loadPushKey())) { showMessage(message, "Notifications aren't set up on the server yet.", 'error'); renderPush(); return; }
    storage.set(PUSH_CHOICE, 'on');
    await syncPush();
    if (push.subscribed) {
      showMessage(message, 'Notifications are on for this device.', 'success');
      toast('Notifications are on. New email will show up in your notifications.');
    } else {
      showMessage(message, "Notifications couldn't be turned on. Please try again.", 'error');
    }
  }

  /** Stops this device's notifications, on the server and in the browser. */
  async function dropSubscription() {
    try {
      const subscription = await currentSubscription();
      if (subscription) {
        await api.pushUnsubscribe(subscription.endpoint).catch(() => {});
        await subscription.unsubscribe();
      }
    } catch {
      // Nothing more to do; the server forgets it when the browser says it's gone.
    }
    push.subscribed = false;
  }

  async function turnOffPush() {
    storage.set(PUSH_CHOICE, 'off');
    await dropSubscription();
    showMessage($('pushMessage'), 'Notifications are off for this device.', 'success');
    renderPush();
  }

  async function testPush() {
    const message = $('pushMessage');
    showMessage(message, 'Sending…');
    try {
      await api.pushTest();
      showMessage(message, 'Sent. It should appear in a few seconds.', 'success');
    } catch (error) {
      showMessage(message, error.message, 'error');
      if (error.status === 410) { push.subscribed = false; renderPush(); }
    }
  }

  function renderPush() {
    let text;
    const show = { 'push-on': false, 'push-test': false, 'push-off': false };
    if (!push.supported) {
      text = isIos && !isInstalled()
        ? 'On iPhone and iPad, first add TREEZ Mail to your Home Screen: tap Share, then “Add to Home Screen”. Open it from there and turn notifications on here.'
        : "This browser can't show notifications.";
    } else if (push.key === '') {
      text = "Notifications aren't set up on the server yet.";
    } else if (Notification.permission === 'denied') {
      text = 'Notifications are blocked for this site. Allow them in your browser’s site settings to turn them on.';
    } else if (push.subscribed) {
      text = 'On for this device. New email in your inbox shows up in your notifications, even when TREEZ Mail is closed.';
      show['push-test'] = show['push-off'] = true;
    } else {
      text = 'Off for this device.';
      show['push-on'] = true;
    }
    $('pushStatus').textContent = text;
    for (const [action, visible] of Object.entries(show)) {
      document.querySelector(`.mail-push-actions [data-action="${action}"]`).hidden = !visible;
    }
    $('pushPrompt').hidden = !(push.supported && push.key && !push.subscribed && Notification.permission === 'default'
      && storage.get(PROMPT_DISMISSED) !== '1' && storage.get(PUSH_CHOICE) !== 'off');
  }

  function setAppBadge(unread) {
    if (!('setAppBadge' in navigator)) return;
    (unread ? navigator.setAppBadge(unread) : navigator.clearAppBadge()).catch(() => {});
  }

  // The browser's own "Install" offer, shown as a menu item instead of a pop-up.
  let installPrompt = null;
  const installButton = document.querySelector('[data-action="install"]');
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    installButton.hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    installButton.hidden = true;
    toast('TREEZ Mail is installed.');
  });
  async function install() {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => {});
    installPrompt = null;
    installButton.hidden = true;
  }

  // Messages from the service worker: new mail arrived, or a notification was tapped.
  navigator.serviceWorker?.addEventListener('message', (event) => {
    if (!state.account) return;
    if (event.data?.type === 'new-mail') checkForNewMail();
    else if (event.data?.type === 'open') {
      const { hash } = new URL(event.data.url, window.location.href);
      if (hash) window.location.hash = hash;
    }
  });

  // ---- Page-wide controls ----

  function toggleSidebar(open = !els.layout.classList.contains('is-sidebar-open')) {
    els.layout.classList.toggle('is-sidebar-open', open);
    els.sidebarToggle.setAttribute('aria-expanded', String(open));
  }

  function toggleAccountMenu(open = els.accountMenu.hidden) {
    els.accountMenu.hidden = !open;
    els.accountButton.setAttribute('aria-expanded', String(open));
  }

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.mail-account')) toggleAccountMenu(false);
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'compose') { toggleSidebar(false); openCompose(); }
    else if (action === 'toggle-sidebar') toggleSidebar();
    else if (action === 'refresh') {
      button.classList.add('is-spinning');
      Promise.all([loadList(), refreshCounts()]).finally(() => button.classList.remove('is-spinning'));
    } else if (action === 'settings') { toggleAccountMenu(false); openSettings(); }
    else if (action === 'logout') logout();
    else if (action === 'install') { toggleAccountMenu(false); install(); }
    else if (action === 'push-on') turnOnPush();
    else if (action === 'push-off') turnOffPush();
    else if (action === 'push-test') testPush();
    else if (action === 'push-dismiss') { storage.set(PROMPT_DISMISSED, '1'); renderPush(); }
    else if (action === 'close-dialog') button.closest('dialog').close();
  });
  els.accountButton.addEventListener('click', () => toggleAccountMenu());
  // Clicking a folder that's already open reloads it.
  document.querySelectorAll('[data-folder]').forEach((link) => link.addEventListener('click', () => {
    if (link.dataset.folder === state.folder && !window.location.hash.includes('/')) { state.query = ''; els.search.value = ''; loadList(); }
  }));

  document.addEventListener('keydown', (event) => {
    if (els.app.hidden || event.metaKey || event.ctrlKey || event.altKey) return;
    if (document.querySelector('dialog[open]')) return;
    if (event.key === 'Escape') {
      if (!els.accountMenu.hidden) { toggleAccountMenu(false); return; }
      if (els.compose.contains(document.activeElement)) { closeCompose(); return; }
      if (state.openId) { goTo(state.folder); return; }
    }
    if (event.target.closest('input, textarea, select, [contenteditable]')) return;
    const key = event.key;
    if (key === 'c') { event.preventDefault(); openCompose(); }
    else if (key === '/') { event.preventDefault(); els.search.focus(); }
    else if (key === '?') els.shortcuts.showModal();
    else if (key === 'j' || key === 'k') {
      if (!state.messages.length) return;
      const index = state.messages.findIndex((message) => message.id === state.openId);
      const next = index === -1 ? state.messages[0] : state.messages[key === 'j' ? Math.min(index + 1, state.messages.length - 1) : Math.max(index - 1, 0)];
      openRow(next.id);
      document.querySelector(`[data-row="${CSS.escape(next.id)}"]`)?.scrollIntoView({ block: 'nearest' });
    } else if (state.open) {
      const actions = { r: 'reply', a: 'reply-all', f: 'forward', e: 'archive', '#': 'trash', s: 'star', u: 'unread' };
      if (actions[key]) {
        if (key === 'r' && state.open.direction !== 'in') return;
        if (key === 'e' && ['archive', 'trash', 'spam'].includes(state.open.folder)) return;
        event.preventDefault();
        readerAction(actions[key]);
      }
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.account) checkForNewMail();
  });

  start();
})();
