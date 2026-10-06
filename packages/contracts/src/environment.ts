import { z } from 'zod';

import { newEntityId } from './entity-id';
import { CONFIG_SCHEMA_VERSION } from './settings';

/** One key/value pair inside an environment. */
export const environmentVariableSchema = z.object({
  kind: z.literal('variable').default('variable'),
  id: z.string().min(1),
  key: z.string(),
  value: z.string(),
  description: z.string().default(''),
  enabled: z.boolean(),
  secret: z.boolean(),
});

export type EnvironmentVariable = z.infer<typeof environmentVariableSchema>;

/** Named group of variables or nested folders. */
export type EnvironmentFolder = {
  readonly kind: 'folder';
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly collapsed: boolean;
  readonly children: EnvironmentNode[];
};

export type EnvironmentNode = EnvironmentVariable | EnvironmentFolder;

export const environmentFolderSchema: z.ZodType<EnvironmentFolder> = z.lazy(() =>
  z.object({
    kind: z.literal('folder'),
    id: z.string().min(1),
    name: z.string(),
    description: z.string().default(''),
    collapsed: z.boolean().default(false),
    children: z.array(environmentNodeSchema),
  }),
);

export const environmentNodeSchema: z.ZodType<EnvironmentNode> = z.lazy(() =>
  z.union([environmentVariableSchema, environmentFolderSchema]),
);

export function isEnvironmentFolder(node: EnvironmentNode): node is EnvironmentFolder {
  return node.kind === 'folder';
}

export function isEnvironmentVariable(node: EnvironmentNode): node is EnvironmentVariable {
  return node.kind !== 'folder';
}

/** Enabled environment variables as a name-to-value map for `{{var}}` substitution. */
export function environmentVariableMap(nodes: readonly EnvironmentNode[]): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (list: readonly EnvironmentNode[]): void => {
    for (const node of list) {
      if (isEnvironmentFolder(node)) {
        walk(node.children);
        continue;
      }
      if (node.enabled && node.key.trim())
        out[node.key.trim()] = node.value;
    }
  };
  walk(nodes);
  return out;
}

/** Last enabled variable with this key, matching `environmentVariableMap` overlay order. */
export function findEnabledEnvironmentVariableByKey(
  nodes: readonly EnvironmentNode[],
  key: string,
): EnvironmentVariable | null {
  const needle = key.trim().toLowerCase();
  if (!needle)
    return null;
  let found: EnvironmentVariable | null = null;
  const walk = (list: readonly EnvironmentNode[]): void => {
    for (const node of list) {
      if (isEnvironmentFolder(node)) {
        walk(node.children);
        continue;
      }
      if (node.enabled && node.key.trim().toLowerCase() === needle)
        found = node;
    }
  };
  walk(nodes);
  return found;
}

/** Named variable set shown in the Environments sidebar. */
export const environmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  modifiedAt: z.string().min(1),
  variables: z.array(environmentNodeSchema),
});

export type Environment = z.infer<typeof environmentSchema>;

export const environmentListSchema = z.array(environmentSchema);

export type EnvironmentList = Environment[];

export const environmentPrefsSchema = z.object({
  activeId: z.string().nullable(),
  orderIds: z.array(z.string()),
});

export type EnvironmentPrefs = z.infer<typeof environmentPrefsSchema>;

export const DEFAULT_ENVIRONMENT_PREFS: EnvironmentPrefs = {
  activeId: null,
  orderIds: [],
};

