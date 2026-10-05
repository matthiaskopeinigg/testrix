import type { CollectionFolderAuth, CollectionKvRow } from './collection-folder';
import type { CollectionNode, CollectionTree } from './collection-tree';
import type { CollectionsFile } from './config-files';
import type { CookiesFile } from './cookies-file';
import {
  flattenDatabaseConnections,
  isDatabaseConnectionFolder,
  type DatabaseConnectionTreeItem,
  type DatabasesFile,
} from './database';
import {
  flattenEnvironmentNodes,
  isEnvironmentVariable,
  type EnvironmentsFile,
} from './environment';
import { isSecretHeaderName } from './history';
import type { PackCategory, WorkspacePackPayload, WorkspacePackSelection } from './workspace-pack';
import { PACK_CATEGORY_FILES } from './workspace-pack';

const AUTH_SECRET_FIELDS = [
  'token',
  'password',
  'apiKey',
  'clientSecret',
  'accessToken',
  'refreshToken',
] as const;

export type PackSecretKind =
  | 'environment-secret'
  | 'auth-credential'
  | 'secret-header'
  | 'cookie'
  | 'database-password';

export interface PackSecretFinding {
  readonly category: PackCategory;
  readonly kind: PackSecretKind;
  readonly label: string;
}

export interface PackSecretGroup {
  readonly category: PackCategory;
  readonly categoryLabel: string;
  readonly count: number;
  readonly samples: readonly string[];
}

export interface PackSecretReport {
  readonly findings: readonly PackSecretFinding[];
  readonly total: number;
  readonly groups: readonly PackSecretGroup[];
}

const KIND_LABEL: Record<PackSecretKind, string> = {
  'environment-secret': 'secret variable',
  'auth-credential': 'auth credential',
  'secret-header': 'secret header',
  cookie: 'cookie value',
  'database-password': 'database password',
};

const CATEGORY_LABEL: Partial<Record<PackCategory, string>> = {
  environments: 'Environments',
  collections: 'Collections',
  cookies: 'Cookies',
  database: 'Database',
};

/**
 * Scans selected pack categories for values that should not leave the machine casually.
 */
export function analyzePackExportSecrets(input: {
  readonly selection: WorkspacePackSelection;
  readonly environments?: EnvironmentsFile | null;
  readonly collections?: CollectionsFile | null;
  readonly cookies?: CookiesFile | null;
  readonly databases?: DatabasesFile | null;
}): PackSecretReport {
  const categories = new Set(input.selection.categories);
  const findings: PackSecretFinding[] = [];

  if (categories.has('environments') && input.environments) {
    const ids =
      input.selection.environmentIds === undefined
        ? null
        : new Set(input.selection.environmentIds);
    findings.push(...scanEnvironments(input.environments, ids));
  }

  if (categories.has('collections') && input.collections) {
    const ids =
      input.selection.collectionIds === undefined
        ? null
        : new Set(input.selection.collectionIds);
    findings.push(...scanCollections(input.collections.collections ?? [], ids));
  }

  if (categories.has('cookies') && input.cookies)
    findings.push(...scanCookies(input.cookies));

  if (categories.has('database') && input.databases) {
    const ids =
      input.selection.databaseIds === undefined ? null : new Set(input.selection.databaseIds);
    findings.push(...scanDatabases(input.databases, ids));
  }

  return {
    findings,
    total: findings.length,
    groups: groupFindings(findings),
  };
}

/**
 * Clears secret values in a built pack payload (export-time only; disk files unchanged).
 */
