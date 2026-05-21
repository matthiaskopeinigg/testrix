import type { CollectionRequestBody } from '../config/collection-request-settings.schema';
import type { HttpKeyValueRow } from '../config/http-settings.schema';

export type EncodedRequestBody =
  | { readonly kind: 'none' }
  | { readonly kind: 'text'; readonly content: string; readonly contentType: string }
  | {
      readonly kind: 'urlencoded';
      readonly content: string;
      readonly contentType: 'application/x-www-form-urlencoded';
    }
  | {
      readonly kind: 'multipart';
      readonly parts: readonly MultipartPart[];
    }
  | { readonly kind: 'binary'; readonly filePath: string; readonly contentType?: string }
  | { readonly kind: 'binary-inline'; readonly base64: string; readonly contentType?: string };

export interface MultipartPart {
  readonly name: string;
  readonly value?: string;
  readonly filePath?: string;
  readonly fileName?: string;
}

function parseGraphqlVariables(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {};
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return {};
  }
}

/**
 * Encodes collection request body for the main-process HTTP executor.
 */
export function encodeRequestBody(body: CollectionRequestBody): EncodedRequestBody {
  switch (body.mode) {
    case 'none':
      return { kind: 'none' };
    case 'json':
      return { kind: 'text', content: body.raw, contentType: 'application/json' };
    case 'text':
      return { kind: 'text', content: body.raw, contentType: 'text/plain' };
    case 'html':
      return { kind: 'text', content: body.raw, contentType: 'text/html' };
    case 'xml':
      return { kind: 'text', content: body.raw, contentType: 'application/xml' };
    case 'x-www-form-urlencoded': {
      const params = new URLSearchParams();
      for (const row of body.fields) {
        if (row.enabled && row.key.trim()) {
          params.set(row.key.trim(), row.value ?? '');
        }
      }
      return {
        kind: 'urlencoded',
        content: params.toString(),
        contentType: 'application/x-www-form-urlencoded',
      };
    }
    case 'form-data':
      return {
        kind: 'multipart',
        parts: body.fields
          .filter((f) => f.enabled && f.key.trim())
          .map((f) => ({
            name: f.key.trim(),
            value: f.type === 'text' ? f.value ?? '' : undefined,
            filePath: f.type === 'file' && f.filePath ? f.filePath : undefined,
            fileName: f.fileName,
          })),
      };
    case 'binary':
      if (body.source === 'file' && body.filePath) {
        return {
          kind: 'binary',
          filePath: body.filePath,
          contentType: body.contentType,
        };
      }
      if (body.contentBase64) {
        return {
          kind: 'binary-inline',
          base64: body.contentBase64,
          contentType: body.contentType,
        };
      }
      return { kind: 'none' };
    case 'graphql':
      return {
        kind: 'text',
        content: JSON.stringify({
          query: body.query,
          variables: parseGraphqlVariables(body.variables),
          ...(body.operationName?.trim() ? { operationName: body.operationName.trim() } : {}),
        }),
        contentType: 'application/json',
      };
    default:
      return { kind: 'none' };
  }
}

/** Resolves template variables in encoded text bodies and urlencoded field values. */
export function resolveEncodedBodyTemplates(
  body: EncodedRequestBody,
  resolve: (text: string) => string,
): EncodedRequestBody {
  switch (body.kind) {
    case 'text':
    case 'urlencoded':
      return { ...body, content: resolve(body.content) };
    case 'multipart':
      return {
        ...body,
        parts: body.parts.map((p) => ({
          ...p,
          value: p.value !== undefined ? resolve(p.value) : undefined,
        })),
      };
    default:
      return body;
  }
}

export function urlEncodedRowsToString(rows: readonly HttpKeyValueRow[]): string {
  const params = new URLSearchParams();
  for (const row of rows) {
    if (row.enabled && row.key.trim()) {
      params.set(row.key.trim(), row.value ?? '');
    }
  }
  return params.toString();
}
