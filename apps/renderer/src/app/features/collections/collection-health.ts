import {
  ancestorFolderConfigs,
  ensureRequestUrlScheme,
  findNodePath,
  interpolateTemplate,
  resolveVariableTemplates,
  mergeFolderConfigs,
  requestConfigOf,
  variableMapFromRows,
  websocketConfigOf,
  type CollectionNode,
  type CollectionTree,
} from '@testrix/contracts';

export type CollectionHealthCode =
  | 'empty-url'
  | 'bad-url'
  | 'bad-ws-scheme'
  | 'unresolved-var';

export type CollectionHealthSeverity = 'error' | 'warning';

export interface CollectionHealthIssue {
  readonly nodeId: string;
  readonly nodeName: string;
  readonly kind: 'http' | 'websocket';
  readonly code: CollectionHealthCode;
  readonly severity: CollectionHealthSeverity;
  readonly message: string;
  readonly detail?: string;
}

const MUSTACHE_VAR_RE = /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g;

function unresolvedAfterInterpolate(text: string, vars: Readonly<Record<string, string>>): string[] {
  const resolved = interpolateTemplate(text, vars);
  const missing: string[] = [];
  for (const match of resolved.matchAll(MUSTACHE_VAR_RE)) {
    const name = match[1]?.trim();
    if (name && !missing.includes(name))
      missing.push(name);
  }
  return missing;
}

function walkLeaves(
  nodes: readonly CollectionNode[],
  visit: (node: Extract<CollectionNode, { kind: 'http' | 'websocket' }>) => void,
): void {
  for (const node of nodes) {
    if (node.kind === 'folder') {
      walkLeaves(node.children, visit);
      continue;
    }
    if (node.kind === 'http' || node.kind === 'websocket')
      visit(node);
  }
}

function subtreeAt(tree: CollectionTree, folderId: string | null): CollectionTree {
  if (!folderId)
    return tree;
  const path = findNodePath(tree, folderId);
  const folder = path?.at(-1);
  if (!folder || folder.kind !== 'folder')
    return tree;
  return folder.children;
}

function isUrlParseable(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed)
    return false;
  if (/\{\{\s*[A-Za-z0-9_.-]+\s*\}\}/.test(trimmed))
    return true;
  const withScheme = ensureRequestUrlScheme(trimmed);
  try {
     
    new URL(withScheme);
    return true;
  } catch {
    return false;
  }
}

/**
 * Offline health scan for collection HTTP/WebSocket leaves against an env var map.
 * Does not perform network I/O.
 */
export function scanCollectionHealth(input: {
  readonly tree: CollectionTree;
  readonly envVars: Readonly<Record<string, string>>;
  readonly folderId?: string | null;
}): readonly CollectionHealthIssue[] {
  const issues: CollectionHealthIssue[] = [];
  const scope = subtreeAt(input.tree, input.folderId ?? null);

  walkLeaves(scope, (node) => {
    const folders = ancestorFolderConfigs(input.tree, node.id);
    const merged = mergeFolderConfigs(folders);
    const vars = resolveVariableTemplates({
      ...input.envVars,
      ...variableMapFromRows(merged.variables),
    });

    if (node.kind === 'http') {
      const config = requestConfigOf(node);
      const url = config.url.trim();
      if (!url) {
        issues.push({
          nodeId: node.id,
          nodeName: node.name,
          kind: 'http',
          code: 'empty-url',
          severity: 'error',
          message: 'URL is empty',
        });
      } else {
        const missingUrl = unresolvedAfterInterpolate(url, vars);
        if (missingUrl.length > 0) {
          issues.push({
            nodeId: node.id,
            nodeName: node.name,
            kind: 'http',
            code: 'unresolved-var',
            severity: 'error',
            message: `Unresolved variable in URL: ${missingUrl.join(', ')}`,
            detail: missingUrl.join(', '),
          });
        } else {
          const resolvedUrl = interpolateTemplate(url, vars);
          if (!isUrlParseable(resolvedUrl)) {
            issues.push({
              nodeId: node.id,
              nodeName: node.name,
              kind: 'http',
              code: 'bad-url',
              severity: 'error',
              message: 'URL is not a valid absolute URL after resolving variables',
              detail: resolvedUrl,
            });
          }
        }
      }

      const texts: string[] = [];
      for (const row of config.headers) {
        if (!row.enabled)
          continue;
        texts.push(row.key, row.value);
      }
      for (const row of config.queryParams) {
        if (!row.enabled)
          continue;
        texts.push(row.key, row.value);
      }
      for (const row of config.pathParams) {
        if (!row.enabled)
          continue;
        texts.push(row.key, row.value);
      }
      texts.push(config.body.text, config.body.graphql.query, config.body.graphql.variables);
      for (const row of config.body.formRows)
        texts.push(row.value);
      texts.push(
        config.auth.token,
        config.auth.username,
        config.auth.password,
        config.auth.apiKey,
        config.auth.apiKeyHeader,
      );

      const missingFields = new Set<string>();
      for (const text of texts) {
        for (const name of unresolvedAfterInterpolate(text, vars))
          missingFields.add(name);
      }
      if (missingFields.size > 0) {
        issues.push({
          nodeId: node.id,
          nodeName: node.name,
          kind: 'http',
          code: 'unresolved-var',
          severity: 'warning',
          message: `Unresolved variables: ${[...missingFields].join(', ')}`,
          detail: [...missingFields].join(', '),
        });
      }
      return;
    }

    const config = websocketConfigOf(node);
    const url = config.url.trim();
    if (!url) {
      issues.push({
        nodeId: node.id,
        nodeName: node.name,
        kind: 'websocket',
        code: 'empty-url',
        severity: 'error',
        message: 'URL is empty',
      });
      return;
    }
    const missingUrl = unresolvedAfterInterpolate(url, vars);
    if (missingUrl.length > 0) {
      issues.push({
        nodeId: node.id,
        nodeName: node.name,
        kind: 'websocket',
        code: 'unresolved-var',
        severity: 'error',
        message: `Unresolved variable in URL: ${missingUrl.join(', ')}`,
        detail: missingUrl.join(', '),
      });
      return;
    }
    const resolvedUrl = interpolateTemplate(url, vars).trim();
    const lower = resolvedUrl.toLowerCase();
    if (!lower.startsWith('ws://') && !lower.startsWith('wss://')) {
      issues.push({
        nodeId: node.id,
        nodeName: node.name,
        kind: 'websocket',
        code: 'bad-ws-scheme',
        severity: 'error',
        message: 'WebSocket URL must use ws:// or wss:// after resolving variables',
        detail: resolvedUrl,
      });
    }
  });

  return issues;
}
