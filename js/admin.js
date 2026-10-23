document.addEventListener('DOMContentLoaded', async () => {
  const service = window.TREEZ_APPWRITE;
  const config = window.APPWRITE_CONFIG;
  const loginPanel = document.getElementById('adminLogin');
  const appPanel = document.getElementById('adminApp');
  const loginForm = document.getElementById('adminLoginForm');
  const loginMessage = document.getElementById('loginMessage');
  const notice = document.getElementById('adminNotice');
  if (window.location.protocol === 'file:') {
    showMessage(loginMessage, 'Open this page through a local web server, not directly from a file. Use http://localhost:8000/admin/.', true);
    loginForm.querySelector('button[type="submit"]').disabled = true;
    return;
  }
  if (!service) {
    showMessage(loginMessage, 'The Appwrite client could not load.', true);
    return;
  }

  const DAY = 24 * 60 * 60 * 1000;
  const PAGE_SIZE = 100;
  const READ_KEY = 'tz-admin-read';
  const desktop = window.matchMedia('(min-width: 901px)');
  const baseTitle = document.title;
  const state = { messages: [], blogs: [], views: [], viewTotal: 0, filter: 'all', query: '', selectedId: null, pendingReadId: null, editingBlogId: null, syncedAt: 0 };
  const readIds = new Set(loadReadIds());

  const collection = (id) => [config.databaseId, id];

  // Appwrite caps each page, so walk the cursor until everything (or `cap`) is loaded.
  async function listAll(id, queries = [], cap = 1000) {
    const documents = [];
    let total = 0;
    let cursor = null;
    do {
      const page = await service.databases.listDocuments(...collection(id), [
        service.Query.orderDesc('$createdAt'),
        service.Query.limit(PAGE_SIZE),
        ...queries,
        ...(cursor ? [service.Query.cursorAfter(cursor)] : [])
      ]);
      total = page.total;
      documents.push(...page.documents);
      cursor = page.documents.length === PAGE_SIZE ? page.documents[page.documents.length - 1].$id : null;
    } while (cursor && documents.length < cap);
    return { total, documents };
  }

  async function start() {
    try {
      const user = await service.account.get();
      loginPanel.hidden = true;
      appPanel.hidden = false;
      document.getElementById('adminIdentity').textContent = user.email;
      applyHash();
      await refreshDashboard();
    } catch {
      loginPanel.hidden = false;
      appPanel.hidden = true;
    }
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);
    showMessage(loginMessage, 'Signing in...');
    try {
      await service.account.createEmailPasswordSession(formData.get('email'), formData.get('password'));
      loginForm.reset();
      await start();
    } catch (error) {
      showMessage(loginMessage, error.message || 'Unable to sign in.', true);
    }
  });

  document.getElementById('logoutButton').addEventListener('click', async () => {
    await service.account.deleteSession('current');
    appPanel.hidden = true;
    loginPanel.hidden = false;
    document.title = baseTitle;
  });

  document.querySelectorAll('.admin-tab').forEach((button) => button.addEventListener('click', () => switchTab(button.dataset.tab)));
  document.querySelectorAll('[data-go-filter]').forEach((button) => button.addEventListener('click', () => { setFilter(button.dataset.goFilter); switchTab('inbox'); }));
  document.querySelectorAll('.admin-filter').forEach((button) => button.addEventListener('click', () => setFilter(button.dataset.filter)));
  document.getElementById('inboxSearch').addEventListener('input', (event) => { state.query = event.target.value.trim().toLowerCase(); renderInbox(); });
  document.getElementById('exportInbox').addEventListener('click', exportInbox);
  document.getElementById('markAllRead').addEventListener('click', () => {
    state.messages.forEach((message) => readIds.add(message.$id));
    saveReadIds();
    renderOverview();
    renderInbox();
  });
  document.getElementById('refreshDashboard').addEventListener('click', refreshDashboard);
  document.getElementById('newBlogButton').addEventListener('click', () => openBlogEditor());
  document.getElementById('cancelBlogButton').addEventListener('click', () => openBlogEditor(false));
  document.getElementById('deleteBlogButton').addEventListener('click', deleteBlog);
  document.getElementById('blogForm').addEventListener('submit', saveBlog);

  // Row clicks are delegated so re-renders don't need to rebind.
  document.addEventListener('click', (event) => {
    const open = event.target.closest('[data-open-message]');
    if (open) { openMessage(open.dataset.openMessage); return; }
    const action = event.target.closest('[data-detail-action]');
    if (action) handleDetailAction(action.dataset.detailAction);
  });

  document.addEventListener('keydown', (event) => {
    if (!isTabActive('inbox') || event.target.closest('input, textarea, select') || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'j' || event.key === 'k') {
      const list = filteredMessages();
      if (!list.length) return;
      const index = list.findIndex((message) => message.$id === state.selectedId);
      const target = index === -1 ? list[0] : list[event.key === 'j' ? Math.min(index + 1, list.length - 1) : Math.max(index - 1, 0)];
      openMessage(target.$id);
      document.querySelector(`[data-open-message="${target.$id}"]`)?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Escape') {
      closeDetail();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !appPanel.hidden && Date.now() - state.syncedAt > 2 * 60 * 1000) refreshDashboard();
  });

  async function refreshDashboard() {
    const refreshButton = document.getElementById('refreshDashboard');
    refreshButton.classList.add('is-spinning');
    try {
      const since = new Date(Date.now() - 30 * DAY).toISOString();
      const [messages, blogs, views] = await Promise.all([
        listAll(config.messagesCollectionId),
        listAll(config.blogCollectionId),
        listAll(config.analyticsCollectionId, [service.Query.greaterThanEqual('$createdAt', since)], 5000).catch(() => ({ total: 0, documents: [] }))
      ]);
      state.messages = messages.documents;
      state.blogs = blogs.documents;
      state.views = views.documents;
      state.viewTotal = views.total;
      state.syncedAt = Date.now();
      // A conversation opened straight from a #inbox/<id> link counts as read once it has loaded.
      if (state.pendingReadId) {
        if (state.messages.some((message) => message.$id === state.pendingReadId)) setRead(state.pendingReadId, true);
        state.pendingReadId = null;
      }
      document.getElementById('lastSynced').textContent = `Synced ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      notice.textContent = '';
      notice.className = 'admin-message';
      renderOverview();
      renderInbox();
      renderBlogs();
    } catch (error) {
      showMessage(notice, error.message || 'Could not load dashboard data.', true);
    } finally {
      refreshButton.classList.remove('is-spinning');
    }
  }

  // ---- Message helpers ----
  const isBooking = (message) => message.subject === 'Consultation booking request';
  const isUnread = (message) => !readIds.has(message.$id);
  const sourceBadge = (message) => isBooking(message)
    ? '<span class="badge-secondary admin-row-badge">Booking</span>'
    : '<span class="badge-primary admin-row-badge">Message</span>';

  // Bookings are stored as "Label: value" lines followed by the free-text description (see js/booking.js).
  function parseBooking(text) {
    const [head, ...rest] = String(text || '').split(/\n\s*Project description:\s*\n?/);
    const fields = {};
    head.split('\n').forEach((line) => {
      const match = line.match(/^([^:]+):\s*(.*)$/);
      if (match) fields[match[1].trim().toLowerCase()] = match[2].trim();
    });
    if (!Object.keys(fields).length) return { description: String(text || '').trim() };
    return {
      company: fields.company,
      services: fields['services requested'],
      budget: fields['budget range'],
      timeline: fields.timeline,
      description: rest.join('\n').trim()
    };
  }

  const bodyText = (message) => (isBooking(message) ? parseBooking(message.message).description : message.message) || '';
  const headline = (message) => {
    if (!isBooking(message)) return message.subject || 'No subject';
    const { services } = parseBooking(message.message);
    return isProvided(services) ? services : 'Consultation booking';
  };
  const isProvided = (value) => Boolean(value) && !/^not (provided|specified)$/i.test(value);

  function filteredMessages() {
    return state.messages.filter((message) => {
      if (state.filter === 'bookings' && !isBooking(message)) return false;
      if (state.filter === 'messages' && isBooking(message)) return false;
      if (state.filter === 'unread' && !isUnread(message)) return false;
      if (!state.query) return true;
      return [message.name, message.email, message.phone, message.subject, message.message].some((value) => String(value || '').toLowerCase().includes(state.query));
    });
  }

  // ---- Overview ----
  function renderOverview() {
    const bookings = state.messages.filter(isBooking);
    const enquiries = state.messages.filter((message) => !isBooking(message));
    const weekAgo = Date.now() - 7 * DAY;
    const thisWeek = (list) => list.filter((message) => new Date(message.$createdAt).getTime() > weekAgo).length;

    document.getElementById('unreadCount').textContent = state.messages.filter(isUnread).length;
    document.getElementById('bookingCount').textContent = bookings.length;
    document.getElementById('messageCount').textContent = enquiries.length;
    document.getElementById('viewCount').textContent = state.viewTotal.toLocaleString();
    document.getElementById('bookingWeek').textContent = `${thisWeek(bookings)} new this week`;
    document.getElementById('messageWeek').textContent = `${thisWeek(enquiries)} new this week`;

    document.getElementById('recentBookings').innerHTML = bookings.slice(0, 4).map(overviewRow).join('') || emptyState('No consultation bookings yet.');
    document.getElementById('recentMessages').innerHTML = enquiries.slice(0, 4).map(overviewRow).join('') || emptyState('No contact messages yet.');
    renderTraffic();
    updateUnreadIndicators();
    refreshIcons();
  }

  function overviewRow(message) {
    return `<button class="admin-list-item admin-list-button${isUnread(message) ? ' is-unread' : ''}" data-open-message="${message.$id}" type="button">
      <div><h3>${escapeHtml(message.name || 'Unknown')}</h3><p class="admin-list-headline">${escapeHtml(headline(message))}</p><p class="admin-clamp">${escapeHtml(bodyText(message))}</p></div>
      <time datetime="${message.$createdAt}">${relativeTime(message.$createdAt)}</time>
    </button>`;
  }

  function renderTraffic() {
    const days = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let offset = 13; offset >= 0; offset -= 1) days.push({ date: new Date(today.getTime() - offset * DAY), count: 0 });
    const dayKey = (date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const byDay = new Map(days.map((day) => [dayKey(day.date), day]));
    const pages = new Map();
    state.views.forEach((view) => {
      const day = byDay.get(dayKey(new Date(view.$createdAt)));
      if (day) day.count += 1;
      const path = view.path || '/';
      pages.set(path, (pages.get(path) || 0) + 1);
    });

    const chart = document.getElementById('trafficChart');
    const max = Math.max(...days.map((day) => day.count));
    if (!max) {
      chart.innerHTML = '<p class="admin-empty">No page views recorded in the last 14 days.</p>';
    } else {
      const width = 560;
      const height = 180;
      const top = 18;
      const bottom = 26;
      const plot = height - top - bottom;
      const slot = width / days.length;
      const barWidth = slot - 6;
      const fmt = (date) => date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      const bars = days.map((day, index) => {
        const h = day.count ? Math.max((day.count / max) * plot, 4) : 0;
        const x = index * slot + 3;
        const y = top + plot - h;
        const r = Math.min(4, h, barWidth / 2);
        const path = h ? `M${x},${top + plot} V${y + r} Q${x},${y} ${x + r},${y} H${x + barWidth - r} Q${x + barWidth},${y} ${x + barWidth},${y + r} V${top + plot} Z` : '';
        const label = `${fmt(day.date)}: ${day.count} view${day.count === 1 ? '' : 's'}`;
        return `<g class="admin-chart-bar" data-tip="${escapeHtml(label)}" data-x="${((x + barWidth / 2) / width) * 100}"><rect x="${index * slot}" y="${top}" width="${slot}" height="${plot}" fill="transparent"></rect>${path ? `<path d="${path}"></path>` : ''}<title>${escapeHtml(label)}</title></g>`;
      }).join('');
      const ticks = [0, 7, 13].map((index) => `<text x="${index * slot + slot / 2}" y="${height - 6}" text-anchor="middle">${fmt(days[index].date)}</text>`).join('');
      chart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Daily page views for the last 14 days, peak ${max}">
          <line class="admin-chart-grid" x1="0" x2="${width}" y1="${top}" y2="${top}"></line>
          <text class="admin-chart-max" x="0" y="${top - 6}">${max}</text>
          <line class="admin-chart-axis" x1="0" x2="${width}" y1="${top + plot}" y2="${top + plot}"></line>
          ${bars}${ticks}
        </svg><div class="admin-chart-tip" hidden></div>`;
      const tip = chart.querySelector('.admin-chart-tip');
      chart.querySelectorAll('.admin-chart-bar').forEach((bar) => {
        bar.addEventListener('mouseenter', () => { tip.textContent = bar.dataset.tip; tip.style.left = `${bar.dataset.x}%`; tip.hidden = false; });
        bar.addEventListener('mouseleave', () => { tip.hidden = true; });
      });
    }

    const topPages = [...pages.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const topMax = topPages[0]?.[1] || 1;
    document.getElementById('topPages').innerHTML = topPages.length
      ? topPages.map(([path, count]) => `<li><div class="admin-top-row"><span>${escapeHtml(path)}</span><strong>${count}</strong></div><span class="admin-top-bar" style="width:${(count / topMax) * 100}%"></span></li>`).join('')
      : '<li class="admin-empty">No data yet.</li>';
  }

  // ---- Inbox ----
  function setFilter(filter) {
    state.filter = filter;
    document.querySelectorAll('.admin-filter').forEach((button) => button.classList.toggle('active', button.dataset.filter === filter));
    renderInbox();
  }

  function renderInbox() {
    const counts = {
      all: state.messages.length,
      bookings: state.messages.filter(isBooking).length,
      messages: state.messages.filter((message) => !isBooking(message)).length,
      unread: state.messages.filter(isUnread).length
    };
    Object.entries(counts).forEach(([key, value]) => { document.querySelector(`[data-filter-count="${key}"]`).textContent = value; });

    const list = filteredMessages();
    document.getElementById('inboxList').innerHTML = list.length
      ? list.map((message) => `<button class="admin-inbox-item${isUnread(message) ? ' is-unread' : ''}${message.$id === state.selectedId ? ' is-selected' : ''}" data-open-message="${message.$id}" type="button">
          <span class="admin-inbox-item-top"><span class="admin-inbox-name">${escapeHtml(message.name || 'Unknown')}</span><time datetime="${message.$createdAt}">${relativeTime(message.$createdAt)}</time></span>
          <span class="admin-inbox-item-subject">${sourceBadge(message)}<span>${escapeHtml(headline(message))}</span></span>
          <span class="admin-inbox-snippet">${escapeHtml(bodyText(message))}</span>
        </button>`).join('')
      : `<p class="admin-empty">${state.query ? 'No conversations match your search.' : 'Nothing here yet.'}</p>`;

    // On wide screens the reading pane is always filled, so keep the selection inside the current view.
    if (state.syncedAt && desktop.matches && isTabActive('inbox') && !list.some((message) => message.$id === state.selectedId)) {
      if (list.length) { openMessage(list[0].$id); return; }
      state.selectedId = null;
    }
    renderDetail();
    updateUnreadIndicators();
    refreshIcons();
  }

  function openMessage(id) {
    const message = state.messages.find((item) => item.$id === id);
    if (!message) return;
    state.selectedId = id;
    setRead(id, true);
    if (!isTabActive('inbox')) switchTab('inbox');
    history.replaceState(null, '', `#inbox/${id}`);
    document.getElementById('inboxLayout').classList.add('is-detail-open');
    renderInbox();
  }

  function closeDetail() {
    document.getElementById('inboxLayout').classList.remove('is-detail-open');
    if (!desktop.matches) {
      state.selectedId = null;
      history.replaceState(null, '', '#inbox');
      renderInbox();
    }
  }

  function renderDetail() {
    const detail = document.getElementById('inboxDetail');
    const message = state.messages.find((item) => item.$id === state.selectedId);
    if (!message) {
      detail.innerHTML = '<div class="admin-detail-empty"><i data-lucide="mail-open"></i><p>Select a conversation to read it in full.</p></div>';
      return;
    }
    const booking = isBooking(message);
    const details = booking ? parseBooking(message.message) : null;
    const services = booking && isProvided(details.services) ? details.services.split(',').map((item) => item.trim()).filter(Boolean) : [];
    const whatsapp = whatsappNumber(message.phone);
    const fact = (label, value) => `<div><dt>${label}</dt><dd class="${isProvided(value) ? '' : 'is-muted'}">${escapeHtml(value || 'Not provided')}</dd></div>`;

    detail.innerHTML = `
      <header class="admin-detail-header">
        <button class="admin-button admin-button-quiet admin-detail-back" data-detail-action="back" type="button"><i data-lucide="arrow-left"></i> Back</button>
        <div class="admin-detail-heading">
          ${sourceBadge(message)}
          <h2>${escapeHtml(booking ? 'Consultation booking' : message.subject || 'No subject')}</h2>
          <p><time datetime="${message.$createdAt}">${fullDate(message.$createdAt)}</time> · ${relativeTime(message.$createdAt)}</p>
        </div>
      </header>
      <section class="admin-detail-contact">
        <div class="admin-avatar" aria-hidden="true">${escapeHtml(initials(message.name))}</div>
        <div class="admin-detail-person">
          <strong>${escapeHtml(message.name || 'Unknown')}</strong>
          ${message.email ? `<a href="mailto:${escapeHtml(message.email)}">${escapeHtml(message.email)}</a>` : ''}
          ${message.phone ? `<a href="tel:${escapeHtml(message.phone.replace(/[^\d+]/g, ''))}">${escapeHtml(message.phone)}</a>` : ''}
          ${booking && isProvided(details.company) ? `<span>${escapeHtml(details.company)}</span>` : ''}
        </div>
        <div class="admin-detail-actions">
          ${message.email ? `<a class="admin-button admin-button-primary" href="${replyLink(message)}"><i data-lucide="reply"></i> Reply by email</a>` : ''}
          ${message.phone ? `<a class="admin-button admin-button-quiet" href="tel:${escapeHtml(message.phone.replace(/[^\d+]/g, ''))}"><i data-lucide="phone"></i> Call</a>` : ''}
          ${whatsapp ? `<a class="admin-button admin-button-quiet" href="https://wa.me/${whatsapp}" target="_blank" rel="noopener"><i data-lucide="message-circle"></i> WhatsApp</a>` : ''}
        </div>
      </section>
      ${booking ? `
        <dl class="admin-detail-facts">
          ${fact('Company', details.company)}
          ${fact('Budget range', details.budget)}
          ${fact('Timeline', details.timeline)}
          <div class="admin-detail-services"><dt>Services requested</dt><dd>${services.length ? services.map((item) => `<span class="admin-chip">${escapeHtml(item)}</span>`).join('') : '<span class="is-muted">Not specified</span>'}</dd></div>
        </dl>` : ''}
      <section class="admin-detail-body">
        <h3>${booking ? 'Project description' : 'Message'}</h3>
        <div class="admin-detail-text">${escapeHtml(bodyText(message)) || '<span class="is-muted">No details were provided.</span>'}</div>
      </section>
      <footer class="admin-detail-footer">
        <button class="admin-button admin-button-quiet" data-detail-action="copy" type="button"><i data-lucide="copy"></i> Copy details</button>
        <button class="admin-button admin-button-quiet" data-detail-action="unread" type="button"><i data-lucide="mail"></i> Mark as unread</button>
      </footer>`;
  }

  async function handleDetailAction(action) {
    const message = state.messages.find((item) => item.$id === state.selectedId);
    if (action === 'back') { closeDetail(); return; }
    if (!message) return;
    if (action === 'unread') {
      setRead(message.$id, false);
      showMessage(notice, `Marked “${message.name || 'conversation'}” as unread.`);
      renderInbox();
      renderOverview();
    } else if (action === 'copy') {
      try {
        await navigator.clipboard.writeText(messageAsText(message));
        showMessage(notice, 'Details copied to clipboard.');
      } catch {
        showMessage(notice, 'Your browser blocked clipboard access.', true);
      }
    }
  }

  function messageAsText(message) {
    return [
      `${isBooking(message) ? 'Consultation booking' : message.subject || 'Message'} — ${fullDate(message.$createdAt)}`,
      `From: ${message.name || 'Unknown'} <${message.email || ''}>`,
      message.phone ? `Phone: ${message.phone}` : '',
      '',
      message.message || ''
    ].filter((line, index) => line || index === 3).join('\n');
  }

  function replyLink(message) {
    const first = String(message.name || '').trim().split(/\s+/)[0] || 'there';
    const subject = isBooking(message) ? 'Your consultation request with TREEZ AFRICA SYSTEMS' : `Re: ${message.subject || 'Your message'}`;
    const body = isBooking(message)
      ? `Hi ${first},\n\nThank you for booking a consultation with TREEZ AFRICA SYSTEMS.\n\n`
      : `Hi ${first},\n\nThank you for reaching out to TREEZ AFRICA SYSTEMS.\n\n`;
    return `mailto:${encodeURIComponent(message.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  // Local numbers (07XX…) are assumed to be Ugandan, matching the site's audience.
  function whatsappNumber(phone) {
    if (!phone) return '';
    let digits = String(phone).replace(/\D/g, '');
    if (/^0\d{9}$/.test(digits)) digits = `256${digits.slice(1)}`;
    return digits.length >= 10 ? digits : '';
  }

  function exportInbox() {
    const list = filteredMessages();
    if (!list.length) { showMessage(notice, 'There is nothing to export for this view.', true); return; }
    const header = ['Received', 'Type', 'Name', 'Email', 'Phone', 'Subject', 'Company', 'Services', 'Budget', 'Timeline', 'Message'];
    const rows = list.map((message) => {
      const details = isBooking(message) ? parseBooking(message.message) : {};
      return [message.$createdAt, isBooking(message) ? 'Booking' : 'Message', message.name, message.email, message.phone, message.subject, details.company, details.services, details.budget, details.timeline, bodyText(message)];
    });
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    link.download = `treez-inbox-${state.filter}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function updateUnreadIndicators() {
    const unread = state.messages.filter(isUnread).length;
    const badge = document.getElementById('unreadTabCount');
    badge.textContent = unread;
    badge.hidden = !unread;
    document.title = unread ? `(${unread}) ${baseTitle}` : baseTitle;
  }

  // Read state is a per-browser convenience; the messages collection has no status attribute.
  function loadReadIds() {
    try { return JSON.parse(localStorage.getItem(READ_KEY) || '[]'); } catch { return []; }
  }

  function setRead(id, read) {
    if (read) readIds.add(id); else readIds.delete(id);
    saveReadIds();
  }

  function saveReadIds() {
    try { localStorage.setItem(READ_KEY, JSON.stringify([...readIds])); } catch { /* storage unavailable */ }
    updateUnreadIndicators();
  }

  // ---- Blog editor ----
  function renderBlogs() {
    document.getElementById('blogList').innerHTML = state.blogs.length ? state.blogs.map((post) => `<article class="admin-list-item${post.$id === state.editingBlogId ? ' is-selected' : ''}"><div>${post.published === false ? '<span class="badge-primary admin-row-badge">Draft</span>' : '<span class="badge-secondary admin-row-badge">Published</span>'}<h3>${escapeHtml(post.title || 'Untitled')}</h3><p>${escapeHtml(post.category || 'Uncategorized')}${post.date ? ` · ${escapeHtml(String(post.date).slice(0, 10))}` : ''}</p></div><button class="admin-button admin-button-quiet" data-edit-blog="${post.$id}" type="button">Edit</button></article>`).join('') : emptyState('No blog documents yet.');
    document.querySelectorAll('[data-edit-blog]').forEach((button) => button.addEventListener('click', () => openBlogEditor(state.blogs.find((post) => post.$id === button.dataset.editBlog))));
  }

  function openBlogEditor(post = {}) {
    const form = document.getElementById('blogForm');
    form.hidden = !post;
    state.editingBlogId = post ? post.$id || null : null;
    renderBlogs();
    if (!post) return;
    if (!post.$id) form.reset();
    form.elements.id.value = post.$id || '';
    Object.entries(post).forEach(([key, value]) => { if (form.elements[key] && key !== 'date') form.elements[key].value = value; });
    if (post.date) form.elements.date.value = String(post.date).slice(0, 10);
    form.elements.published.checked = post.published !== false;
    const viewLink = document.getElementById('viewBlogLink');
    viewLink.hidden = !post.$id || post.published === false;
    viewLink.href = post.$id ? `/blog-post/?id=${encodeURIComponent(post.$id)}` : '#';
    document.getElementById('deleteBlogButton').hidden = !post.$id;
    document.getElementById('blogMessage').textContent = '';
    form.elements.title.focus();
  }

  async function saveBlog(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    data.published = form.elements.published.checked;
    delete data.id;
    try {
      if (form.elements.id.value) await service.databases.updateDocument(...collection(config.blogCollectionId), form.elements.id.value, data);
      else await service.databases.createDocument(...collection(config.blogCollectionId), service.ID.unique(), data);
      openBlogEditor(false);
      showMessage(notice, 'Post saved.');
      await refreshDashboard();
    } catch (error) { showMessage(document.getElementById('blogMessage'), error.message || 'Could not save post.', true); }
  }

  async function deleteBlog() {
    const form = document.getElementById('blogForm');
    const id = form.elements.id.value;
    if (!id || !window.confirm(`Delete “${form.elements.title.value || 'this post'}”? This cannot be undone.`)) return;
    try {
      await service.databases.deleteDocument(...collection(config.blogCollectionId), id);
      openBlogEditor(false);
      showMessage(notice, 'Post deleted.');
      await refreshDashboard();
    } catch (error) { showMessage(document.getElementById('blogMessage'), error.message || 'Could not delete post.', true); }
  }

  // ---- Navigation ----
  function switchTab(tab) {
    document.querySelectorAll('.admin-tab').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
    document.querySelectorAll('.admin-view').forEach((view) => view.classList.toggle('active', view.dataset.view === tab));
    if (tab !== 'inbox' || !state.selectedId) history.replaceState(null, '', `#${tab}`);
    if (tab === 'inbox') renderInbox();
  }

  function applyHash() {
    const [tab, id] = window.location.hash.slice(1).split('/');
    if (id) { state.selectedId = id; state.pendingReadId = id; }
    if (['overview', 'inbox', 'blogs'].includes(tab)) switchTab(tab);
    if (id) document.getElementById('inboxLayout').classList.add('is-detail-open');
  }

  const isTabActive = (tab) => document.querySelector(`.admin-view[data-view="${tab}"]`).classList.contains('active');

  // ---- Utilities ----
  function showMessage(element, message, error = false) { element.textContent = message; element.className = `admin-message${error ? ' error' : ' success'}`; }
  function emptyState(message) { return `<p class="admin-empty">${message}</p>`; }
  function refreshIcons() { window.lucide?.createIcons(); }
  function initials(name) { return String(name || '?').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?'; }
  function fullDate(value) { return value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : ''; }
  function relativeTime(value) {
    if (!value) return '';
    const diff = Date.now() - new Date(value).getTime();
    if (diff < 60 * 1000) return 'just now';
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < DAY) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 2 * DAY) return 'yesterday';
    if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`;
    return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric', year: diff > 300 * DAY ? 'numeric' : undefined });
  }
  function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }

  refreshIcons();
  await start();
});
