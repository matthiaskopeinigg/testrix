import * as yaml from 'yaml';

import type { CollectionsFile } from '../../config/collections.schema';
import {
  createDefaultCollectionRequestSettings,
  enrichCollectionRequestSettings,
} from '../../config/collection-request-settings.schema';
import type { HttpMethodId } from '../../config/http-settings.schema';
import { createHttpKeyValueRow } from '../../config/http-settings.schema';
import { importMetaNow, newImportId } from '../import-ids';

type OpenApiRecord = Record<string, unknown>;

function parseOpenApiContent(raw: string): OpenApiRecord {
  try {
    return JSON.parse(raw) as OpenApiRecord;
  } catch {
    return yaml.parse(raw) as OpenApiRecord;
  }
}

function parseMethod(methodStr: string): HttpMethodId {
  const m = methodStr.toUpperCase();
  const allowed: HttpMethodId[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  return allowed.includes(m as HttpMethodId) ? (m as HttpMethodId) : 'GET';
}

function parseOpenApiHeaders(parameters: unknown): ReturnType<typeof createHttpKeyValueRow>[] {
  if (!Array.isArray(parameters)) {
    return [];
  }
  return parameters
    .filter((p) => p && typeof p === 'object' && (p as { in?: string }).in === 'header')
    .map((p) => {
      const row = p as { name?: string; example?: unknown; schema?: { default?: unknown }; description?: string };
      const value =
        row.example != null
          ? String(row.example)
          : row.schema?.default != null
            ? String(row.schema.default)
            : '';
      return createHttpKeyValueRow({
        key: String(row.name ?? ''),
        value,
        description: row.description,
      });
    })
    .filter((h) => h.key.trim().length > 0);
}

function parseOpenApiQueryParams(parameters: unknown): ReturnType<typeof createHttpKeyValueRow>[] {
  if (!Array.isArray(parameters)) {
    return [];
  }
  return parameters
    .filter((p) => p && typeof p === 'object' && (p as { in?: string }).in === 'query')
    .map((p) => {
      const row = p as { name?: string; example?: unknown; schema?: { default?: unknown }; description?: string };
      const value =
        row.example != null
          ? String(row.example)
          : row.schema?.default != null
            ? String(row.schema.default)
            : '';
      return createHttpKeyValueRow({
        key: String(row.name ?? ''),
        value,
        description: row.description,
      });
    })
    .filter((h) => h.key.trim().length > 0);
}

function parseOpenApiBodyRaw(requestBody: unknown): { body: ReturnType<typeof createDefaultCollectionRequestSettings>['body']; raw: string } {
  const defaults = createDefaultCollectionRequestSettings();
  if (!requestBody || typeof requestBody !== 'object') {
    return { body: defaults.body, raw: '' };
  }
  const content = (requestBody as { content?: Record<string, unknown> }).content;
  if (!content) {
    return { body: defaults.body, raw: '' };
  }
  const jsonContent = content['application/json'] as { example?: unknown } | undefined;
  if (jsonContent?.example != null) {
    const raw =
      typeof jsonContent.example === 'string'
        ? jsonContent.example
        : JSON.stringify(jsonContent.example, null, 2);
    return { body: { mode: 'json', raw }, raw };
  }
  return { body: defaults.body, raw: '' };
}

/** Converts an OpenAPI 2/3 document into a Testrix collections file. */
export function importOpenApi(raw: string): CollectionsFile {
  const json = parseOpenApiContent(raw);
  const info = (json['info'] as { title?: string } | undefined) ?? {};
  const title = String(info.title ?? 'Imported OpenAPI');
  const paths = (json['paths'] as Record<string, Record<string, unknown>> | undefined) ?? {};
  const nodes: CollectionsFile['nodes'] = [];
  let order = 0;

  for (const pathStr of Object.keys(paths)) {
    const pathValue = paths[pathStr];
    if (!pathValue || typeof pathValue !== 'object') {
      continue;
    }
    for (const methodStr of Object.keys(pathValue)) {
      if (!['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(methodStr.toLowerCase())) {
        continue;
      }
      const operation = pathValue[methodStr] as Record<string, unknown>;
      const settings = enrichCollectionRequestSettings(createDefaultCollectionRequestSettings());
      settings.headers.rows = parseOpenApiHeaders(operation['parameters']);
      settings.queryParams = parseOpenApiQueryParams(operation['parameters']);
      const { body } = parseOpenApiBodyRaw(operation['requestBody']);
      settings.body = body;

      nodes.push({
        id: newImportId(),
        kind: 'request',
        label: String(
          operation['summary'] ?? operation['operationId'] ?? `${methodStr.toUpperCase()} ${pathStr}`,
        ),
        order: order++,
        method: parseMethod(methodStr),
        url: `{{baseUrl}}${pathStr}`,
        settings,
      });
    }
  }

  if (nodes.length === 0) {
    throw new Error('No operations found in OpenAPI document.');
  }

  return {
    schemaVersion: 1,
    meta: importMetaNow(),
    nodes,
  };
}
