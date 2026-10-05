import { z } from 'zod';

import type { CollectionCookie, CollectionFolderAuth, CollectionKvRow } from './collection-folder';
import type { CollectionNode, CollectionTree } from './collection-tree';
import type { CollectionsFile } from './config-files';
import {
  isDatabaseConnectionFolder,
  type DatabaseConnectionTreeItem,
  type DatabasesFile,
} from './database';
import { isEnvironmentVariable, type EnvironmentNode, type EnvironmentsFile } from './environment';
import { isSecretHeaderName } from './history';

export const COLLAB_SECRETS_VERSION = 1;

const secretStringMapSchema = z.record(z.string(), z.string());
const nestedSecretMapSchema = z.record(z.string(), secretStringMapSchema);

export const collabSecretsFileSchema = z.object({
  schemaVersion: z.number().int().positive(),
  environments: secretStringMapSchema,
  auth: nestedSecretMapSchema,
  headers: nestedSecretMapSchema,
  cookies: nestedSecretMapSchema,
  databases: secretStringMapSchema,
});

export type CollabSecretsFile = z.infer<typeof collabSecretsFileSchema>;

export const EMPTY_COLLAB_SECRETS: Readonly<CollabSecretsFile> = Object.freeze({
  schemaVersion: COLLAB_SECRETS_VERSION,
  environments: Object.freeze({}),
  auth: Object.freeze({}),
  headers: Object.freeze({}),
  cookies: Object.freeze({}),
  databases: Object.freeze({}),
});

/** A fresh, mutable empty overlay. */
export function emptyCollabSecrets(): CollabSecretsFile {
  return cloneSecrets(EMPTY_COLLAB_SECRETS);
}

const AUTH_SECRET_FIELDS = [
  'token',
  'password',
  'apiKey',
  'clientSecret',
  'accessToken',
  'refreshToken',
] as const;

/**
 * Reads `secrets.local.json`, tolerating a missing or partial file.
 */
export function parseCollabSecretsFile(raw: unknown): CollabSecretsFile {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return emptyCollabSecrets();
  const source = raw as Record<string, unknown>;
  return {
    schemaVersion: COLLAB_SECRETS_VERSION,
    environments: stringMap(source['environments']),
    auth: nestedStringMap(source['auth']),
    headers: nestedStringMap(source['headers']),
    cookies: nestedStringMap(source['cookies']),
    databases: stringMap(source['databases']),
  };
}

export interface PeeledWorkspaceSecrets {
  readonly environments: EnvironmentsFile;
  readonly collections: CollectionsFile;
  readonly databases: DatabasesFile;
  readonly secrets: CollabSecretsFile;
}

/**
 * Moves secret values into the local overlay and clears them on the team copies.
 */
export function peelWorkspaceSecrets(input: {
  readonly environments: EnvironmentsFile;
  readonly collections: CollectionsFile;
  readonly databases: DatabasesFile;
  readonly secrets?: CollabSecretsFile | null;
}): PeeledWorkspaceSecrets {
  const secrets = cloneSecrets(input.secrets ?? EMPTY_COLLAB_SECRETS);
  return {
    environments: peelEnvironments(input.environments, secrets),
    collections: peelCollections(input.collections, secrets),
    databases: peelDatabases(input.databases, secrets),
    secrets,
  };
}

/**
 * Fills empty secret fields from the local overlay. Values already in memory win.
 */
export function applyCollabSecrets(input: {
  readonly environments: EnvironmentsFile;
  readonly collections: CollectionsFile;
  readonly databases: DatabasesFile;
  readonly secrets: CollabSecretsFile;
}): Pick<PeeledWorkspaceSecrets, 'environments' | 'collections' | 'databases'> {
  return {
    environments: applyEnvironments(input.environments, input.secrets),
    collections: applyCollections(input.collections, input.secrets),
    databases: applyDatabases(input.databases, input.secrets),
  };
}

function cloneSecrets(file: CollabSecretsFile): CollabSecretsFile {
  return {
    schemaVersion: COLLAB_SECRETS_VERSION,
    environments: { ...file.environments },
    auth: copyNested(file.auth),
    headers: copyNested(file.headers),
    cookies: copyNested(file.cookies),
    databases: { ...file.databases },
  };
}

function copyNested(
  source: Readonly<Record<string, Readonly<Record<string, string>>>>,
): Record<string, Record<string, string>> {
  const next: Record<string, Record<string, string>> = {};
  for (const [id, fields] of Object.entries(source))
    next[id] = { ...fields };
  return next;
}

function peelEnvironments(file: EnvironmentsFile, secrets: CollabSecretsFile): EnvironmentsFile {
  const environments: Record<string, string> = { ...secrets.environments };
  const items = file.items.map((env) => ({
    ...env,
    variables: peelEnvironmentNodes(env.variables, environments),
  }));
  secrets.environments = environments;
  return { ...file, items };
}

