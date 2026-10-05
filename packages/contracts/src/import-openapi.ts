import { emptyCollectionKvRow } from './collection-folder';
import { DEFAULT_REQUEST_CONFIG, type CollectionRequestConfig } from './collection-request';
import type { CollectionNode, CollectionTree, HttpMethod } from './collection-tree';
import { HTTP_METHODS } from './collection-tree';
import { newCollectionNodeId } from './workspace-pack';

export interface OpenApiImportResult {
  readonly tree: CollectionTree;
  readonly environment?: {
    readonly name: string;
    readonly variables: readonly { readonly key: string; readonly value: string; readonly enabled: boolean; readonly secret: boolean }[];
  };
  readonly warnings: string[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeMethod(raw: string): HttpMethod {
  const upper = raw.toUpperCase();
  return (HTTP_METHODS as readonly string[]).includes(upper) ? (upper as HttpMethod) : 'GET';
}

function resolveRef(doc: Record<string, unknown>, ref: string): unknown {
  if (!ref.startsWith('#/'))
    return undefined;
  const parts = ref.slice(2).split('/');
  let current: unknown = doc;
  for (const part of parts) {
    if (!current || typeof current !== 'object' || Array.isArray(current))
      return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function schemaExample(schema: unknown, doc: Record<string, unknown>): string {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema))
    return '';
  const source = schema as Record<string, unknown>;
  if (source['example'] !== undefined)
    return JSON.stringify(source['example'], null, 2);
  if (typeof source['$ref'] === 'string') {
    const resolved = resolveRef(doc, source['$ref']);
    return schemaExample(resolved, doc);
  }
  if (source['type'] === 'object') {
    const props =
      source['properties'] && typeof source['properties'] === 'object'
        ? (source['properties'] as Record<string, unknown>)
        : {};
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(props))
      out[key] = exampleValue(value, doc);
    return JSON.stringify(out, null, 2);
  }
  return '';
}

function exampleValue(schema: unknown, doc: Record<string, unknown>): unknown {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema))
    return '';
  const source = schema as Record<string, unknown>;
  if (source['example'] !== undefined)
    return source['example'];
  if (typeof source['$ref'] === 'string') {
    const resolved = resolveRef(doc, source['$ref']);
    return exampleValue(resolved, doc);
  }
  switch (source['type']) {
    case 'integer':
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'array':
      return [];
    case 'object':
      return {};
    default:
      return '';
  }
}

function mapOperationSecurity(
  operation: Record<string, unknown>,
  doc: Record<string, unknown>,
  warnings: string[],
): Pick<CollectionRequestConfig, 'authMode' | 'auth'> {
  const requirements = (operation['security'] ?? doc['security']) as unknown;
  if (!Array.isArray(requirements) || requirements.length === 0)
    return { authMode: 'inherit', auth: DEFAULT_REQUEST_CONFIG.auth };
  for (const requirement of requirements) {
    if (!requirement || typeof requirement !== 'object' || Array.isArray(requirement))
      continue;
    for (const schemeName of Object.keys(requirement as Record<string, unknown>)) {
      const schemes = doc['components'] && typeof doc['components'] === 'object'
        ? (doc['components'] as Record<string, unknown>)['securitySchemes']
        : undefined;
      if (!schemes || typeof schemes !== 'object' || Array.isArray(schemes))
        continue;
      const scheme = (schemes as Record<string, unknown>)[schemeName];
      if (!scheme || typeof scheme !== 'object' || Array.isArray(scheme))
        continue;
      const source = scheme as Record<string, unknown>;
      if (source['type'] === 'http' && source['scheme'] === 'bearer') {
        return {
          authMode: 'bearer',
          auth: { ...DEFAULT_REQUEST_CONFIG.auth, type: 'bearer', token: '{{token}}' },
        };
      }
      if (source['type'] === 'http' && source['scheme'] === 'basic') {
        return {
          authMode: 'basic',
          auth: { ...DEFAULT_REQUEST_CONFIG.auth, type: 'basic' },
        };
      }
      if (source['type'] === 'apiKey') {
        const header = typeof source['name'] === 'string' ? source['name'] : 'X-Api-Key';
        const location = source['in'] === 'query' ? 'query' : 'header';
        return {
          authMode: 'apikey',
          auth: {
            ...DEFAULT_REQUEST_CONFIG.auth,
            type: 'apikey',
            apiKeyHeader: header,
            apiKeyIn: location,
          },
        };
      }
      warnings.push(`OpenAPI security scheme "${schemeName}" was not mapped.`);
    }
  }
  return { authMode: 'inherit', auth: DEFAULT_REQUEST_CONFIG.auth };
}

