export const OAuthChannels = {
  ensureToken: 'oauth:ensureToken',
  clearToken: 'oauth:clearToken',
  tokenStatus: 'oauth:tokenStatus',
} as const;

export type OAuthChannel = (typeof OAuthChannels)[keyof typeof OAuthChannels];
