import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export interface OpenApiSummary {
  readonly title: string;
  readonly version: string;
  readonly openapiVersion: string;
  readonly pathCount: number;
  readonly operationCount: number;
  readonly serverCount: number;
}

export interface OpenApiPathRow {
  readonly path: string;
  readonly method: string;
  readonly summary: string;
}

export interface OpenApiValidateResult {
  readonly summary: OpenApiSummary | null;
  readonly paths: readonly OpenApiPathRow[];
  readonly errors: readonly string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

export function parseOpenApiDocument(raw: string, format: 'json' | 'yaml'): OpenApiValidateResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { summary: null, paths: [], errors: ['Document is empty.'] };
  }
  let doc: unknown;
  try {
    doc = format === 'yaml' ? parseYaml(trimmed) : JSON.parse(trimmed);
  } catch {
    return {
      summary: null,
      paths: [],
      errors: [format === 'yaml' ? 'Invalid YAML.' : 'Invalid JSON.'],
    };
  }
  const root = asRecord(doc);
  if (!root) {
    return { summary: null, paths: [], errors: ['Root must be an object.'] };
  }
  const openapiVersion =
    typeof root['openapi'] === 'string'
      ? root['openapi']
      : typeof root['swagger'] === 'string'
        ? root['swagger']
        : '';
  if (!openapiVersion) {
    return { summary: null, paths: [], errors: ['Missing openapi or swagger version field.'] };
  }
  const info = asRecord(root['info']);
  const pathsObj = asRecord(root['paths']);
  const servers = Array.isArray(root['servers']) ? root['servers'] : [];
  const pathRows: OpenApiPathRow[] = [];
  let operationCount = 0;
  if (pathsObj) {
    for (const [path, pathItem] of Object.entries(pathsObj)) {
      const item = asRecord(pathItem);
      if (!item) continue;
      for (const [method, op] of Object.entries(item)) {
        if (method === 'parameters' || method === '$ref' || method.startsWith('x-')) continue;
        const opRec = asRecord(op);
        pathRows.push({
          path,
          method: method.toUpperCase(),
          summary: typeof opRec?.['summary'] === 'string' ? opRec['summary'] : '',
        });
        operationCount++;
      }
    }
  }
  pathRows.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  return {
    summary: {
      title: typeof info?.['title'] === 'string' ? info['title'] : 'Untitled',
      version: typeof info?.['version'] === 'string' ? info['version'] : '—',
      openapiVersion,
      pathCount: pathsObj ? Object.keys(pathsObj).length : 0,
      operationCount,
      serverCount: servers.length,
    },
    paths: pathRows,
    errors: [],
  };
}

export function formatOpenApiContent(raw: string, format: 'json' | 'yaml'): { readonly content: string; readonly error: string | null } {
  const result = parseOpenApiDocument(raw, format);
  if (result.errors.length > 0) {
    return { content: raw, error: result.errors[0] ?? 'Invalid document' };
  }
  try {
    const doc = format === 'yaml' ? parseYaml(raw) : JSON.parse(raw);
    if (format === 'yaml') {
      return { content: stringifyYaml(doc), error: null };
    }
    return { content: JSON.stringify(doc, null, 2), error: null };
  } catch {
    return { content: raw, error: 'Could not format document.' };
  }
}

export const OPENAPI_PETSTORE_SAMPLE = JSON.stringify(
  {
    openapi: '3.0.3',
    info: { title: 'Petstore', version: '1.0.0' },
    servers: [{ url: 'https://petstore.swagger.io/v2' }],
    paths: {
      '/pet': {
        get: { summary: 'List pets', responses: { '200': { description: 'OK' } } },
        post: { summary: 'Add pet', responses: { '201': { description: 'Created' } } },
      },
    },
  },
  null,
  2,
);
