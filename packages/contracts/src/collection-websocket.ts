import { z } from 'zod';

import {
  collectionFolderAuthSchema,
  collectionFolderSettingsSchema,
  collectionKvRowSchema,
  type CollectionFolderAuth,
  type CollectionFolderSettings,
  type CollectionKvRow,
} from './collection-folder';
import { requestAuthModeSchema, type RequestAuthMode } from './collection-request';

export const WEBSOCKET_TAB_SECTIONS = [
  'messages',
  'params',
  'headers',
  'auth',
  'settings',
  'docs',
] as const;

export const websocketTabSectionSchema = z.enum(WEBSOCKET_TAB_SECTIONS);

export type WebsocketTabSection = z.infer<typeof websocketTabSectionSchema>;

export const WEBSOCKET_AUTH_MODES = [
  'inherit',
  'none',
  'bearer',
  'basic',
  'apikey',
] as const satisfies readonly RequestAuthMode[];

export const collectionWebSocketConfigSchema = z.object({
  url: z.string().default(''),
  queryParams: z.array(collectionKvRowSchema).default([]),
  headers: z.array(collectionKvRowSchema).default([]),
  protocols: z.string().default(''),
  authMode: requestAuthModeSchema.default('inherit'),
  auth: collectionFolderAuthSchema.default(() => collectionFolderAuthSchema.parse({})),
  settings: collectionFolderSettingsSchema.partial().optional(),
  tags: z.array(z.string()).default([]),
  description: z.string().default(''),
  docs: z.string().default(''),
});

export type CollectionWebSocketConfig = z.infer<typeof collectionWebSocketConfigSchema>;

export const DEFAULT_WEBSOCKET_CONFIG: CollectionWebSocketConfig = collectionWebSocketConfigSchema.parse({});

export function parseCollectionWebSocketConfig(raw: unknown): CollectionWebSocketConfig {
  const parsed = collectionWebSocketConfigSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : { ...DEFAULT_WEBSOCKET_CONFIG };
}

export function websocketConfigOf(node: { readonly config?: unknown }): CollectionWebSocketConfig {
  return parseCollectionWebSocketConfig(node.config ?? {});
}

export function websocketTabSlideDir(
  from: WebsocketTabSection,
  to: WebsocketTabSection,
): 'left' | 'right' {
  return WEBSOCKET_TAB_SECTIONS.indexOf(to) > WEBSOCKET_TAB_SECTIONS.indexOf(from) ? 'right' : 'left';
}

export function parseWebsocketProtocols(raw: string): string[] {
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export type { CollectionFolderAuth, CollectionFolderSettings, CollectionKvRow, RequestAuthMode };
