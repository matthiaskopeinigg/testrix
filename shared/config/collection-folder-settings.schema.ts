import { z } from 'zod';

import { collectionTransportSettingsSchema } from './collection-transport-settings.schema';

export const COLLECTION_DESCRIBED_KV_MAX_ROWS = 64;
export const COLLECTION_FOLDER_TAGS_MAX = 16;

export const collectionDescribedKeyValueRowSchema = z.object({
  id: z.string().min(1),
  key: z.string(),
  value: z.string(),
  description: z.string().optional(),
});

export type CollectionDescribedKeyValueRow = z.infer<typeof collectionDescribedKeyValueRowSchema>;

export const COLLECTION_FOLDER_AUTH_TYPES = [
  'none',
  'inherit',
  'bearer',
  'basic',
  'apiKey',
  'oauth2',
] as const;

export type CollectionFolderAuthType = (typeof COLLECTION_FOLDER_AUTH_TYPES)[number];

export const COLLECTION_OAUTH2_GRANT_TYPES = [
  'authorization_code',
  'client_credentials',
  'password',
] as const;

export type CollectionOAuth2GrantType = (typeof COLLECTION_OAUTH2_GRANT_TYPES)[number];

export const collectionFolderAuthNoneSchema = z.object({
  type: z.literal('none'),
});

export const collectionFolderAuthInheritSchema = z.object({
  type: z.literal('inherit'),
});

export const collectionFolderAuthBearerSchema = z.object({
  type: z.literal('bearer'),
  token: z.string(),
});

export const collectionFolderAuthBasicSchema = z.object({
  type: z.literal('basic'),
  username: z.string(),
  password: z.string(),
});

export const collectionFolderAuthApiKeySchema = z.object({
  type: z.literal('apiKey'),
  name: z.string(),
  value: z.string(),
  in: z.enum(['header', 'query']),
});

export const collectionFolderAuthOAuth2Schema = z.object({
  type: z.literal('oauth2'),
  grantType: z.enum(COLLECTION_OAUTH2_GRANT_TYPES),
  authUrl: z.string(),
  tokenUrl: z.string(),
  clientId: z.string(),
  clientSecret: z.string(),
  scope: z.string(),
  redirectUri: z.string(),
});

export const collectionFolderAuthSchema = z.discriminatedUnion('type', [
  collectionFolderAuthNoneSchema,
  collectionFolderAuthInheritSchema,
  collectionFolderAuthBearerSchema,
  collectionFolderAuthBasicSchema,
  collectionFolderAuthApiKeySchema,
  collectionFolderAuthOAuth2Schema,
]);

export type CollectionFolderAuth = z.infer<typeof collectionFolderAuthSchema>;

export const collectionFolderScriptsSchema = z.object({
  pre: z.string(),
  post: z.string(),
});

export type CollectionFolderScripts = z.infer<typeof collectionFolderScriptsSchema>;

export const collectionFolderSettingsSchema = z.object({
  tags: z.array(z.string().min(1)).max(COLLECTION_FOLDER_TAGS_MAX).default([]),
  docs: z.string().default(''),
  variables: z.array(collectionDescribedKeyValueRowSchema).max(COLLECTION_DESCRIBED_KV_MAX_ROWS),
  headers: z.array(collectionDescribedKeyValueRowSchema).max(COLLECTION_DESCRIBED_KV_MAX_ROWS),
  auth: collectionFolderAuthSchema,
  scripts: collectionFolderScriptsSchema,
  /** Default transport for requests under this folder (merged at send time). */
  transport: collectionTransportSettingsSchema,
});

export type CollectionFolderSettings = z.infer<typeof collectionFolderSettingsSchema>;

/** Creates a described key/value row with a stable id. */
export function createCollectionDescribedKeyValueRow(
  partial?: Partial<Pick<CollectionDescribedKeyValueRow, 'key' | 'value' | 'description'>>,
): CollectionDescribedKeyValueRow {
  const id =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `kv-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    id,
    key: partial?.key ?? '',
    value: partial?.value ?? '',
    description: partial?.description,
  };
}

/** Default auth when a folder has no explicit configuration. */
export function createDefaultCollectionFolderAuth(): CollectionFolderAuth {
  return { type: 'none' };
}

/** Default scripts for a collection folder. */
export function createDefaultCollectionFolderScripts(): CollectionFolderScripts {
  return { pre: '', post: '' };
}

/** Default folder settings (variables, headers, auth, scripts). */
export function createDefaultCollectionFolderSettings(): CollectionFolderSettings {
  return {
    tags: [],
    docs: '',
    variables: [],
    headers: [],
    auth: createDefaultCollectionFolderAuth(),
    scripts: createDefaultCollectionFolderScripts(),
    transport: {},
  };
}

/** Ensures folder settings include defaults for missing fields. */
export function enrichCollectionFolderSettings(
  raw: unknown,
): CollectionFolderSettings {
  const defaults = createDefaultCollectionFolderSettings();
  if (typeof raw !== 'object' || raw === null) {
    return defaults;
  }

  const record = raw as Record<string, unknown>;
  const parsed = collectionFolderSettingsSchema.safeParse({
    tags: Array.isArray(record['tags']) ? record['tags'] : defaults.tags,
    docs: typeof record['docs'] === 'string' ? record['docs'] : defaults.docs,
    variables: Array.isArray(record['variables']) ? record['variables'] : defaults.variables,
    headers: Array.isArray(record['headers']) ? record['headers'] : defaults.headers,
    auth: record['auth'] ?? defaults.auth,
    scripts:
      typeof record['scripts'] === 'object' && record['scripts'] !== null
        ? { ...defaults.scripts, ...(record['scripts'] as object) }
        : defaults.scripts,
    transport:
      typeof record['transport'] === 'object' && record['transport'] !== null
        ? { ...defaults.transport, ...(record['transport'] as object) }
        : defaults.transport,
  });

  return parsed.success ? parsed.data : defaults;
}
