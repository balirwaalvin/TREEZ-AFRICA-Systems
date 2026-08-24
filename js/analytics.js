document.addEventListener('DOMContentLoaded', async () => {
  const service = window.TREEZ_APPWRITE;
  const config = window.APPWRITE_CONFIG;
  if (!service || !config.analyticsCollectionId || sessionStorage.getItem('treez-view-recorded')) return;
  try {
    await service.databases.createDocument(config.databaseId, config.analyticsCollectionId, service.ID.unique(), { page: document.title, path: window.location.pathname });
    sessionStorage.setItem('treez-view-recorded', '1');
  } catch {
    // Analytics must never interrupt the public site.
  }
});