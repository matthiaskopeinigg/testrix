/** IPC channels for renderer RSA OAEP encrypt/decrypt. */
export const CryptoChannels = {
  encrypt: 'crypto:rsa-oaep:encrypt',
  decrypt: 'crypto:rsa-oaep:decrypt',
} as const;

export type CryptoChannel = (typeof CryptoChannels)[keyof typeof CryptoChannels];
