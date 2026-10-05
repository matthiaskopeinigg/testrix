import { emptyCollectionKvRow } from './collection-folder';
import { DEFAULT_REQUEST_CONFIG, type CollectionRequestConfig } from './collection-request';
import type { CollectionTree, HttpMethod } from './collection-tree';
import { HTTP_METHODS } from './collection-tree';
import { newCollectionNodeId } from './workspace-pack';

export interface BrunoFileEntry {
  readonly path: string;
  readonly content: string;
}

export interface BrunoImportResult {
  readonly tree: CollectionTree;
  readonly warnings: string[];
  readonly name?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeMethod(raw: string): HttpMethod {
  const upper = raw.toUpperCase();
  return (HTTP_METHODS as readonly string[]).includes(upper) ? (upper as HttpMethod) : 'GET';
}

function readBrunoBlock(content: string, blockName: string): string | null {
  const pattern = new RegExp(`^${blockName}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm');
  const match = content.match(pattern);
  return match ? match[1] : null;
}

function readBrunoField(block: string, field: string): string {
  const pattern = new RegExp(`^\\s*${field}:\\s*(.+)$`, 'm');
  const match = block.match(pattern);
  if (!match)
    return '';
  return match[1].trim().replace(/^['"]|['"]$/g, '');
}

function parseBruRequest(content: string, fallbackName: string): CollectionTree[number] | null {
  const metaBlock = readBrunoBlock(content, 'meta');
  const name = metaBlock ? readBrunoField(metaBlock, 'name') || fallbackName : fallbackName;
  const methodBlock =
    readBrunoBlock(content, 'get') ||
    readBrunoBlock(content, 'post') ||
    readBrunoBlock(content, 'put') ||
    readBrunoBlock(content, 'patch') ||
    readBrunoBlock(content, 'delete') ||
    readBrunoBlock(content, 'head') ||
    readBrunoBlock(content, 'options');
  if (!methodBlock)
    return null;
  const methodMatch = content.match(/^(get|post|put|patch|delete|head|options)\s*\{/im);
  const method = methodMatch ? normalizeMethod(methodMatch[1]) : 'GET';
  const url = readBrunoField(methodBlock, 'url');
  const headersBlock = readBrunoBlock(content, 'headers');
  const headers: CollectionRequestConfig['headers'] = [];
  if (headersBlock) {
    for (const line of headersBlock.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//'))
        continue;
      const colon = trimmed.indexOf(':');
      if (colon <= 0)
        continue;
      headers.push({
        ...emptyCollectionKvRow('hdr'),
        key: trimmed.slice(0, colon).trim(),
        value: trimmed.slice(colon + 1).trim(),
      });
    }
  }
  const bodyBlock =
    readBrunoBlock(content, 'body') ||
    readBrunoBlock(content, 'body:json') ||
    readBrunoBlock(content, 'body:text');
  let config: CollectionRequestConfig = {
    ...DEFAULT_REQUEST_CONFIG,
    url,
    headers,
  };
  if (bodyBlock) {
    const bodyMode = readBrunoField(bodyBlock, 'type').toLowerCase();
    const text = bodyBlock.includes('{{') ? bodyBlock : readBrunoField(bodyBlock, 'content') || bodyBlock.trim();
    if (bodyMode === 'json' || bodyBlock.startsWith('{'))
      config = { ...config, body: { ...DEFAULT_REQUEST_CONFIG.body, mode: 'json', text } };
    else
      config = { ...config, body: { ...DEFAULT_REQUEST_CONFIG.body, mode: 'text', text } };
  }
  const authBlock = readBrunoBlock(content, 'auth');
  if (authBlock) {
    const authType = readBrunoField(authBlock, 'type').toLowerCase();
    if (authType === 'bearer') {
      config = {
        ...config,
        authMode: 'bearer',
        auth: {
          ...DEFAULT_REQUEST_CONFIG.auth,
          type: 'bearer',
          token: readBrunoField(authBlock, 'token'),
        },
      };
    } else if (authType === 'basic') {
      config = {
        ...config,
        authMode: 'basic',
        auth: {
          ...DEFAULT_REQUEST_CONFIG.auth,
          type: 'basic',
          username: readBrunoField(authBlock, 'username'),
          password: readBrunoField(authBlock, 'password'),
        },
      };
    }
  }
  return {
    kind: 'http',
    id: newCollectionNodeId('http'),
    name,
    modifiedAt: nowIso(),
    method,
    status: null,
    config,
  };
}

interface BrunoFolderBuilder {
  readonly folders: Map<string, BrunoFolderBuilder>;
  readonly requests: CollectionTree;
}

function folderBuilderAt(root: BrunoFolderBuilder, segments: string[]): BrunoFolderBuilder {
  let current = root;
  for (const segment of segments) {
    let next = current.folders.get(segment);
    if (!next) {
      next = { folders: new Map(), requests: [] };
      current.folders.set(segment, next);
    }
    current = next;
  }
  return current;
}

function builderToTree(builder: BrunoFolderBuilder): CollectionTree {
  const tree: CollectionTree = [...builder.requests];
  for (const [name, child] of [...builder.folders.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    tree.push({
      kind: 'folder',
      id: newCollectionNodeId('folder'),
      name,
      modifiedAt: nowIso(),
      children: builderToTree(child),
    });
  }
  return tree;
}

function parseBrunoCollectionJson(raw: Record<string, unknown>, warnings: string[]): CollectionTree {
  const items = Array.isArray(raw['items']) ? raw['items'] : [];
  const tree: CollectionTree = [];
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      continue;
    const source = item as Record<string, unknown>;
    if (Array.isArray(source['items'])) {
      tree.push({
        kind: 'folder',
        id: newCollectionNodeId('folder'),
        name: typeof source['name'] === 'string' ? source['name'] : 'Folder',
        modifiedAt: nowIso(),
        children: parseBrunoCollectionJson({ items: source['items'] }, warnings),
      });
      continue;
    }
    warnings.push('Bruno JSON item shape is not fully supported; prefer .bru files.');
  }
  return tree;
}

/**
 * Converts Bruno collection.json and/or .bru request files into a Testrix collection tree.
 */
export function convertBrunoCollection(input: BrunoFileEntry[] | string): BrunoImportResult {
  const warnings: string[] = [];
  const files: BrunoFileEntry[] =
    typeof input === 'string' ? [{ path: 'collection.bru', content: input }] : input;
  let collectionName: string | undefined;
  const root: BrunoFolderBuilder = { folders: new Map(), requests: [] };

  for (const file of files) {
    const normalizedPath = file.path.replace(/\\/g, '/');
    const base = normalizedPath.split('/').pop() ?? normalizedPath;
    if (base === 'collection.json' || base.endsWith('bruno.json')) {
      try {
        const parsed = JSON.parse(file.content) as Record<string, unknown>;
        if (typeof parsed['name'] === 'string')
          collectionName = parsed['name'];
        const fromJson = parseBrunoCollectionJson(parsed, warnings);
        root.requests.push(...fromJson);
      } catch {
        warnings.push(`Could not parse Bruno JSON file "${normalizedPath}".`);
      }
      continue;
    }
    if (!base.endsWith('.bru'))
      continue;
    const segments = normalizedPath.split('/').slice(0, -1).filter(Boolean);
    const node = parseBruRequest(file.content, base.replace(/\.bru$/i, ''));
    if (!node) {
      warnings.push(`Skipped unparseable Bruno file "${normalizedPath}".`);
      continue;
    }
    folderBuilderAt(root, segments).requests.push(node);
  }

  const tree = builderToTree(root);
  if (tree.length === 0)
    warnings.push('No Bruno requests were imported.');
  return { tree, warnings, name: collectionName };
}
