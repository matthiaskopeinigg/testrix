import { emptyCollectionKvRow } from './collection-folder';
import {
  DEFAULT_REQUEST_CONFIG,
  type CollectionRequestConfig,
  type RequestBody,
  type RequestFormRow,
} from './collection-request';
import type { CollectionTree, HttpMethod } from './collection-tree';
import { HTTP_METHODS } from './collection-tree';
import { newCollectionNodeId } from './workspace-pack';

export interface PostmanImportResult {
  readonly tree: CollectionTree;
  readonly warnings: string[];
  readonly name?: string;
}

export interface PostmanEnvironmentImportResult {
  readonly environment: {
    readonly name: string;
    readonly variables: readonly {
      readonly key: string;
      readonly value: string;
      readonly enabled: boolean;
      readonly secret: boolean;
    }[];
  };
  readonly warnings: string[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function kvRow(key: string, value: string, enabled = true): ReturnType<typeof emptyCollectionKvRow> {
  return { ...emptyCollectionKvRow('imp'), key, value, enabled };
}

function normalizeMethod(raw: unknown): HttpMethod {
  const upper = typeof raw === 'string' ? raw.toUpperCase() : 'GET';
  return (HTTP_METHODS as readonly string[]).includes(upper) ? (upper as HttpMethod) : 'GET';
}

function readPostmanUrl(raw: unknown): string {
  if (typeof raw === 'string')
    return raw;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const source = raw as Record<string, unknown>;
    if (typeof source['raw'] === 'string')
      return source['raw'];
    const host = source['host'];
    const path = source['path'];
    if (Array.isArray(host) && Array.isArray(path))
      return `/${path.map(String).join('/')}`;
  }
  return '';
}

function mapPostmanAuth(
  auth: unknown,
  warnings: string[],
): Pick<CollectionRequestConfig, 'authMode' | 'auth'> {
  if (!auth || typeof auth !== 'object' || Array.isArray(auth))
    return { authMode: 'inherit', auth: DEFAULT_REQUEST_CONFIG.auth };
  const source = auth as Record<string, unknown>;
  const type = typeof source['type'] === 'string' ? source['type'].toLowerCase() : '';
  if (type === 'bearer') {
    const token = readAuthParam(source, 'token');
    return {
      authMode: 'bearer',
      auth: { ...DEFAULT_REQUEST_CONFIG.auth, type: 'bearer', token },
    };
  }
  if (type === 'basic') {
    return {
      authMode: 'basic',
      auth: {
        ...DEFAULT_REQUEST_CONFIG.auth,
        type: 'basic',
        username: readAuthParam(source, 'username'),
        password: readAuthParam(source, 'password'),
      },
    };
  }
  if (type === 'apikey' || type === 'apiKey') {
    return {
      authMode: 'apikey',
      auth: {
        ...DEFAULT_REQUEST_CONFIG.auth,
        type: 'apikey',
        apiKey: readAuthParam(source, 'value') || readAuthParam(source, 'key'),
        apiKeyHeader: readAuthParam(source, 'key') || 'X-Api-Key',
        apiKeyIn: readAuthParam(source, 'in') === 'query' ? 'query' : 'header',
      },
    };
  }
  if (type && type !== 'noauth')
    warnings.push(`Unsupported Postman auth type "${type}" on a request; auth was not imported.`);
  return { authMode: 'inherit', auth: DEFAULT_REQUEST_CONFIG.auth };
}

function readAuthParam(auth: Record<string, unknown>, key: string): string {
  const list = auth[key];
  if (Array.isArray(list)) {
    for (const entry of list) {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        const row = entry as Record<string, unknown>;
        if (typeof row['value'] === 'string')
          return row['value'];
      }
    }
  }
  if (list && typeof list === 'object' && !Array.isArray(list)) {
    const row = list as Record<string, unknown>;
    if (typeof row['token'] === 'string')
      return row['token'];
  }
  return '';
}

function mapPostmanBody(body: unknown, warnings: string[]): RequestBody {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return DEFAULT_REQUEST_CONFIG.body;
  const source = body as Record<string, unknown>;
  const mode = typeof source['mode'] === 'string' ? source['mode'] : 'raw';
  if (mode === 'raw') {
    const text = typeof source['raw'] === 'string' ? source['raw'] : '';
    const options =
      source['options'] && typeof source['options'] === 'object'
        ? (source['options'] as Record<string, unknown>)
        : {};
    const rawOptions =
      options['raw'] && typeof options['raw'] === 'object'
        ? (options['raw'] as Record<string, unknown>)
        : {};
    const language =
      typeof rawOptions['language'] === 'string' ? rawOptions['language'].toLowerCase() : '';
    let bodyMode: RequestBody['mode'] = 'text';
    if (language === 'json')
      bodyMode = 'json';
    else if (language === 'html')
      bodyMode = 'html';
    else if (language === 'xml')
      bodyMode = 'xml';
    return { ...DEFAULT_REQUEST_CONFIG.body, mode: bodyMode, text };
  }
  if (mode === 'urlencoded') {
    const rows = readKeyValueRows(source['urlencoded']);
    return { ...DEFAULT_REQUEST_CONFIG.body, mode: 'urlencoded', formRows: rows };
  }
  if (mode === 'formdata') {
    const rows = readFormDataRows(source['formdata']);
    return { ...DEFAULT_REQUEST_CONFIG.body, mode: 'form-data', formRows: rows };
  }
  if (mode === 'graphql') {
    const query = typeof source['graphql'] === 'string' ? source['graphql'] : '';
    const gql =
      source['graphql'] && typeof source['graphql'] === 'object'
        ? (source['graphql'] as Record<string, unknown>)
        : {};
    return {
      ...DEFAULT_REQUEST_CONFIG.body,
      mode: 'graphql',
      graphql: {
        query: typeof gql['query'] === 'string' ? gql['query'] : query,
        variables:
          typeof gql['variables'] === 'string'
            ? gql['variables']
            : DEFAULT_REQUEST_CONFIG.body.graphql.variables,
        operationName:
          typeof gql['operationName'] === 'string'
            ? gql['operationName']
            : DEFAULT_REQUEST_CONFIG.body.graphql.operationName,
      },
    };
  }
  if (mode !== 'file')
    warnings.push(`Unsupported Postman body mode "${mode}"; body was cleared.`);
  return DEFAULT_REQUEST_CONFIG.body;
}

