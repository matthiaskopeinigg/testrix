export const DbChannels = {
  query: 'db:query',
  testConnection: 'db:test-connection',
} as const;

export type DbChannel = (typeof DbChannels)[keyof typeof DbChannels];
