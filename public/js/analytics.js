document.addEventListener('DOMContentLoaded', async () => {
  const api = window.TREEZ_API;
  if (!api || sessionStorage.getItem('treez-view-recorded')) return;
  try {
    await api.recordView({ page: document.title, path: window.location.pathname });
    sessionStorage.setItem('treez-view-recorded', '1');
  } catch {
    // Analytics must never interrupt the public site.
  }
});