export function stripPackSecrets(payload: WorkspacePackPayload): WorkspacePackPayload {
  const next: WorkspacePackPayload = { ...payload };

  const environmentsRaw = next[PACK_CATEGORY_FILES.environments];
  if (environmentsRaw && typeof environmentsRaw === 'object' && !Array.isArray(environmentsRaw)) {
    const file = environmentsRaw as EnvironmentsFile;
    next[PACK_CATEGORY_FILES.environments] = {
      ...file,
      items: file.items.map((env) => ({
        ...env,
        variables: stripEnvironmentNodes(env.variables),
      })),
    };
  }

  const collectionsRaw = next[PACK_CATEGORY_FILES.collections];
  if (collectionsRaw && typeof collectionsRaw === 'object' && !Array.isArray(collectionsRaw)) {
    const file = collectionsRaw as CollectionsFile;
    next[PACK_CATEGORY_FILES.collections] = {
      ...file,
      collections: stripCollectionTree(file.collections ?? []),
    };
  }

  const cookiesRaw = next[PACK_CATEGORY_FILES.cookies];
  if (cookiesRaw && typeof cookiesRaw === 'object' && !Array.isArray(cookiesRaw)) {
    const file = cookiesRaw as CookiesFile;
    next[PACK_CATEGORY_FILES.cookies] = {
      ...file,
      cookies: (file.cookies ?? []).map((cookie) => ({ ...cookie, value: '' })),
    };
  }

  const databasesRaw = next[PACK_CATEGORY_FILES.database];
  if (databasesRaw && typeof databasesRaw === 'object' && !Array.isArray(databasesRaw)) {
    const file = databasesRaw as DatabasesFile;
    next[PACK_CATEGORY_FILES.database] = {
      ...file,
      nodes: stripDatabaseNodes(file.nodes),
    };
  }

  return next;
}

/**
 * Human-readable line for one secret group (Postman-style export warning).
 */
export function formatPackSecretGroup(group: PackSecretGroup): string {
  const noun = group.count === 1 ? 'item' : 'items';
  const sample =
    group.samples.length === 0
      ? ''
      : group.samples.length === 1
        ? `: ${group.samples[0]}`
        : `: ${group.samples.slice(0, 2).join(', ')}${group.samples.length > 2 ? '…' : ''}`;
  return `${group.categoryLabel} — ${group.count} sensitive ${noun}${sample}`;
}

function groupFindings(findings: readonly PackSecretFinding[]): PackSecretGroup[] {
  const byCategory = new Map<PackCategory, PackSecretFinding[]>();
  for (const finding of findings) {
    const list = byCategory.get(finding.category) ?? [];
    list.push(finding);
    byCategory.set(finding.category, list);
  }
  const order: PackCategory[] = ['environments', 'collections', 'cookies', 'database'];
  const groups: PackSecretGroup[] = [];
  for (const category of order) {
    const list = byCategory.get(category);
    if (!list || list.length === 0)
      continue;
    groups.push({
      category,
      categoryLabel: CATEGORY_LABEL[category] ?? category,
      count: list.length,
      samples: list.slice(0, 3).map((item) => item.label),
    });
  }
  return groups;
}

function scanEnvironments(
  file: EnvironmentsFile,
  selectedIds: ReadonlySet<string> | null,
): PackSecretFinding[] {
  const out: PackSecretFinding[] = [];
  for (const env of file.items) {
    if (selectedIds && !selectedIds.has(env.id))
      continue;
    for (const node of flattenEnvironmentNodes(env.variables)) {
      if (!isEnvironmentVariable(node) || !node.secret)
        continue;
      if (!node.value.trim())
        continue;
      const key = node.key.trim() || 'unnamed';
      out.push({
        category: 'environments',
        kind: 'environment-secret',
        label: `${key} in ${env.name}`,
      });
    }
  }
  return out;
}

function scanCookies(file: CookiesFile): PackSecretFinding[] {
  return (file.cookies ?? [])
    .filter((cookie) => cookie.value.trim().length > 0)
    .map((cookie) => ({
      category: 'cookies' as const,
      kind: 'cookie' as const,
      label: cookie.name.trim() || 'unnamed cookie',
    }));
}

function scanDatabases(
  file: DatabasesFile,
  selectedIds: ReadonlySet<string> | null,
): PackSecretFinding[] {
  return flattenDatabaseConnections(file.nodes)
    .filter((item) => !selectedIds || selectedIds.has(item.id))
    .filter((item) => (item.password?.trim() ?? '').length > 0)
    .map((item) => ({
      category: 'database' as const,
      kind: 'database-password' as const,
      label: item.name.trim() || 'connection',
    }));
}

