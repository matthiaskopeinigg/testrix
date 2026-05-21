import { z } from 'zod';

import { httpProxySettingsSchema } from './http-settings.schema';

/** Transport overrides for collection folders and requests; unset fields inherit global `http.request`. */
export const collectionTransportSettingsSchema = z.object({
  timeoutMs: z.number().int().min(0).max(600_000).optional(),
  useCookies: z.boolean().optional(),
  http2Enabled: z.boolean().optional(),
  http2FallbackToHttp1: z.boolean().optional(),
  followRedirects: z.boolean().optional(),
  maxRedirects: z.number().int().min(0).max(50).optional(),
  strictSsl: z.boolean().optional(),
  disableCookiesGlobally: z.boolean().optional(),
  proxyInherit: z.boolean().optional(),
  proxy: httpProxySettingsSchema.partial().optional(),
  ignoreInvalidSsl: z.boolean().optional(),
});

export type CollectionTransportSettings = z.infer<typeof collectionTransportSettingsSchema>;

/** @deprecated Use {@link collectionTransportSettingsSchema}. */
export const collectionRequestTransportSettingsSchema = collectionTransportSettingsSchema;

/** @deprecated Use {@link CollectionTransportSettings}. */
export type CollectionRequestTransportSettings = CollectionTransportSettings;
