export const AppChannels = {
  ready: 'app:ready',
  versions: 'app:getVersions',
  openExternal: 'app:openExternal',
} as const;

export type AppChannel = (typeof AppChannels)[keyof typeof AppChannels];
