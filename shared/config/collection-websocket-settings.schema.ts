import { z } from 'zod';

import {
  COLLECTION_DESCRIBED_KV_MAX_ROWS,
  COLLECTION_FOLDER_TAGS_MAX,
  collectionDescribedKeyValueRowSchema,
  collectionFolderAuthSchema,
  collectionFolderScriptsSchema,
  createDefaultCollectionFolderAuth,
  createDefaultCollectionFolderScripts,
} from './collection-folder-settings.schema';
import { collectionTransportSettingsSchema } from './collection-transport-settings.schema';
import { COLLECTION_REQUEST_KV_MAX_ROWS } from './collection-request-settings.schema';
import { createHttpKeyValueRow, httpKeyValueRowSchema } from './http-settings.schema';

export const collectionWebsocketSettingsSchema = z.object({
  /** Environment profile id from environments.json used for `{{variable}}` substitution. */
  environmentId: z.string().nullable().default(null),
  tags: z.array(z.string().min(1)).max(COLLECTION_FOLDER_TAGS_MAX).default([]),
  docs: z.string().default(''),
  queryParams: z.array(httpKeyValueRowSchema).max(COLLECTION_REQUEST_KV_MAX_ROWS),
  headers: z.array(collectionDescribedKeyValueRowSchema).max(COLLECTION_DESCRIBED_KV_MAX_ROWS),
  auth: collectionFolderAuthSchema,
  message: z.string().default(''),
  scripts: collectionFolderScriptsSchema,
  transport: collectionTransportSettingsSchema,
});

export type CollectionWebsocketSettings = z.infer<typeof collectionWebsocketSettingsSchema>;

/** Default settings for a new websocket collection node. */
export function createDefaultCollectionWebsocketSettings(): CollectionWebsocketSettings {
  return {
    environmentId: null,
    tags: [],
    docs: '',
    queryParams: [],
    headers: [],
    auth: createDefaultCollectionFolderAuth(),
    message: '',
    scripts: createDefaultCollectionFolderScripts(),
    transport: {},
  };
}

/** Ensures websocket settings include defaults for missing fields. */
export function enrichCollectionWebsocketSettings(raw: unknown): CollectionWebsocketSettings {
  const defaults = createDefaultCollectionWebsocketSettings();
  if (typeof raw !== 'object' || raw === null) {
    return defaults;
  }

  const record = raw as Record<string, unknown>;
  const parsed = collectionWebsocketSettingsSchema.safeParse({
    environmentId:
      typeof record['environmentId'] === 'string'
        ? record['environmentId']
        : record['environmentId'] === null
          ? null
          : defaults.environmentId,
    tags: Array.isArray(record['tags']) ? record['tags'] : defaults.tags,
    docs: typeof record['docs'] === 'string' ? record['docs'] : defaults.docs,
    queryParams: Array.isArray(record['queryParams']) ? record['queryParams'] : defaults.queryParams,
    headers: Array.isArray(record['headers']) ? record['headers'] : defaults.headers,
    auth: record['auth'] ?? defaults.auth,
    message: typeof record['message'] === 'string' ? record['message'] : defaults.message,
    scripts:
      typeof record['scripts'] === 'object' && record['scripts'] !== null
        ? { ...defaults.scripts, ...(record['scripts'] as object) }
        : defaults.scripts,
    transport:
      typeof record['transport'] === 'object' && record['transport'] !== null
        ? record['transport']
        : defaults.transport,
  });

  return parsed.success ? parsed.data : defaults;
}

export { createHttpKeyValueRow };
