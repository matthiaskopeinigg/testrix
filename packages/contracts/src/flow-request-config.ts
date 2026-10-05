import {
  REQUEST_BODY_MODES,
  applyPathParams,
  applyQueryToUrl,
  encodeRequestBody,
  emptyFormRow,
  requestFormRowSchema,
  syncPathParams,
  type RequestBody,
  type RequestBodyMode,
  type RequestFormRow,
} from './collection-request';
import {
  collectionKvRowSchema,
  emptyCollectionKvRow,
  type CollectionKvRow,
} from './collection-folder';
import { ensureRequestUrlScheme } from './request-url';

/** Inspector sections for a Flow HTTP request node (mirrors the request tab strip). */
export const FLOW_REQUEST_SECTIONS = ['params', 'headers', 'body'] as const;

export type FlowRequestSection = (typeof FLOW_REQUEST_SECTIONS)[number];

export function normalizeFlowRequestSection(raw: string | null | undefined): FlowRequestSection {
  if (raw === 'headers' || raw === 'body' || raw === 'params')
    return raw;
  return 'params';
}

export function flowRequestSectionSlideDir(
  from: FlowRequestSection,
  to: FlowRequestSection,
): 'left' | 'right' {
  return FLOW_REQUEST_SECTIONS.indexOf(to) > FLOW_REQUEST_SECTIONS.indexOf(from) ? 'right' : 'left';
}

/** Parses a JSON array of KV rows stored on a flow node config string. */
export function parseFlowRequestKvRows(raw: string | null | undefined): CollectionKvRow[] {
  if (!raw?.trim())
    return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed))
      return [];
    return parsed
      .map((item, index) => {
        const result = collectionKvRowSchema.safeParse({
          id:
            item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string'
              ? (item as { id: string }).id
              : `fr_${index}`,
          enabled:
            item && typeof item === 'object' && typeof (item as { enabled?: unknown }).enabled === 'boolean'
              ? (item as { enabled: boolean }).enabled
              : true,
          key:
            item && typeof item === 'object' && typeof (item as { key?: unknown }).key === 'string'
              ? (item as { key: string }).key
              : '',
          value:
            item && typeof item === 'object' && typeof (item as { value?: unknown }).value === 'string'
              ? (item as { value: string }).value
              : '',
          description:
            item && typeof item === 'object' && typeof (item as { description?: unknown }).description === 'string'
              ? (item as { description: string }).description
              : '',
        });
        return result.success ? result.data : null;
      })
      .filter((row): row is CollectionKvRow => row !== null);
  } catch {
    return [];
  }
}

/** Serializes KV rows for storage on a flow node config string. */
export function serializeFlowRequestKvRows(rows: readonly CollectionKvRow[]): string {
  const compact = rows.filter((row) => row.key.trim() || row.value.trim() || row.description.trim());
  return JSON.stringify(compact);
}

export function emptyFlowRequestKvRow(prefix = 'fr'): CollectionKvRow {
  return emptyCollectionKvRow(prefix);
}

export interface PlanFlowRequestUrlInput {
  readonly url: string;
  readonly pathParams?: readonly CollectionKvRow[];
  readonly queryParams?: readonly CollectionKvRow[];
}

/**
 * Builds the final request URL: path tokens, query string, then optional scheme
 * (`https://` for public hosts, `http://` for local). Placeholders in the host
 * are left alone until after interpolation.
 */
export function planFlowRequestUrl(input: PlanFlowRequestUrlInput): string {
  const withPath = applyPathParams(input.url.trim(), input.pathParams ?? []);
  const withQuery = applyQueryToUrl(withPath, input.queryParams ?? []);
  return ensureRequestUrlScheme(withQuery);
}

/** Keeps path-param rows in sync with `:name` tokens in the URL. */
export function syncFlowRequestPathParams(
  url: string,
  current: readonly CollectionKvRow[],
): CollectionKvRow[] {
  return syncPathParams(url, current);
}

/** Enabled header pairs ready for HTTP execute (after optional interpolation). */
export function flowRequestHeaderPairs(
  rows: readonly CollectionKvRow[],
): readonly { readonly key: string; readonly value: string }[] {
  return rows
    .filter((row) => row.enabled && row.key.trim())
    .map((row) => ({ key: row.key.trim(), value: row.value }));
}

/** Resolves body mode; legacy nodes with only `body` text default to json. */
export function normalizeFlowRequestBodyMode(
  raw: string | null | undefined,
  bodyText = '',
): RequestBodyMode {
  if (raw && (REQUEST_BODY_MODES as readonly string[]).includes(raw))
    return raw as RequestBodyMode;
  return bodyText.trim() ? 'json' : 'none';
}

