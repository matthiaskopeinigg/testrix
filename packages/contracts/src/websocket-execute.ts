import { z } from 'zod';

import { collectionFolderAuthSchema } from './collection-folder';
import { httpHeaderPairSchema } from './http-execute';
import { proxySettingsSchema } from './network-settings';

export const websocketConnectRequestSchema = z.object({
  connectionId: z.string().min(1),
  url: z.string().min(1),
  headers: z.array(httpHeaderPairSchema).default([]),
  protocols: z.array(z.string()).default([]),
  verifyTls: z.boolean().default(true),
  timeoutMs: z.number().int().min(1).max(300000).default(30000),
  auth: collectionFolderAuthSchema.default(() => collectionFolderAuthSchema.parse({})),
  proxy: proxySettingsSchema.optional(),
});

export type WebsocketConnectRequest = z.infer<typeof websocketConnectRequestSchema>;

export const websocketConnectResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().nullable(),
  protocol: z.string().default(''),
});

export type WebsocketConnectResult = z.infer<typeof websocketConnectResultSchema>;

export const websocketSendRequestSchema = z.object({
  connectionId: z.string().min(1),
  data: z.string(),
});

export type WebsocketSendRequest = z.infer<typeof websocketSendRequestSchema>;

export const websocketSendResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().nullable(),
});

export type WebsocketSendResult = z.infer<typeof websocketSendResultSchema>;

export const websocketEventKindSchema = z.enum(['open', 'message', 'error', 'close']);

export type WebsocketEventKind = z.infer<typeof websocketEventKindSchema>;

export const websocketEventSchema = z.object({
  connectionId: z.string().min(1),
  kind: websocketEventKindSchema,
  at: z.string().min(1),
  body: z.string().default(''),
  code: z.number().int().optional(),
  reason: z.string().default(''),
});

export type WebsocketEvent = z.infer<typeof websocketEventSchema>;