function peelEnvironmentNodes(
  nodes: readonly EnvironmentNode[],
  into: Record<string, string>,
): EnvironmentNode[] {
  return nodes.map((node) => {
    if (!isEnvironmentVariable(node))
      return { ...node, children: peelEnvironmentNodes(node.children, into) };
    if (!node.secret)
      return node;
    if (node.value)
      into[node.id] = node.value;
    else
      delete into[node.id];
    return { ...node, value: '' };
  });
}

function peelCollections(file: CollectionsFile, secrets: CollabSecretsFile): CollectionsFile {
  const auth = copyNested(secrets.auth);
  const headers = copyNested(secrets.headers);
  const cookies = copyNested(secrets.cookies);
  const collections = peelCollectionTree(file.collections ?? [], auth, headers, cookies);
  secrets.auth = auth;
  secrets.headers = headers;
  secrets.cookies = cookies;
  return { ...file, collections };
}

function peelCollectionTree(
  tree: CollectionTree,
  auth: Record<string, Record<string, string>>,
  headers: Record<string, Record<string, string>>,
  cookies: Record<string, Record<string, string>>,
): CollectionTree {
  return tree.map((node) => peelCollectionNode(node, auth, headers, cookies));
}

function peelCollectionNode(
  node: CollectionNode,
  auth: Record<string, Record<string, string>>,
  headers: Record<string, Record<string, string>>,
  cookies: Record<string, Record<string, string>>,
): CollectionNode {
  if (node.kind === 'folder') {
    return {
      ...node,
      config: node.config
        ? {
            ...node.config,
            auth: peelAuth(node.id, node.config.auth, auth),
            headers: peelHeaders(node.id, node.config.headers, headers),
            settings: {
              ...node.config.settings,
              cookies: peelCookies(node.id, node.config.settings.cookies ?? [], cookies),
            },
          }
        : node.config,
      children: peelCollectionTree(node.children, auth, headers, cookies),
    };
  }
  if (node.kind === 'http') {
    if (!node.config)
      return node;
    return {
      ...node,
      config: {
        ...node.config,
        auth: peelAuth(node.id, node.config.auth, auth),
        headers: peelHeaders(node.id, node.config.headers, headers),
      },
    };
  }
  if (!node.config)
    return node;
  return {
    ...node,
    config: {
      ...node.config,
      auth: peelAuth(node.id, node.config.auth, auth),
      headers: peelHeaders(node.id, node.config.headers, headers),
    },
  };
}

function peelAuth(
  nodeId: string,
  auth: CollectionFolderAuth,
  into: Record<string, Record<string, string>>,
): CollectionFolderAuth {
  const kept: Record<string, string> = {};
  const next = { ...auth } as CollectionFolderAuth;
  const bag = next as unknown as Record<string, string>;
  for (const field of AUTH_SECRET_FIELDS) {
    const value = bag[field]?.trim() ?? '';
    if (value)
      kept[field] = value;
    if (field in auth)
      bag[field] = '';
  }
  if (Object.keys(kept).length === 0)
    delete into[nodeId];
  else
    into[nodeId] = kept;
  return next;
}

function peelHeaders(
  nodeId: string,
  rows: readonly CollectionKvRow[],
  into: Record<string, Record<string, string>>,
): CollectionKvRow[] {
  const kept: Record<string, string> = {};
  const next = rows.map((row) => {
    if (!isSecretHeaderName(row.key))
      return row;
    if (row.value)
      kept[row.id] = row.value;
    return { ...row, value: '' };
  });
  if (Object.keys(kept).length === 0)
    delete into[nodeId];
  else
    into[nodeId] = kept;
  return next;
}

function peelCookies(
  nodeId: string,
  rows: readonly CollectionCookie[],
  into: Record<string, Record<string, string>>,
): CollectionCookie[] {
  const kept: Record<string, string> = {};
  const next = rows.map((row) => {
    if (row.value)
      kept[row.id] = row.value;
    return { ...row, value: '' };
  });
  if (Object.keys(kept).length === 0)
    delete into[nodeId];
  else
    into[nodeId] = kept;
  return next;
}

function peelDatabases(file: DatabasesFile, secrets: CollabSecretsFile): DatabasesFile {
  const databases: Record<string, string> = { ...secrets.databases };
  const nodes = peelDatabaseNodes(file.nodes, databases);
  secrets.databases = databases;
  return { ...file, nodes };
}