function scanCollections(
  tree: CollectionTree,
  selectedIds: ReadonlySet<string> | null,
): PackSecretFinding[] {
  const out: PackSecretFinding[] = [];
  const walk = (nodes: readonly CollectionNode[]): void => {
    for (const node of nodes) {
      if (selectedIds && !nodeOrDescendantSelected(node, selectedIds))
        continue;
      if (node.kind === 'folder') {
        pushAuthFindings(out, node.name, node.config?.auth);
        pushHeaderFindings(out, node.name, node.config?.headers);
        for (const cookie of node.config?.settings?.cookies ?? []) {
          if (!cookie.value.trim())
            continue;
          out.push({
            category: 'collections',
            kind: 'cookie',
            label: `${cookie.name.trim() || 'cookie'} on ${node.name}`,
          });
        }
        walk(node.children);
        continue;
      }
      if (node.kind === 'http') {
        pushAuthFindings(out, node.name, node.config?.auth);
        pushHeaderFindings(out, node.name, node.config?.headers);
        continue;
      }
      pushAuthFindings(out, node.name, node.config?.auth);
      pushHeaderFindings(out, node.name, node.config?.headers);
    }
  };
  walk(tree);
  return out;
}

function pushAuthFindings(
  into: PackSecretFinding[],
  owner: string,
  auth: CollectionFolderAuth | undefined,
): void {
  if (!auth || auth.type === 'none')
    return;
  for (const field of AUTH_SECRET_FIELDS) {
    const value = auth[field]?.trim() ?? '';
    if (!value)
      continue;
    into.push({
      category: 'collections',
      kind: 'auth-credential',
      label: `${auth.type} ${field} on ${owner}`,
    });
  }
}

function pushHeaderFindings(
  into: PackSecretFinding[],
  owner: string,
  headers: readonly CollectionKvRow[] | undefined,
): void {
  for (const header of headers ?? []) {
    if (!header.enabled || !header.value.trim())
      continue;
    if (!isSecretHeaderName(header.key))
      continue;
    into.push({
      category: 'collections',
      kind: 'secret-header',
      label: `${header.key.trim() || 'header'} on ${owner}`,
    });
  }
}

function nodeOrDescendantSelected(
  node: CollectionNode,
  selectedIds: ReadonlySet<string>,
): boolean {
  if (selectedIds.has(node.id))
    return true;
  if (node.kind !== 'folder')
    return false;
  return node.children.some((child) => nodeOrDescendantSelected(child, selectedIds));
}

function stripEnvironmentNodes(
  nodes: EnvironmentsFile['items'][number]['variables'],
): EnvironmentsFile['items'][number]['variables'] {
  return nodes.map((node) => {
    if (isEnvironmentVariable(node)) {
      if (!node.secret)
        return node;
      return { ...node, value: '' };
    }
    return { ...node, children: stripEnvironmentNodes(node.children) };
  });
}

function stripCollectionTree(tree: CollectionTree): CollectionTree {
  return tree.map((node) => {
    if (node.kind === 'folder') {
      return {
        ...node,
        config: node.config
          ? {
              ...node.config,
              auth: stripAuth(node.config.auth),
              headers: stripHeaders(node.config.headers),
              settings: {
                ...node.config.settings,
                cookies: (node.config.settings.cookies ?? []).map((cookie) => ({
                  ...cookie,
                  value: '',
                })),
              },
            }
          : node.config,
        children: stripCollectionTree(node.children),
      };
    }
    if (node.kind === 'http') {
      return {
        ...node,
        config: node.config
          ? {
              ...node.config,
              auth: stripAuth(node.config.auth),
              headers: stripHeaders(node.config.headers),
            }
          : node.config,
      };
    }
    return {
      ...node,
      config: node.config
        ? {
            ...node.config,
            auth: stripAuth(node.config.auth),
            headers: stripHeaders(node.config.headers),
          }
        : node.config,
    };
  });
}

function stripAuth(auth: CollectionFolderAuth): CollectionFolderAuth {
  return {
    ...auth,
    token: '',
    password: '',
    apiKey: '',
    clientSecret: '',
    accessToken: '',
    refreshToken: '',
  };
}

function stripHeaders(headers: readonly CollectionKvRow[]): CollectionKvRow[] {
  return headers.map((header) =>
    isSecretHeaderName(header.key) ? { ...header, value: '' } : header,
  );
}

function stripDatabaseNodes(
  nodes: readonly DatabaseConnectionTreeItem[],
): DatabaseConnectionTreeItem[] {
  return nodes.map((node) => {
    if (isDatabaseConnectionFolder(node))
      return { ...node, children: stripDatabaseNodes(node.children) };
    return { ...node, password: '' };
  });
}

/** @internal Exported for tests — kind labels used in docs. */
export function packSecretKindLabel(kind: PackSecretKind): string {
  return KIND_LABEL[kind];
}
