export const DbChannels = {
  query: 'db:query',
  testConnection: 'db:test-connection',
  getConnectionStatuses: 'db:get-connection-statuses',
} as const;

export type DbChannel = (typeof DbChannels)[keyof typeof DbChannels];
