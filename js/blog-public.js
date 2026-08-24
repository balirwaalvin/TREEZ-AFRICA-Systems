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
    grid.innerHTML = result.documents.map((post) => `<a href="blog-post.html?id=${encodeURIComponent(post.$id)}" class="blog-card reveal"><div class="blog-thumbnail"><div class="blog-thumbnail-bg bg-1"><i class="bx bx-news"></i></div><div class="blog-date-badge"><span class="day">${datePart(post.date, 'day')}</span><span class="month">${datePart(post.date, 'month')}</span></div></div><div class="blog-body"><span class="badge badge-blue">${escapeHtml(post.category || 'Insights')}</span><h3>${escapeHtml(post.title)}</h3><p>${escapeHtml(post.excerpt || '')}</p><div class="blog-meta"><span><i class="bx bx-user"></i> ${escapeHtml(post.author || 'TREEZ AFRICA SYSTEMS')}</span><span><i class="bx bx-time-five"></i> ${escapeHtml(post.readTime || '')}</span></div></div></a>`).join('');
  } catch {
    // Static cards remain available when Appwrite is unavailable.
  }
  function datePart(value, part) { const date = value ? new Date(value) : new Date(); return part === 'day' ? String(date.getDate()).padStart(2, '0') : date.toLocaleString('en', { month: 'short' }); }
  function escapeHtml(value) { return String(value || '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }
});