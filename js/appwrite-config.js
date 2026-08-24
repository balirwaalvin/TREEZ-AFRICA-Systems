window.APPWRITE_CONFIG = {
  endpoint: 'https://fra.cloud.appwrite.io/v1',
  projectId: '6a8707d00005b149d6cf',
  databaseId: '6a870940000a7df7e449',
  blogCollectionId: 'treez-systems',
  messagesCollectionId: 'messagescollection',
  analyticsCollectionId: 'analyticscollection',
  subscribersCollectionId: 'subscriberscollection',
  storageBucketId: '6a870b130008171b00cf'
};

window.TREEZ_APPWRITE = (() => {
  if (!window.Appwrite) return null;
  const client = new Appwrite.Client()
    .setEndpoint(window.APPWRITE_CONFIG.endpoint)
    .setProject(window.APPWRITE_CONFIG.projectId);
  return {
    account: new Appwrite.Account(client),
    databases: new Appwrite.Databases(client),
    ID: Appwrite.ID,
    Query: Appwrite.Query
  };
})();