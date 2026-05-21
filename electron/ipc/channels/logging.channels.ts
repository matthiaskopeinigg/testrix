export const LoggingChannels = {
  getPaths: 'logging:getPaths',
  tail: 'logging:tail',
  clear: 'logging:clear',
  openLogDir: 'logging:openLogDir',
} as const;

export type LoggingChannel = (typeof LoggingChannels)[keyof typeof LoggingChannels];