function buildOperationRequest(
  doc: Record<string, unknown>,
  path: string,
  method: string,
  operation: Record<string, unknown>,
  warnings: string[],
): CollectionNode {
  const pathParams: CollectionRequestConfig['pathParams'] = [];
  const queryParams: CollectionRequestConfig['queryParams'] = [];
  const parameters = Array.isArray(operation['parameters']) ? operation['parameters'] : [];
  for (const parameter of parameters) {
    if (!parameter || typeof parameter !== 'object' || Array.isArray(parameter))
      continue;
    let param = parameter as Record<string, unknown>;
    if (typeof param['$ref'] === 'string') {
      const resolved = resolveRef(doc, param['$ref']);
      if (resolved && typeof resolved === 'object' && !Array.isArray(resolved))
        param = resolved as Record<string, unknown>;
    }
    const location = param['in'];
    const row = {
      ...emptyCollectionKvRow('param'),
      key: typeof param['name'] === 'string' ? param['name'] : '',
      value: typeof param['example'] === 'string' ? param['example'] : '',
      description: typeof param['description'] === 'string' ? param['description'] : '',
      enabled: param['required'] === true,
    };
    if (location === 'path')
      pathParams.push(row);
    else if (location === 'query')
      queryParams.push(row);
  }

  let body = DEFAULT_REQUEST_CONFIG.body;
  const requestBody = operation['requestBody'];
  if (requestBody && typeof requestBody === 'object' && !Array.isArray(requestBody)) {
    const rb = requestBody as Record<string, unknown>;
    const content =
      rb['content'] && typeof rb['content'] === 'object' && !Array.isArray(rb['content'])
        ? (rb['content'] as Record<string, unknown>)
        : {};
    const json = content['application/json'];
    if (json && typeof json === 'object' && !Array.isArray(json)) {
      const example = schemaExample((json as Record<string, unknown>)['schema'], doc);
      body = { ...DEFAULT_REQUEST_CONFIG.body, mode: 'json', text: example || '{\n}\n' };
    }
  }

  const authBits = mapOperationSecurity(operation, doc, warnings);
  const summary = typeof operation['summary'] === 'string' ? operation['summary'] : '';
  const operationId = typeof operation['operationId'] === 'string' ? operation['operationId'] : '';
  const name = summary || operationId || `${method.toUpperCase()} ${path}`;
  const config: CollectionRequestConfig = {
    ...DEFAULT_REQUEST_CONFIG,
    url: path,
    pathParams,
    queryParams,
    body,
    ...authBits,
    description: typeof operation['description'] === 'string' ? operation['description'] : '',
  };
  return {
    kind: 'http',
    id: newCollectionNodeId('http'),
    name,
    modifiedAt: nowIso(),
    method: normalizeMethod(method),
    status: null,
    config,
  };
}

function folderKeyForOperation(path: string, tags: readonly string[]): string {
  if (tags.length > 0)
    return tags[0];
  const segments = path.split('/').filter(Boolean);
  return segments[0] ?? 'root';
}

/**
 * Converts an OpenAPI 3.x document (already parsed JSON) into a Testrix collection tree.
 */
export function convertOpenApi(doc: unknown): OpenApiImportResult {
  const warnings: string[] = [];
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { tree: [], warnings: ['Input is not an OpenAPI document object.'] };
  }
  const source = doc as Record<string, unknown>;
  const openapi = source['openapi'];
  if (typeof openapi !== 'string' || !openapi.startsWith('3.')) {
    return { tree: [], warnings: ['Only OpenAPI 3.x documents are supported.'] };
  }

  const paths =
    source['paths'] && typeof source['paths'] === 'object' && !Array.isArray(source['paths'])
      ? (source['paths'] as Record<string, unknown>)
      : {};
  const folders = new Map<string, CollectionTree>();

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object' || Array.isArray(pathItem))
      continue;
    const item = pathItem as Record<string, unknown>;
    for (const method of HTTP_METHODS.map((m) => m.toLowerCase())) {
      const operation = item[method];
      if (!operation || typeof operation !== 'object' || Array.isArray(operation))
        continue;
      const op = operation as Record<string, unknown>;
      const tags = Array.isArray(op['tags']) ? op['tags'].filter((t): t is string => typeof t === 'string') : [];
      const folderKey = folderKeyForOperation(path, tags);
      const request = buildOperationRequest(source, path, method, op, warnings);
      const list = folders.get(folderKey) ?? [];
      list.push(request);
      folders.set(folderKey, list);
    }
  }

  const tree: CollectionTree = [...folders.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, children]) => ({
      kind: 'folder',
      id: newCollectionNodeId('folder'),
      name,
      modifiedAt: nowIso(),
      children,
    }));

  let environment: OpenApiImportResult['environment'];
  const servers = Array.isArray(source['servers']) ? source['servers'] : [];
  const first = servers[0];
  if (first && typeof first === 'object' && !Array.isArray(first)) {
    const serverUrl = (first as Record<string, unknown>)['url'];
    const url = typeof serverUrl === 'string' ? serverUrl : '';
    if (url) {
      environment = {
        name: 'OpenAPI',
        variables: [{ key: 'baseUrl', value: url, enabled: true, secret: false }],
      };
    }
  }

  if (tree.length === 0)
    warnings.push('No HTTP operations found in OpenAPI document.');

  return { tree, environment, warnings };
}
