export const DbChannels = {
  query: 'db:query',
  testConnection: 'db:test-connection',
  getConnectionStatuses: 'db:get-connection-statuses',
  getQueries: 'db:getQueries',
  setQueries: 'db:setQueries',
  introspect: 'db:introspect',
  explain: 'db:explain',
} as const;

export type DbChannel = (typeof DbChannels)[keyof typeof DbChannels];