function peelDatabaseNodes(
  nodes: readonly DatabaseConnectionTreeItem[],
  into: Record<string, string>,
): DatabaseConnectionTreeItem[] {
  return nodes.map((node) => {
    if (isDatabaseConnectionFolder(node))
      return { ...node, children: peelDatabaseNodes(node.children, into) };
    const password = node.password?.trim() ?? '';
    if (password)
      into[node.id] = password;
    else
      delete into[node.id];
    return { ...node, password: '' };
  });
}

function applyEnvironments(file: EnvironmentsFile, secrets: CollabSecretsFile): EnvironmentsFile {
  return {
    ...file,
    items: file.items.map((env) => ({
      ...env,
      variables: applyEnvironmentNodes(env.variables, secrets.environments),
    })),
  };
}

function applyEnvironmentNodes(
  nodes: readonly EnvironmentNode[],
  secrets: Readonly<Record<string, string>>,
): EnvironmentNode[] {
  return nodes.map((node) => {
    if (!isEnvironmentVariable(node))
      return { ...node, children: applyEnvironmentNodes(node.children, secrets) };
    if (!node.secret || node.value)
      return node;
    const stored = secrets[node.id];
    if (!stored)
      return node;
    return { ...node, value: stored };
  });
}

function applyCollections(file: CollectionsFile, secrets: CollabSecretsFile): CollectionsFile {
  return {
    ...file,
    collections: applyCollectionTree(file.collections ?? [], secrets),
  };
}

function applyCollectionTree(tree: CollectionTree, secrets: CollabSecretsFile): CollectionTree {
  return tree.map((node) => {
    if (node.kind === 'folder') {
      return {
        ...node,
        config: node.config
          ? {
              ...node.config,
              auth: applyAuth(node.id, node.config.auth, secrets),
              headers: applyHeaders(node.id, node.config.headers, secrets),
              settings: {
                ...node.config.settings,
                cookies: applyCookies(node.id, node.config.settings.cookies ?? [], secrets),
              },
            }
          : node.config,
        children: applyCollectionTree(node.children, secrets),
      };
    }
    if (node.kind === 'http') {
      if (!node.config)
        return node;
      return {
        ...node,
        config: {
          ...node.config,
          auth: applyAuth(node.id, node.config.auth, secrets),
          headers: applyHeaders(node.id, node.config.headers, secrets),
        },
      };
    }
    if (!node.config)
      return node;
    return {
      ...node,
      config: {
        ...node.config,
        auth: applyAuth(node.id, node.config.auth, secrets),
        headers: applyHeaders(node.id, node.config.headers, secrets),
      },
    };
  });
}

function applyAuth(
  nodeId: string,
  auth: CollectionFolderAuth,
  secrets: CollabSecretsFile,
): CollectionFolderAuth {
  const stored = secrets.auth[nodeId];
  if (!stored)
    return auth;
  const next = { ...auth } as CollectionFolderAuth;
  const bag = next as unknown as Record<string, string>;
  for (const field of AUTH_SECRET_FIELDS) {
    const value = stored[field];
    if (value && !bag[field])
      bag[field] = value;
  }
  return next;
}

function applyHeaders(
  nodeId: string,
  rows: readonly CollectionKvRow[],
  secrets: CollabSecretsFile,
): CollectionKvRow[] {
  const stored = secrets.headers[nodeId];
  if (!stored)
    return [...rows];
  return rows.map((row) => {
    if (!isSecretHeaderName(row.key) || row.value)
      return row;
    const value = stored[row.id];
    return value ? { ...row, value } : row;
  });
}

function applyCookies(
  nodeId: string,
  rows: readonly CollectionCookie[],
  secrets: CollabSecretsFile,
): CollectionCookie[] {
  const stored = secrets.cookies[nodeId];
  if (!stored)
    return [...rows];
  return rows.map((row) => {
    if (row.value)
      return row;
    const value = stored[row.id];
    return value ? { ...row, value } : row;
  });
}

function applyDatabases(file: DatabasesFile, secrets: CollabSecretsFile): DatabasesFile {
  return {
    ...file,
    nodes: applyDatabaseNodes(file.nodes, secrets.databases),
  };
}

function applyDatabaseNodes(
  nodes: readonly DatabaseConnectionTreeItem[],
  secrets: Readonly<Record<string, string>>,
): DatabaseConnectionTreeItem[] {
  return nodes.map((node) => {
    if (isDatabaseConnectionFolder(node))
      return { ...node, children: applyDatabaseNodes(node.children, secrets) };
    if (node.password)
      return node;
    const password = secrets[node.id];
    return password ? { ...node, password } : node;
  });
}

function stringMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return {};
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' && value)
      next[key] = value;
  }
  return next;
}

function nestedStringMap(raw: unknown): Record<string, Record<string, string>> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return {};
  const next: Record<string, Record<string, string>> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const inner = stringMap(value);
    if (Object.keys(inner).length > 0)
      next[key] = inner;
  }
  return next;
}
