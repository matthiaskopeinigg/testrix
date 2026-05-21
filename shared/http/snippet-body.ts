import type { CollectionRequestBody } from '../config/collection-request-settings.schema';

export type RequestCodeSnippetBody =
  | { readonly kind: 'none' }
  | { readonly kind: 'text'; readonly content: string; readonly contentType: string }
  | { readonly kind: 'urlencoded'; readonly pairs: readonly { readonly key: string; readonly value: string }[] }
  | {
      readonly kind: 'form-data';
      readonly fields: readonly {
        readonly key: string;
        readonly value?: string;
        readonly fileName?: string;
      }[];
    }
  | { readonly kind: 'unsupported'; readonly message: string };

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

export function bodyToSnippetBody(body: CollectionRequestBody): RequestCodeSnippetBody {
  switch (body.mode) {
    case 'none':
      return { kind: 'none' };
    case 'json':
    case 'text':
    case 'html':
    case 'xml':
      return {
        kind: 'text',
        content: body.raw,
        contentType:
          body.mode === 'json'
            ? 'application/json'
            : body.mode === 'html'
              ? 'text/html'
              : body.mode === 'xml'
                ? 'application/xml'
                : 'text/plain',
      };
    case 'x-www-form-urlencoded':
      return {
        kind: 'urlencoded',
        pairs: body.fields
          .filter((row) => row.enabled && row.key.trim())
          .map((row) => ({ key: row.key.trim(), value: row.value ?? '' })),
      };
    case 'form-data':
      return {
        kind: 'form-data',
        fields: body.fields
          .filter((row) => row.enabled && row.key.trim())
          .map((row) => ({
            key: row.key.trim(),
            value: row.type === 'text' ? row.value ?? '' : undefined,
            fileName: row.type === 'file' ? row.fileName ?? row.filePath ?? 'file' : undefined,
          })),
      };
    case 'binary':
      return {
        kind: 'unsupported',
        message: 'Binary body — use cURL with --data-binary @file after exporting the file.',
      };
    case 'graphql':
      return {
        kind: 'text',
        content: JSON.stringify(
          {
            query: body.query,
            variables: parseGraphqlVariables(body.variables),
            ...(body.operationName?.trim() ? { operationName: body.operationName.trim() } : {}),
          },
          null,
          2,
        ),
        contentType: 'application/json',
      };
    default:
      return { kind: 'none' };
  }
}
