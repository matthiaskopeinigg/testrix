import { z } from 'zod';

import {
  collectionCookieSchema,
  collectionFolderAuthSchema,
  type CollectionCookie,
  type CollectionFolderAuth,
} from './collection-folder';
import { proxySettingsSchema, type ProxySettings } from './network-settings';

export const httpHeaderPairSchema = z.object({
  key: z.string(),
  value: z.string(),
});

export type HttpHeaderPair = z.infer<typeof httpHeaderPairSchema>;

export const httpExecuteRequestSchema = z.object({
  method: z.string().min(1),
  url: z.string().min(1),
  headers: z.array(httpHeaderPairSchema).default([]),
  body: z.string().default(''),
  followRedirects: z.boolean().default(true),
  verifyTls: z.boolean().default(true),
  timeoutMs: z.number().int().min(1).max(300000).default(30000),
  sendCookies: z.boolean().default(true),
  cookies: z.array(collectionCookieSchema).default([]),
  auth: collectionFolderAuthSchema.default(() => collectionFolderAuthSchema.parse({})),
  proxy: proxySettingsSchema.optional(),
  preRequest: z.array(z.string()).default([]),
  postResponse: z.array(z.string()).default([]),
  variables: z.record(z.string(), z.string()).default({}),
  abortId: z.string().min(1).optional(),
});

export type HttpExecuteRequest = z.infer<typeof httpExecuteRequestSchema>;

export const httpTimingSchema = z.object({
  dnsMs: z.number().default(0),
  tcpMs: z.number().default(0),
  tlsMs: z.number().default(0),
  ttfbMs: z.number().default(0),
  downloadMs: z.number().default(0),
  redirectsMs: z.number().default(0),
  otherMs: z.number().default(0),
  totalMs: z.number().default(0),
});

export type HttpTiming = z.infer<typeof httpTimingSchema>;

export function defaultHttpTiming(totalMs = 0): HttpTiming {
  return {
    dnsMs: 0,
    tcpMs: 0,
    tlsMs: 0,
    ttfbMs: 0,
    downloadMs: 0,
    redirectsMs: 0,
    otherMs: Math.max(0, totalMs),
    totalMs,
  };
}

export const httpRedirectHopSchema = z.object({
  status: z.number().int(),
  url: z.string(),
  location: z.string().default(''),
  durationMs: z.number().default(0),
});

export type HttpRedirectHop = z.infer<typeof httpRedirectHopSchema>;

export const httpExecuteResponseSchema = z.object({
  status: z.number().int(),
  statusText: z.string(),
  headers: z.array(httpHeaderPairSchema),
  body: z.string(),
  durationMs: z.number(),
  sizeLabel: z.string(),
  setCookies: z.array(collectionCookieSchema),
  error: z.string().nullable(),
  variables: z.record(z.string(), z.string()).default({}),
  auth: collectionFolderAuthSchema.optional(),
  url: z.string().default(''),
  httpVersion: z.string().default('HTTP/1.1'),
  timing: httpTimingSchema.default(() => defaultHttpTiming()),
  redirects: z.array(httpRedirectHopSchema).default([]),
});

export type HttpExecuteResponse = z.infer<typeof httpExecuteResponseSchema>;

export const oauthClientConfigSchema = z.object({
  grantType: z.enum(['authorization_code', 'client_credentials', 'password', 'device_code']),
  pkce: z.boolean().default(true),
  authUrl: z.string().default(''),
  tokenUrl: z.string().default(''),
  deviceAuthUrl: z.string().default(''),
  clientId: z.string().default(''),
  clientSecret: z.string().default(''),
  scope: z.string().default(''),
  audience: z.string().default(''),
  redirectUri: z.string().default(''),
  username: z.string().default(''),
  password: z.string().default(''),
  refreshToken: z.string().default(''),
  verifyTls: z.boolean().default(true),
  timeoutMs: z.number().int().min(1).max(300000).default(30000),
  proxy: proxySettingsSchema.optional(),
});

export type OAuthClientConfig = z.infer<typeof oauthClientConfigSchema>;

export const oauthTokenResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().nullable(),
  accessToken: z.string().default(''),
  refreshToken: z.string().default(''),
  tokenType: z.string().default('Bearer'),
  expiresAt: z.string().default(''),
});

export type OAuthTokenResult = z.infer<typeof oauthTokenResultSchema>;

export const oauthDeviceStartResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().nullable(),
  sessionId: z.string().default(''),
  userCode: z.string().default(''),
  verificationUri: z.string().default(''),
  verificationUriComplete: z.string().default(''),
  interval: z.number().default(5),
  expiresIn: z.number().default(0),
});

export type OAuthDeviceStartResult = z.infer<typeof oauthDeviceStartResultSchema>;

export const oauthDevicePollResultSchema = oauthTokenResultSchema.extend({
  pending: z.boolean().default(false),
  cancelled: z.boolean().default(false),
});

export type OAuthDevicePollResult = z.infer<typeof oauthDevicePollResultSchema>;

export type { CollectionCookie, CollectionFolderAuth, ProxySettings };