function variable(
  envId: string,
  key: string,
  value: string,
  secret = false,
  description = '',
): EnvironmentVariable {
  return {
    kind: 'variable',
    id: `${envId}-${key.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    key,
    value,
    description,
    enabled: true,
    secret,
  };
}

function folder(
  envId: string,
  name: string,
  children: EnvironmentNode[],
  description = '',
): EnvironmentFolder {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return {
    kind: 'folder',
    id: `${envId}-folder-${slug}`,
    name,
    description,
    collapsed: false,
    children,
  };
}

/** New environments start empty. Users add the keys they need. */
export function createDefaultVariables(_envId: string): EnvironmentNode[] {
  return [];
}

/** First-run dummy rows. Cleared on load when an environment still matches exactly. */
function legacySeededVariables(envId: string): EnvironmentNode[] {
  const testdata = folder(
    envId,
    'testdata',
    [
      variable(
        `${envId}-testdata`,
        'username',
        `${envId.replace('env-', '')}-user`,
        false,
        'Sign-in account',
      ),
      variable(
        `${envId}-testdata`,
        'pw',
        `${envId.replace('env-', '')}-secret`,
        true,
        'Sign-in password',
      ),
    ],
    'Login fixtures',
  );
  switch (envId) {
    case 'env-local':
      return [
        testdata,
        folder(
          envId,
          'url',
          [variable(`${envId}-url`, 'web', 'http://localhost:4100', false, 'Web origin')],
          'Hosts',
        ),
        variable(envId, 'BASE_URL', 'http://localhost:4100', false, 'API origin'),
        variable(envId, 'API_PREFIX', '/v1'),
        variable(envId, 'API_TOKEN', 'local-dev-token', true),
        variable(envId, 'TENANT_ID', 'acme-local'),
        variable(envId, 'TIMEOUT_MS', '8000'),
        variable(envId, 'FEATURE_FLAGS', 'drafts,webhooks'),
        variable(envId, 'LOG_LEVEL', 'debug'),
        variable(envId, 'WEBHOOK_SECRET', 'local-webhook', true),
      ];
    case 'env-staging':
      return [
        testdata,
        folder(envId, 'url', [variable(`${envId}-url`, 'web', 'https://staging.api.local')]),
        variable(envId, 'BASE_URL', 'https://staging.api.local'),
        variable(envId, 'API_PREFIX', '/v1'),
        variable(envId, 'API_TOKEN', 'staging-token', true),
        variable(envId, 'TENANT_ID', 'acme-staging'),
        variable(envId, 'TIMEOUT_MS', '12000'),
        variable(envId, 'LOG_LEVEL', 'info'),
      ];
    case 'env-production':
      return [
        testdata,
        folder(envId, 'url', [variable(`${envId}-url`, 'web', 'https://api.local')]),
        variable(envId, 'BASE_URL', 'https://api.local'),
        variable(envId, 'API_PREFIX', '/v1'),
        variable(envId, 'API_TOKEN', 'prod-token', true),
        variable(envId, 'TENANT_ID', 'acme'),
        variable(envId, 'TIMEOUT_MS', '8000'),
        variable(envId, 'FEATURE_FLAGS', 'webhooks'),
        variable(envId, 'LOG_LEVEL', 'warn'),
        variable(envId, 'REGION', 'eu-central'),
        variable(envId, 'CDN_HOST', 'https://cdn.local'),
        variable(envId, 'WEBHOOK_SECRET', 'prod-webhook', true),
        variable(envId, 'RATE_LIMIT', '1200'),
        variable(envId, 'AUDIT', 'on'),
      ];
    case 'env-ci':
      return [
        testdata,
        folder(envId, 'url', [variable(`${envId}-url`, 'web', 'http://127.0.0.1:4100')]),
        variable(envId, 'BASE_URL', 'http://127.0.0.1:4100'),
        variable(envId, 'API_TOKEN', 'ci-token', true),
        variable(envId, 'TENANT_ID', 'ci'),
        variable(envId, 'LOG_LEVEL', 'error'),
      ];
    case 'env-sandbox':
      return [
        testdata,
        folder(envId, 'url', [variable(`${envId}-url`, 'web', 'https://sandbox.api.local')]),
        variable(envId, 'BASE_URL', 'https://sandbox.api.local'),
        variable(envId, 'API_TOKEN', 'sandbox-token', true),
        variable(envId, 'TENANT_ID', 'sandbox'),
      ];
    case 'env-preview':
      return [
        testdata,
        folder(envId, 'url', [variable(`${envId}-url`, 'web', 'https://preview.api.local')]),
        variable(envId, 'BASE_URL', 'https://preview.api.local'),
        variable(envId, 'API_PREFIX', '/v1'),
        variable(envId, 'API_TOKEN', 'preview-token', true),
        variable(envId, 'TENANT_ID', 'preview'),
        variable(envId, 'LOG_LEVEL', 'debug'),
      ];
    default:
      return [];
  }
}

function seedSignature(nodes: readonly EnvironmentNode[]): string {
  const rows: string[] = [];
  const walk = (list: readonly EnvironmentNode[], path: string): void => {
    for (const node of list) {
      if (isEnvironmentFolder(node)) {
        walk(node.children, `${path}${node.name}/`);
        continue;
      }
      rows.push(`${path}${node.key}=${node.value}`);
    }
  };
  walk(nodes, '');
  return rows.sort().join('\n');
}

function stripLegacySeededVariables(envId: string, nodes: EnvironmentNode[]): EnvironmentNode[] {
  const seed = legacySeededVariables(envId);
  if (seed.length === 0 || nodes.length === 0)
    return nodes;
  return seedSignature(nodes) === seedSignature(seed) ? [] : nodes;
}

function countNodes(nodes: readonly EnvironmentNode[]): number {
  let total = 0;
  for (const node of nodes) {
    if (isEnvironmentFolder(node)) {
      total += countNodes(node.children);
      continue;
    }
    if (node.key.trim().length > 0) {
      total += 1;
    }
  }
  return total;
}

/** Count of named variables, ignoring blank draft rows. */
export function environmentVariableCount(env: Environment): number {
  return countNodes(env.variables);
}

/** True when a variable is off, or a folder only contains disabled variables. */
export function isEnvironmentNodeInactive(node: EnvironmentNode): boolean {
  if (isEnvironmentVariable(node))
    return !node.enabled;
  let sawVariable = false;
  const hasEnabled = (nodes: readonly EnvironmentNode[]): boolean => {
    for (const child of nodes) {
      if (isEnvironmentFolder(child)) {
        if (hasEnabled(child.children))
          return true;
        continue;
      }
      sawVariable = true;
      if (child.enabled)
        return true;
    }
    return false;
  };
  const enabled = hasEnabled(node.children);
  return sawVariable && !enabled;
}

/** Keeps folders and variables; strips the literal "undefined" description leftover. */
export function persistEnvironmentNodes(nodes: readonly EnvironmentNode[]): EnvironmentNode[] {
  const next: EnvironmentNode[] = [];
  for (const node of nodes) {
    if (isEnvironmentFolder(node)) {
      next.push({
        ...node,
        name: node.name.trim() || 'Folder',
        description: persistDescription(node.description),
        children: persistEnvironmentNodes(node.children),
      });
      continue;
    }
    next.push({
      ...node,
      description: persistDescription(node.description),
    });
  }
  return next;
}

function persistDescription(value: string): string {
  const trimmed = value.trim();
  return trimmed === 'undefined' ? '' : trimmed;
}

export function mapEnvironmentNodes(
  nodes: readonly EnvironmentNode[],
  id: string,
  update: (node: EnvironmentNode) => EnvironmentNode | null,
): EnvironmentNode[] {
  const next: EnvironmentNode[] = [];
  for (const node of nodes) {
    if (node.id === id) {
      const replacement = update(node);
      if (replacement) {
        next.push(replacement);
      }
      continue;
    }
    if (isEnvironmentFolder(node)) {
      next.push({ ...node, children: mapEnvironmentNodes(node.children, id, update) });
      continue;
    }
    next.push(node);
  }
  return next;
}

export function insertEnvironmentNode(
  nodes: readonly EnvironmentNode[],
  parentId: string | null,
  child: EnvironmentNode,
): EnvironmentNode[] {
  if (!parentId) {
    return [...nodes, child];
  }
  return nodes.map((node) => {
    if (node.id === parentId && isEnvironmentFolder(node)) {
      return { ...node, children: [...node.children, child] };
    }
    if (isEnvironmentFolder(node)) {
      return { ...node, children: insertEnvironmentNode(node.children, parentId, child) };
    }
    return node;
  });
}

export interface EnvironmentNodeLocation {
  readonly node: EnvironmentNode;
  readonly parentId: string | null;
  readonly index: number;
  readonly siblings: readonly EnvironmentNode[];
}

export function findEnvironmentFolder(
  nodes: readonly EnvironmentNode[],
  id: string,
): EnvironmentFolder | null {
  for (const node of nodes) {
    if (!isEnvironmentFolder(node)) {
      continue;
    }
    if (node.id === id) {
      return node;
    }
    const nested = findEnvironmentFolder(node.children, id);
    if (nested) {
      return nested;
    }
  }
  return null;
}

export function findEnvironmentLocation(
  nodes: readonly EnvironmentNode[],
  id: string,
  parentId: string | null = null,
): EnvironmentNodeLocation | null {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node.id === id) {
      return { node, parentId, index, siblings: nodes };
    }
    if (isEnvironmentFolder(node)) {
      const nested = findEnvironmentLocation(node.children, id, node.id);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}

export function isEnvironmentDescendant(
  nodes: readonly EnvironmentNode[],
  ancestorId: string,
  id: string,
): boolean {
  const ancestor = findEnvironmentFolder(nodes, ancestorId);
  if (!ancestor) {
    return false;
  }
  return findEnvironmentLocation(ancestor.children, id) !== null;
}

export function environmentFolderCount(nodes: readonly EnvironmentNode[], excludeId?: string): number {
  return nodes.filter((node) => isEnvironmentFolder(node) && node.id !== excludeId).length;
}

export function insertEnvironmentNodeAt(
  nodes: readonly EnvironmentNode[],
  parentId: string | null,
  index: number,
  child: EnvironmentNode,
): EnvironmentNode[] {
  if (!parentId) {
    const next = [...nodes];
    next.splice(Math.max(0, Math.min(index, next.length)), 0, child);
    return next;
  }
  return nodes.map((node) => {
    if (node.id === parentId && isEnvironmentFolder(node)) {
      const children = [...node.children];
      children.splice(Math.max(0, Math.min(index, children.length)), 0, child);
      return { ...node, collapsed: false, children };
    }
    if (isEnvironmentFolder(node)) {
      return { ...node, children: insertEnvironmentNodeAt(node.children, parentId, index, child) };
    }
    return node;
  });
}

function environmentFolderIndex(siblings: readonly EnvironmentNode[], id: string): number {
  let index = 0;
  for (const node of siblings) {
    if (node.id === id) {
      return index;
    }
    if (isEnvironmentFolder(node)) {
      index += 1;
    }
  }
  return index;
}

function replaceSiblingList(
  nodes: readonly EnvironmentNode[],
  parentId: string | null,
  nextSiblings: readonly EnvironmentNode[],
): EnvironmentNode[] {
  if (!parentId) {
    return [...nextSiblings];
  }
  return nodes.map((node) => {
    if (node.id === parentId && isEnvironmentFolder(node)) {
      return { ...node, collapsed: false, children: [...nextSiblings] };
    }
    if (isEnvironmentFolder(node)) {
      return { ...node, children: replaceSiblingList(node.children, parentId, nextSiblings) };
    }
    return node;
  });
}

function clampEnvironmentInsertIndex(
  siblings: readonly EnvironmentNode[],
  dragged: EnvironmentNode,
  index: number,
): number {
  const folders = environmentFolderCount(siblings, dragged.id);
  if (isEnvironmentFolder(dragged)) {
    return Math.max(0, Math.min(index, folders));
  }
  return Math.max(folders, Math.min(index, siblings.length));
}

/**
 * Moves a node under `parentId` (null = environment root) at `index`.
 * Folders stay in the leading sibling slots; variables stay after them.
 * For folders, `index` is counted among folders only.
 * Returns null when the drop would not change the tree.
 */
export function moveEnvironmentNode(
  nodes: readonly EnvironmentNode[],
  id: string,
  parentId: string | null,
  index: number,
): EnvironmentNode[] | null {
  const current = findEnvironmentLocation(nodes, id);
  if (!current) {
    return null;
  }
  if (parentId === id || (parentId && isEnvironmentDescendant(nodes, id, parentId))) {
    return null;
  }

  const stripped = mapEnvironmentNodes(nodes, id, () => null);
  const removed = current.node;
  const siblings = parentId ? findEnvironmentFolder(stripped, parentId)?.children : stripped;
  if (!siblings) {
    return null;
  }

  if (isEnvironmentFolder(removed)) {
    const folders = siblings.filter(isEnvironmentFolder);
    const variables = siblings.filter((node) => !isEnvironmentFolder(node));
    const from = environmentFolderIndex(current.siblings, id);
    let insertIndex = index;
    if (current.parentId === parentId && from < insertIndex) {
      insertIndex -= 1;
    }
    insertIndex = Math.max(0, Math.min(insertIndex, folders.length));
    if (current.parentId === parentId && insertIndex === from) {
      return null;
    }
    return replaceSiblingList(stripped, parentId, [
      ...folders.slice(0, insertIndex),
      removed,
      ...folders.slice(insertIndex),
      ...variables,
    ]);
  }

  let insertIndex = index;
  if (current.parentId === parentId && current.index < index) {
    insertIndex = index - 1;
  }
  insertIndex = clampEnvironmentInsertIndex(siblings, removed, insertIndex);
  if (current.parentId === parentId && insertIndex === current.index) {
    return null;
  }
  return insertEnvironmentNodeAt(stripped, parentId, insertIndex, removed);
}

export function flattenEnvironmentNodes(nodes: readonly EnvironmentNode[]): EnvironmentNode[] {
  const out: EnvironmentNode[] = [];
  const walk = (list: readonly EnvironmentNode[]): void => {
    for (const node of list) {
      out.push(node);
      if (isEnvironmentFolder(node)) {
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return out;
}

export function collectEnvironmentNodeIds(nodes: readonly EnvironmentNode[]): Set<string> {
  return new Set(flattenEnvironmentNodes(nodes).map((node) => node.id));
}

/**
 * Collects secret variable values from every environment in the file.
 */
export function collectEnvironmentSecrets(file: EnvironmentsFile): string[] {
  const values: string[] = [];
  for (const env of file.items) {
    for (const node of flattenEnvironmentNodes(env.variables)) {
      if (!isEnvironmentVariable(node) || !node.secret)
        continue;
      const value = node.value.trim();
      if (value)
        values.push(value);
    }
  }
  return [...new Set(values)];
}

/**
 * Moves `ids` under `parentId` at `index` as one block.
 * Selected descendants of other selected folders are skipped.
 * Folders occupy the leading sibling slots; variables follow them.
 */
export function moveEnvironmentNodes(
  nodes: readonly EnvironmentNode[],
  ids: readonly string[],
  parentId: string | null,
  index: number,
): EnvironmentNode[] | null {
  const unique = [...new Set(ids)];
  if (unique.length === 0) {
    return null;
  }
  if (unique.length === 1) {
    return moveEnvironmentNode(nodes, unique[0], parentId, index);
  }

  const ordered = flattenEnvironmentNodes(nodes).filter((node) => unique.includes(node.id));
  const moving = ordered.filter(
    (node) => !unique.some((other) => other !== node.id && isEnvironmentDescendant(nodes, other, node.id)),
  );
  if (moving.length === 0) {
    return null;
  }

  for (const node of moving) {
    if (!isEnvironmentFolder(node)) {
      continue;
    }
    if (parentId === node.id || (parentId && isEnvironmentDescendant(nodes, node.id, parentId))) {
      return null;
    }
  }

  let stripped = nodes;
  for (const node of moving) {
    stripped = mapEnvironmentNodes(stripped, node.id, () => null);
  }

  const siblings = parentId ? findEnvironmentFolder(stripped, parentId)?.children : stripped;
  if (!siblings) {
    return null;
  }

  const folders = moving.filter(isEnvironmentFolder);
  const variables = moving.filter((node) => !isEnvironmentFolder(node));
  const existingFolders = siblings.filter(isEnvironmentFolder);
  const existingVars = siblings.filter((node) => !isEnvironmentFolder(node));

  const originalParent = parentId ? findEnvironmentFolder(nodes, parentId)?.children ?? [] : nodes;
  let folderIndex = index;
  if (folders.length > 0) {
    const removedBefore = folders.filter((folder) => {
      const current = findEnvironmentLocation(nodes, folder.id);
      return current?.parentId === parentId && environmentFolderIndex(originalParent, folder.id) < index;
    }).length;
    folderIndex = Math.max(0, Math.min(index - removedBefore, existingFolders.length));
  }

  const nextFolders =
    folders.length > 0
      ? [...existingFolders.slice(0, folderIndex), ...folders, ...existingFolders.slice(folderIndex)]
      : existingFolders;

  let nextVars = existingVars;
  if (variables.length > 0) {
    if (folders.length > 0) {
      nextVars = [...existingVars, ...variables];
    } else {
      const removedBefore = variables.filter((variable) => {
        const current = findEnvironmentLocation(nodes, variable.id);
        return current?.parentId === parentId && current.index < index;
      }).length;
      let varIndex = Math.max(0, index - existingFolders.length - removedBefore);
      varIndex = Math.max(0, Math.min(varIndex, existingVars.length));
      nextVars = [...existingVars.slice(0, varIndex), ...variables, ...existingVars.slice(varIndex)];
    }
  }

  const nextSiblings = [...nextFolders, ...nextVars];
  if (siblings.length === nextSiblings.length && siblings.every((node, i) => node.id === nextSiblings[i]?.id)) {
    return null;
  }
  return replaceSiblingList(stripped, parentId, nextSiblings);
}

const SEED_ENVIRONMENT_NAMES: Readonly<Record<string, string>> = {
  'env-local': 'Local',
  'env-staging': 'Staging',
  'env-production': 'Production',
  'env-ci': 'CI',
  'env-sandbox': 'Sandbox',
  'env-preview': 'Preview',
};

/**
 * True for an untouched first-run environment (known id and name, no variables).
 * Customized copies of those ids are kept.
 */
export function isUnmodifiedSeedEnvironment(env: Environment): boolean {
  return SEED_ENVIRONMENT_NAMES[env.id] === env.name && env.variables.length === 0;
}

/** New workspaces start with no environments. */
export function createDefaultEnvironments(): EnvironmentList {
  return [];
}

/** Next environment catalog id. */
export function nextEnvironmentId(_ids: readonly string[]): string {
  return newEntityId();
}

export const environmentsFileSchema = z.object({
  schemaVersion: z.number().int().positive(),
  items: environmentListSchema,
  activeId: z.string().nullable(),
  orderIds: z.array(z.string()),
});

export type EnvironmentsFile = z.infer<typeof environmentsFileSchema>;

export function createDefaultEnvironmentsFile(): EnvironmentsFile {
  const items = createDefaultEnvironments();
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    items,
    activeId: null,
    orderIds: items.map((item) => item.id),
  };
}

function readDescription(value: unknown): string {
  if (typeof value !== 'string' || value === 'undefined') {
    return '';
  }
  return value;
}

function parseVariable(raw: unknown, fallbackId: string): EnvironmentVariable | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const source = raw as Record<string, unknown>;
  const parsed = environmentVariableSchema.safeParse({
    kind: 'variable',
    id: typeof source['id'] === 'string' && source['id'] ? source['id'] : fallbackId,
    key: typeof source['key'] === 'string' ? source['key'] : '',
    value: typeof source['value'] === 'string' ? source['value'] : '',
    description: readDescription(source['description']),
    enabled: source['enabled'] !== false,
    secret: source['secret'] === true,
  });
  return parsed.success ? parsed.data : null;
}

function parseNode(raw: unknown, fallbackId: string): EnvironmentNode | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const source = raw as Record<string, unknown>;
  const isFolder =
    source['kind'] === 'folder' ||
    (Array.isArray(source['children']) && source['kind'] !== 'variable');
  if (!isFolder) {
    return parseVariable(raw, fallbackId);
  }
  const id = typeof source['id'] === 'string' && source['id'] ? source['id'] : fallbackId;
  const name = typeof source['name'] === 'string' ? source['name'] : 'Folder';
  const children = Array.isArray(source['children'])
    ? source['children']
        .map((item, index) => parseNode(item, `${id}-${index + 1}`))
        .filter((item): item is EnvironmentNode => item !== null)
    : [];
  return {
    kind: 'folder',
    id,
    name: name.trim() || 'Folder',
    description: readDescription(source['description']),
    collapsed: source['collapsed'] === true,
    children,
  };
}

function parseItem(raw: unknown): Environment | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const source = raw as Record<string, unknown>;
  const id = typeof source['id'] === 'string' ? source['id'] : '';
  const name = typeof source['name'] === 'string' ? source['name'] : '';
  if (!id || !name) {
    return null;
  }

  let variables: EnvironmentNode[] = [];
  if (Array.isArray(source['variables'])) {
    variables = source['variables']
      .map((item, index) => parseNode(item, `${id}-var-${index + 1}`))
      .filter((item): item is EnvironmentNode => item !== null);
  }
  variables = stripLegacySeededVariables(id, variables);

  const parsed = environmentSchema.safeParse({
    id,
    name,
    modifiedAt:
      typeof source['modifiedAt'] === 'string' && source['modifiedAt']
        ? source['modifiedAt']
        : new Date().toISOString(),
    variables,
  });
  return parsed.success ? parsed.data : null;
}

export function parseEnvironmentsFile(raw: unknown): EnvironmentsFile {
  const fallback = createDefaultEnvironmentsFile();
  const source =
    raw && typeof raw !== 'object'
      ? {}
      : raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
  // Missing, invalid, and explicit empty lists stay empty. Untouched first-run shells are dropped.
  const rawItems = source['items'];
  const items: Environment[] = (Array.isArray(rawItems)
    ? rawItems.map(parseItem).filter((item): item is Environment => item !== null)
    : fallback.items
  ).filter((item) => !isUnmodifiedSeedEnvironment(item));
  const rawOrderIds = source['orderIds'];
  const orderIds = Array.isArray(rawOrderIds)
    ? rawOrderIds.filter((id): id is string => typeof id === 'string')
    : items.map((item) => item.id);
  const activeSpecified = Object.prototype.hasOwnProperty.call(source, 'activeId');
  const activeId =
    typeof source['activeId'] === 'string' && items.some((item) => item.id === source['activeId'])
      ? source['activeId']
      : activeSpecified || items.length === 0
        ? null
        : (items[0]?.id ?? null);
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    items,
    activeId,
    orderIds,
  };
}
