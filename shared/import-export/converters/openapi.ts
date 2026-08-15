import * as yaml from 'yaml';

import type { CollectionsFile } from '../../config/collections.schema';
import {
  createDefaultCollectionRequestSettings,
  enrichCollectionRequestSettings,
} from '../../config/collection-request-settings.schema';
import type { HttpMethodId } from '../../config/http-settings.schema';
import { createHttpKeyValueRow } from '../../config/http-settings.schema';
import type { CollectionRequestExample } from '../../config/collection-request-settings.schema';
import type { HttpResponseSnapshot } from '../../http/outgoing-request.schema';
import {
  createDefaultMockRuleMatcher,
  createDefaultMockServerEndpoint,
  type MockServerEndpoint,
} from '../../testing/mock-server.schema';
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

function stringifyExample(value: unknown): string {
  if (value == null) {
    return '';
  }
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function createOpenApiExampleSnapshot(
  method: HttpMethodId,
  url: string,
  statusCode: number,
  body: string,
  contentType: string,
): HttpResponseSnapshot {
  return {
    id: newImportId(),
    capturedAt: new Date().toISOString(),
    requestSummary: { method, url },
    status: {
      code: statusCode,
      text: '',
      ok: statusCode >= 200 && statusCode < 300,
    },
    timing: { totalMs: 0 },
    size: { headersBytes: 0, bodyBytes: body.length },
    headers: contentType ? [{ key: 'content-type', value: contentType }] : [],
    redirects: [],
    body: {
      encoding: 'text',
      text: body,
      contentType: contentType || undefined,
    },
  };
}

function parseOpenApiResponseExamples(
  responses: unknown,
  method: HttpMethodId,
  url: string,
): CollectionRequestExample[] {
  if (!responses || typeof responses !== 'object') {
    return [];
  }
  const examples: CollectionRequestExample[] = [];
  for (const [status, response] of Object.entries(responses as Record<string, unknown>)) {
    if (!response || typeof response !== 'object') {
      continue;
    }
    const statusCode = Number.parseInt(status, 10);
    const code = Number.isFinite(statusCode) ? statusCode : 200;
    const content = (response as { content?: Record<string, unknown> }).content;
    if (!content || typeof content !== 'object') {
      continue;
    }
    for (const [contentType, media] of Object.entries(content)) {
      if (!media || typeof media !== 'object') {
        continue;
      }
      const record = media as {
        example?: unknown;
        examples?: Record<string, { value?: unknown; example?: unknown }>;
      };
      if (record.example != null) {
        const body = stringifyExample(record.example);
        examples.push({
          id: newImportId(),
          name: `${status} ${contentType}`,
          snapshot: createOpenApiExampleSnapshot(method, url, code, body, contentType),
        });
      }
      if (record.examples && typeof record.examples === 'object') {
        for (const [exampleName, example] of Object.entries(record.examples)) {
          const value = example?.value ?? example?.example;
          if (value == null) {
            continue;
          }
          examples.push({
            id: newImportId(),
            name: exampleName,
            snapshot: createOpenApiExampleSnapshot(
              method,
              url,
              code,
              stringifyExample(value),
              contentType,
            ),
          });
        }
      }
      if (examples.length >= 32) {
        return examples.slice(0, 32);
      }
    }
  }
  return examples.slice(0, 32);
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
      const url = `{{baseUrl}}${pathStr}`;
      settings.examples = parseOpenApiResponseExamples(operation['responses'], parseMethod(methodStr), url);

      nodes.push({
        id: newImportId(),
        kind: 'request',
        label: String(
          operation['summary'] ?? operation['operationId'] ?? `${methodStr.toUpperCase()} ${pathStr}`,
        ),
        order: order++,
        method: parseMethod(methodStr),
        url,
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

function newMockId(): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `mock-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Converts OpenAPI response examples into mock server endpoints.
 */
export function importOpenApiToMockEndpoints(raw: string): MockServerEndpoint[] {
  const json = parseOpenApiContent(raw);
  const paths = (json['paths'] as Record<string, Record<string, unknown>> | undefined) ?? {};
  const endpoints: MockServerEndpoint[] = [];
  const now = new Date().toISOString();

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
      const method = parseMethod(methodStr);
      const url = `{{baseUrl}}${pathStr}`;
      const examples = parseOpenApiResponseExamples(operation['responses'], method, url);
      const snapshot = examples[0]?.snapshot;
      const id = newMockId();
      const endpoint = createDefaultMockServerEndpoint(
        id,
        String(operation['summary'] ?? operation['operationId'] ?? `${method} ${pathStr}`),
        now,
      );
      const matcher = createDefaultMockRuleMatcher(`${id}-matcher`);
      const bodyText = snapshot?.body.text ?? '';
      endpoints.push({
        ...endpoint,
        matchers: [
          {
            ...matcher,
            methods: [method],
            path: { mode: 'exact', value: pathStr, ignoreQuery: true },
          },
        ],
        response: {
          statusCode: snapshot?.status.code ?? 200,
          headers: [],
          body: bodyText.trim()
            ? { mode: 'json', raw: bodyText }
            : { mode: 'none' },
          latencyMs: 0,
        },
      });
    }
  }

  return endpoints;
}
