document.addEventListener('DOMContentLoaded', async () => {
  const service = window.TREEZ_APPWRITE;
  const config = window.APPWRITE_CONFIG;
  const loginPanel = document.getElementById('adminLogin');
  const appPanel = document.getElementById('adminApp');
  const loginForm = document.getElementById('adminLoginForm');
  const loginMessage = document.getElementById('loginMessage');
  const notice = document.getElementById('adminNotice');
  if (window.location.protocol === 'file:') {
    showMessage(loginMessage, 'Open this page through a local web server, not directly from a file. Use http://localhost:8000/admin.html.', true);
    loginForm.querySelector('button[type="submit"]').disabled = true;
    return;
  }
  if (!service) {
    showMessage(loginMessage, 'The Appwrite client could not load.', true);
    return;
  }

  const collection = (id) => [config.databaseId, id];
  const listDocuments = (id) => service.databases.listDocuments(...collection(id), [service.Query.orderDesc('$createdAt')]);

  async function start() {
    try {
      const user = await service.account.get();
      loginPanel.hidden = true;
      appPanel.hidden = false;
      document.getElementById('adminIdentity').textContent = user.email;
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
  });

  document.querySelectorAll('.admin-tab').forEach((button) => button.addEventListener('click', () => switchTab(button.dataset.tab)));
  document.querySelectorAll('[data-go-tab]').forEach((button) => button.addEventListener('click', () => switchTab(button.dataset.goTab)));
  document.getElementById('refreshMessages').addEventListener('click', refreshDashboard);
  document.getElementById('newBlogButton').addEventListener('click', () => openBlogEditor());
  document.getElementById('cancelBlogButton').addEventListener('click', () => openBlogEditor(false));
  document.getElementById('blogForm').addEventListener('submit', saveBlog);

  async function refreshDashboard() {
    try {
      const [messages, blogs, views] = await Promise.all([
        listDocuments(config.messagesCollectionId),
        listDocuments(config.blogCollectionId),
        listDocuments(config.analyticsCollectionId).catch(() => ({ total: 0, documents: [] }))
      ]);
      document.getElementById('messageCount').textContent = messages.total;
      document.getElementById('blogCount').textContent = blogs.documents.filter((post) => post.published !== false).length;
      document.getElementById('viewCount').textContent = views.total;
      renderMessages(messages.documents);
      renderBlogs(blogs.documents);
    } catch (error) {
      showMessage(notice, error.message || 'Could not load dashboard data.', true);
    }
  }

  function renderMessages(messages) {
    const html = messages.length ? messages.map((message) => `<article class="admin-list-item"><div><h3>${escapeHtml(message.subject || 'No subject')}</h3><p>${escapeHtml(message.name || 'Unknown')} · ${escapeHtml(message.email || '')}</p><p>${escapeHtml(message.message || '')}</p></div><time>${formatDate(message.$createdAt)}</time></article>`).join('') : emptyState('No messages yet.');
    document.getElementById('messageList').innerHTML = html;
    document.getElementById('recentMessages').innerHTML = messages.slice(0, 5).map((message) => `<article class="admin-list-item"><div><h3>${escapeHtml(message.subject || 'No subject')}</h3><p>${escapeHtml(message.name || 'Unknown')} · ${escapeHtml(message.message || '')}</p></div><time>${formatDate(message.$createdAt)}</time></article>`).join('') || emptyState('No messages yet.');
  }

  function renderBlogs(blogs) {
    document.getElementById('blogList').innerHTML = blogs.length ? blogs.map((post) => `<article class="admin-list-item"><div><h3>${escapeHtml(post.title || 'Untitled')}</h3><p>${escapeHtml(post.category || 'Uncategorized')} · ${post.published === false ? 'Draft' : 'Published'}</p></div><button class="admin-button admin-button-quiet" data-edit-blog="${post.$id}" type="button">Edit</button></article>`).join('') : emptyState('No blog documents yet.');
    document.querySelectorAll('[data-edit-blog]').forEach((button) => button.addEventListener('click', () => openBlogEditor(blogs.find((post) => post.$id === button.dataset.editBlog))));
  }

  function openBlogEditor(post = {}) {
    const form = document.getElementById('blogForm');
    form.hidden = !post;
    if (!post) return;
    if (!post.$id) form.reset();
    form.elements.id.value = post.$id || '';
    Object.entries(post).forEach(([key, value]) => { if (form.elements[key] && key !== 'date') form.elements[key].value = value; });
    if (post.date) form.elements.date.value = String(post.date).slice(0, 10);
    form.elements.published.checked = post.published !== false;
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
      showMessage(document.getElementById('blogMessage'), 'Post saved.', false);
      openBlogEditor(false);
      await refreshDashboard();
    } catch (error) { showMessage(document.getElementById('blogMessage'), error.message || 'Could not save post.', true); }
  }

  function switchTab(tab) {
    document.querySelectorAll('.admin-tab').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
    document.querySelectorAll('.admin-view').forEach((view) => view.classList.toggle('active', view.dataset.view === tab));
  }

  function showMessage(element, message, error = false) { element.textContent = message; element.className = `admin-message${error ? ' error' : ' success'}`; }
  function emptyState(message) { return `<div class="admin-list-item"><p>${message}</p></div>`; }
  function formatDate(value) { return value ? new Date(value).toLocaleDateString() : ''; }
  function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }

  await start();
});