function readKeyValueRows(raw: unknown): RequestFormRow[] {
  if (!Array.isArray(raw))
    return [];
  const rows: RequestFormRow[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      continue;
    const source = entry as Record<string, unknown>;
    rows.push({
      ...emptyCollectionKvRow('form'),
      kind: 'text',
      key: typeof source['key'] === 'string' ? source['key'] : '',
      value: typeof source['value'] === 'string' ? source['value'] : '',
      enabled: source['disabled'] !== true,
      fileName: '',
      contentType: '',
    });
  }
  return rows;
}

function readFormDataRows(raw: unknown): RequestFormRow[] {
  if (!Array.isArray(raw))
    return [];
  const rows: RequestFormRow[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      continue;
    const source = entry as Record<string, unknown>;
    const type = typeof source['type'] === 'string' ? source['type'] : 'text';
    rows.push({
      ...emptyCollectionKvRow('form'),
      kind: type === 'file' ? 'file' : 'text',
      key: typeof source['key'] === 'string' ? source['key'] : '',
      value: typeof source['value'] === 'string' ? source['value'] : '',
      fileName: typeof source['src'] === 'string' ? source['src'] : '',
      contentType: '',
      enabled: source['disabled'] !== true,
    });
  }
  return rows;
}

function mapPostmanHeaders(raw: unknown): CollectionRequestConfig['headers'] {
  if (!Array.isArray(raw))
    return [];
  const rows: CollectionRequestConfig['headers'] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      continue;
    const source = entry as Record<string, unknown>;
    if (source['disabled'] === true)
      continue;
    rows.push(
      kvRow(
        typeof source['key'] === 'string' ? source['key'] : '',
        typeof source['value'] === 'string' ? source['value'] : '',
      ),
    );
  }
  return rows;
}

function convertPostmanItems(items: unknown, warnings: string[]): CollectionTree {
  if (!Array.isArray(items))
    return [];
  const tree: CollectionTree = [];
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      continue;
    const source = item as Record<string, unknown>;
    if (Array.isArray(source['item'])) {
      tree.push({
        kind: 'folder',
        id: newCollectionNodeId('folder'),
        name: typeof source['name'] === 'string' && source['name'] ? source['name'] : 'Folder',
        modifiedAt: nowIso(),
        children: convertPostmanItems(source['item'], warnings),
      });
      continue;
    }
    const request = source['request'];
    if (!request || typeof request !== 'object' || Array.isArray(request))
      continue;
    const req = request as Record<string, unknown>;
    if (source['event'])
      warnings.push(`Postman scripts on "${String(source['name'] ?? 'request')}" were not imported.`);
    const authBits = mapPostmanAuth(req['auth'] ?? source['auth'], warnings);
    const config: CollectionRequestConfig = {
      ...DEFAULT_REQUEST_CONFIG,
      url: readPostmanUrl(req['url']),
      headers: mapPostmanHeaders(req['header']),
      body: mapPostmanBody(req['body'], warnings),
      ...authBits,
      description: typeof source['description'] === 'string' ? source['description'] : '',
    };
    tree.push({
      kind: 'http',
      id: newCollectionNodeId('http'),
      name: typeof source['name'] === 'string' && source['name'] ? source['name'] : 'Request',
      modifiedAt: nowIso(),
      method: normalizeMethod(req['method']),
      status: null,
      config,
    });
  }
  return tree;
}

/**
 * Converts a Postman Collection v2.1 document into a Testrix collection tree.
 */
export function convertPostmanCollectionV21(raw: unknown): PostmanImportResult {
  const warnings: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { tree: [], warnings: ['Input is not a Postman collection object.'] };
  }
  const source = raw as Record<string, unknown>;
  const info =
    source['info'] && typeof source['info'] === 'object' && !Array.isArray(source['info'])
      ? (source['info'] as Record<string, unknown>)
      : {};
  const name = typeof info['name'] === 'string' ? info['name'] : undefined;
  const tree = convertPostmanItems(source['item'], warnings);
  return { tree, warnings, name };
}

/**
 * Converts a Postman Environment export into a flat variable list.
 */
export function convertPostmanEnvironment(raw: unknown): PostmanEnvironmentImportResult {
  const warnings: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      environment: { name: 'Imported environment', variables: [] },
      warnings: ['Input is not a Postman environment object.'],
    };
  }
  const source = raw as Record<string, unknown>;
  const name =
    typeof source['name'] === 'string' && source['name'] ? source['name'] : 'Imported environment';
  const values = Array.isArray(source['values']) ? source['values'] : [];
  const variables: Array<{
    key: string;
    value: string;
    enabled: boolean;
    secret: boolean;
  }> = [];
  for (const entry of values) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      continue;
    const row = entry as Record<string, unknown>;
    variables.push({
      key: typeof row['key'] === 'string' ? row['key'] : '',
      value: typeof row['value'] === 'string' ? row['value'] : '',
      enabled: row['enabled'] !== false,
      secret: row['type'] === 'secret',
    });
  }
  if (variables.length === 0)
    warnings.push('No environment variables found in Postman export.');
  return { environment: { name, variables }, warnings };
}
