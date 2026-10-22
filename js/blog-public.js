document.addEventListener('DOMContentLoaded', async () => {
  const grid = document.getElementById('blogGrid');
  const service = window.TREEZ_APPWRITE;
  if (!grid || !service) return;
  try {
    const result = await service.databases.listDocuments(
      window.APPWRITE_CONFIG.databaseId,
      window.APPWRITE_CONFIG.blogCollectionId,
      [service.Query.equal('published', true), service.Query.orderDesc('$createdAt')]
    );
    if (!result.documents.length) return;
    grid.innerHTML = result.documents.map((post, i) => `<a href="/blog-post/?id=${encodeURIComponent(post.$id)}" class="blog-card reveal"><div class="blog-thumbnail"><div class="blog-thumbnail-bg bg-1"></div><div class="blog-date-badge"><span class="day">${datePart(post.date, 'day')}</span><span class="month">${datePart(post.date, 'month')}</span></div></div><div class="blog-body"><span class="${i % 2 === 0 ? 'badge-primary' : 'badge-secondary'}">${escapeHtml(post.category || 'Insights')}</span><h3>${escapeHtml(post.title)}</h3><p>${escapeHtml(post.excerpt || '')}</p><div class="blog-meta"><span><i data-lucide="user"></i> ${escapeHtml(post.author || 'TREEZ AFRICA SYSTEMS')}</span><span><i data-lucide="clock"></i> ${escapeHtml(post.readTime || '')}</span></div></div></a>`).join('');
    if (window.lucide) window.lucide.createIcons();
    syncHeroFeed(result.documents);
  } catch {
    // Static cards remain available when Appwrite is unavailable.
  }
  // Keep the hero terminal's article list in step with the published posts
  function syncHeroFeed(posts) {
    const feed = document.querySelector('[data-blog-feed]');
    if (!feed) return;
    const lines = posts.slice(0, 5).map(post => `<div class="deploy-line"><i>${datePart(post.date, 'day')} ${datePart(post.date, 'month')}</i> ${escapeHtml(post.title)}</div>`);
    lines.push(`<div class="deploy-line deploy-ok">✓ ${posts.length} article${posts.length === 1 ? '' : 's'} published</div>`);
    feed.firstElementChild.insertAdjacentHTML('afterend', lines.join(''));
    while (feed.children.length > lines.length + 1) feed.lastElementChild.remove();
  }
  function datePart(value, part) { const date = value ? new Date(value) : new Date(); return part === 'day' ? String(date.getDate()).padStart(2, '0') : date.toLocaleString('en', { month: 'short' }); }
  function escapeHtml(value) { return String(value || '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }
});