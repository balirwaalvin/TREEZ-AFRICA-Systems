document.addEventListener('DOMContentLoaded', async () => {
  const postId = new URLSearchParams(window.location.search).get('id');
  const service = window.TREEZ_APPWRITE;
  if (!postId || !service) return;
  try {
    const post = await service.databases.getDocument(window.APPWRITE_CONFIG.databaseId, window.APPWRITE_CONFIG.blogCollectionId, postId);
    if (post.published === false) return;
    const header = document.querySelector('.blog-post-header');
    const title = document.querySelector('.blog-post-header h1');
    const badge = document.querySelector('.blog-post-header .badge');
    const content = document.querySelector('.blog-post-content');
    if (title) title.textContent = post.title || '';
    if (badge) badge.textContent = post.category || 'Insights';
    if (header) header.querySelector('.blog-post-meta').innerHTML = `<span><i class="bx bx-user"></i> ${escapeHtml(post.author || 'TREEZ AFRICA SYSTEMS')}</span><span><i class="bx bx-calendar"></i> ${formatDate(post.date)}</span><span><i class="bx bx-time-five"></i> ${escapeHtml(post.readTime || '')}</span>`;
    if (content) content.innerHTML = `${String(post.content || post.excerpt || '').split(/\n\s*\n/).filter(Boolean).map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`).join('')}<div class="blog-share"><span>Share this article:</span></div>`;
  } catch {
    // Keep the editorial fallback when a document cannot be loaded.
  }
  function formatDate(value) { return value ? new Date(value).toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' }) : ''; }
  function escapeHtml(value) { return String(value || '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }
});