/** Parses form / urlencoded rows stored on a flow node config string. */
export function parseFlowRequestFormRows(raw: string | null | undefined): RequestFormRow[] {
  if (!raw?.trim())
    return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed))
      return [];
    return parsed
      .map((item, index) => {
        const result = requestFormRowSchema.safeParse({
          id:
            item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string'
              ? (item as { id: string }).id
              : `ff_${index}`,
          enabled:
            item && typeof item === 'object' && typeof (item as { enabled?: unknown }).enabled === 'boolean'
              ? (item as { enabled: boolean }).enabled
              : true,
          key:
            item && typeof item === 'object' && typeof (item as { key?: unknown }).key === 'string'
              ? (item as { key: string }).key
              : '',
          value:
            item && typeof item === 'object' && typeof (item as { value?: unknown }).value === 'string'
              ? (item as { value: string }).value
              : '',
          description:
            item && typeof item === 'object' && typeof (item as { description?: unknown }).description === 'string'
              ? (item as { description: string }).description
              : '',
          kind:
            item && typeof item === 'object' && (item as { kind?: unknown }).kind === 'file'
              ? 'file'
              : 'text',
          fileName:
            item && typeof item === 'object' && typeof (item as { fileName?: unknown }).fileName === 'string'
              ? (item as { fileName: string }).fileName
              : '',
          contentType:
            item && typeof item === 'object' && typeof (item as { contentType?: unknown }).contentType === 'string'
              ? (item as { contentType: string }).contentType
              : '',
        });
        return result.success ? result.data : null;
      })
      .filter((row): row is RequestFormRow => row !== null);
  } catch {
    return [];
  }
}

/** Serializes form rows for storage on a flow node config string. */
export function serializeFlowRequestFormRows(rows: readonly RequestFormRow[]): string {
  const compact = rows.filter(
    (row) => row.key.trim() || row.value.trim() || row.fileName.trim() || row.description.trim(),
  );
  return JSON.stringify(compact);
}

export function emptyFlowRequestFormRow(prefix = 'ff'): RequestFormRow {
  return emptyFormRow(prefix);
}

export interface FlowRequestBodyConfigStrings {
  readonly bodyMode?: string;
  readonly body?: string;
  readonly formRows?: string;
  readonly graphqlQuery?: string;
  readonly graphqlVariables?: string;
  readonly graphqlOperation?: string;
  readonly binaryName?: string;
  readonly binaryType?: string;
  readonly binaryBase64?: string;
}

/** Builds a RequestBody from flat flow node config strings. */
export function flowRequestBodyFromConfig(config: FlowRequestBodyConfigStrings): RequestBody {
  const bodyText = config.body ?? '';
  const mode = normalizeFlowRequestBodyMode(config.bodyMode, bodyText);
  return {
    mode,
    text: bodyText,
    formRows: parseFlowRequestFormRows(config.formRows),
    graphql: {
      query: config.graphqlQuery ?? '',
      variables: config.graphqlVariables?.trim() ? config.graphqlVariables : '{\n}\n',
      operationName: config.graphqlOperation ?? '',
    },
    binary: {
      fileName: config.binaryName ?? '',
      contentType: config.binaryType?.trim() ? config.binaryType : 'application/octet-stream',
      base64: config.binaryBase64 ?? '',
    },
  };
}

/**
 * Applies a string interpolator to body fields that can hold placeholders
 * (skips binary base64 payloads).
 */
export function interpolateFlowRequestBody(
  body: RequestBody,
  interpolate: (value: string) => string,
): RequestBody {
  return {
    mode: body.mode,
    text: interpolate(body.text),
    formRows: body.formRows.map((row) => ({
      ...row,
      key: interpolate(row.key),
      value: interpolate(row.value),
      fileName: interpolate(row.fileName),
      contentType: interpolate(row.contentType),
      description: interpolate(row.description),
    })),
    graphql: {
      query: interpolate(body.graphql.query),
      variables: interpolate(body.graphql.variables),
      operationName: interpolate(body.graphql.operationName),
    },
    binary: {
      fileName: interpolate(body.binary.fileName),
      contentType: interpolate(body.binary.contentType),
      base64: body.binary.base64,
    },
  };
}

/** Encodes a flow request body the same way as the collection request tab. */
export function planFlowRequestEncodedBody(
  body: RequestBody,
): { readonly text: string; readonly contentType: string | null } {
  return encodeRequestBody(body);
}

/** Adds Content-Type when the body mode requires it and the header is absent. */
export function mergeFlowRequestContentType(
  headers: readonly { readonly key: string; readonly value: string }[],
  contentType: string | null,
): readonly { readonly key: string; readonly value: string }[] {
  if (!contentType)
    return headers;
  if (headers.some((row) => row.key.trim().toLowerCase() === 'content-type'))
    return headers;
  return [...headers, { key: 'Content-Type', value: contentType }];
}

/** True when the body section has something meaningful to send. */
export function flowRequestBodyHasContent(body: RequestBody): boolean {
  if (body.mode === 'none')
    return false;
  if (body.mode === 'form-data' || body.mode === 'urlencoded')
    return body.formRows.some((row) => row.enabled && row.key.trim());
  if (body.mode === 'graphql')
    return Boolean(body.graphql.query.trim() || body.graphql.operationName.trim());
  if (body.mode === 'binary')
    return Boolean(body.binary.base64.trim() || body.binary.fileName.trim());
  return Boolean(body.text.trim());
}
