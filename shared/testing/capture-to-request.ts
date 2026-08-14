import type { CollectionRequestSettings, HttpMethodId } from '../config';
import type { CollectionRequestBody } from '../config/collection-request-settings.schema';
import { createHttpKeyValueRow, HTTP_METHOD_IDS } from '../config/http-settings.schema';
import { inferHttpBodySyntaxModeFromHeaders } from '../http/http-body-editor-language';

import {
  captureBodyPreviewContent,
  captureResponseBodyPreview,
} from './capture-format';
import type { CaptureHeaderPair, CaptureLogEntry } from './capture-log-entry.schema';
import type {
  RequestStepConfig,
  TestSuiteKeyValuePair,
  ValidationRule,
  ValidationStepConfig,
} from './test-suite-steps.schema';
import { validationStepConfigSchema } from './test-suite-steps.schema';

const MAX_LABEL_URL_CHARS = 56;
/** Max expected body length stored on a validation rule (longer bodies use `contains`). */
const MAX_VALIDATION_BODY_EXPECTED_CHARS = 2_000;

/**
 * Truncates a URL for display labels.
 */
export function truncateCaptureUrl(url: string, max = MAX_LABEL_URL_CHARS): string {
  const t = url.trim();
  if (t.length <= max) {
    return t;
  }
  return `${t.slice(0, max - 1)}…`;
}

/**
 * Coerces a captured HTTP method string to a supported method id.
 */
export function coerceCaptureHttpMethod(method: string): HttpMethodId {
  const upper = (method || 'GET').trim().toUpperCase();
  if ((HTTP_METHOD_IDS as readonly string[]).includes(upper)) {
    return upper as HttpMethodId;
  }
  return 'GET';
}

/**
 * Builds a collection / flow step label from a capture entry.
 */
export function captureEntryRequestLabel(entry: CaptureLogEntry): string {
  const url = (entry.url || '').trim() || '/';
  const base = truncateCaptureUrl(url) || 'Captured request';
  return base.length > 120 ? `${base.slice(0, 119)}…` : base;
}

/**
 * Default name for a new test-suite flow created from a capture entry.
 */
export function captureFlowNameFromEntry(entry: CaptureLogEntry): string {
  const method = coerceCaptureHttpMethod(entry.method);
  const urlLabel = captureEntryRequestLabel(entry);
  const base = urlLabel === 'Captured request' ? `${method} capture` : `${method} ${urlLabel}`;
  return base.length > 120 ? `${base.slice(0, 119)}…` : base;
}

/**
 * Maps capture header pairs to enabled key-value rows.
 */
export function captureHeadersToKeyValuePairs(
  headers: readonly CaptureHeaderPair[],
): TestSuiteKeyValuePair[] {
  return headers
    .filter((h) => h.key.trim() !== '' && h.value !== undefined)
    .map((h) => ({
      key: h.key.trim(),
      value: h.value,
      enabled: true,
    }));
}

function contentTypeFromCaptureHeaders(headers: readonly CaptureHeaderPair[]): string {
  const row = headers.find((h) => h.key.trim().toLowerCase() === 'content-type');
  return row?.value?.trim() ?? '';
}

function captureRequestBodyText(entry: CaptureLogEntry): string {
  const raw = (entry.requestBody ?? '').trim();
  if (!raw) {
    return '';
  }
  return captureBodyPreviewContent(entry.requestHeaders, entry.requestBody, entry.requestBodyIsBinary);
}

function buildGraphqlCollectionBody(text: string): CollectionRequestBody {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const query = typeof parsed['query'] === 'string' ? parsed['query'] : trimmed;
      const variables =
        typeof parsed['variables'] === 'string'
          ? parsed['variables']
          : JSON.stringify(parsed['variables'] ?? {}, null, 2);
      const operationName =
        typeof parsed['operationName'] === 'string' ? parsed['operationName'] : undefined;
      return {
        mode: 'graphql',
        query,
        variables,
        ...(operationName ? { operationName } : {}),
      };
    } catch {
      // fall through — treat payload as a raw query string
    }
  }
  return { mode: 'graphql', query: trimmed, variables: '{}' };
}

/**
 * Builds a collection request body value from a capture entry.
 */
export function buildCollectionBodyFromCapture(entry: CaptureLogEntry): CollectionRequestBody {
  const raw = (entry.requestBody ?? '').trim();
  if (!raw) {
    return { mode: 'none' };
  }
  if (entry.requestBodyIsBinary) {
    return {
      mode: 'binary',
      source: 'inline',
      contentBase64: raw,
      contentType: contentTypeFromCaptureHeaders(entry.requestHeaders) || 'application/octet-stream',
    };
  }
  const text = captureRequestBodyText(entry);
  const mode = inferHttpBodySyntaxModeFromHeaders(
    entry.requestHeaders,
    entry.requestBody,
    entry.requestBodyIsBinary,
  );
  switch (mode) {
    case 'json':
      return { mode: 'json', raw: text };
    case 'xml':
      return { mode: 'xml', raw: text };
    case 'html':
      return { mode: 'html', raw: text };
    case 'graphql':
      return buildGraphqlCollectionBody(text);
    default:
      return { mode: 'text', raw: text };
  }
}

/**
 * Returns collection request settings patch fields from a capture entry.
 */
export function buildCollectionSettingsPatchFromCapture(
  entry: CaptureLogEntry,
): Partial<CollectionRequestSettings> {
  const rows = captureHeadersToKeyValuePairs(entry.requestHeaders).map((pair) =>
    createHttpKeyValueRow({
      key: pair.key,
      value: pair.value,
      enabled: pair.enabled,
    }),
  );
  return {
    headers: { rows, overrides: {} },
    body: buildCollectionBodyFromCapture(entry),
  };
}

function captureBodyTypeForFlow(entry: CaptureLogEntry): RequestStepConfig['bodyType'] {
  const raw = (entry.requestBody ?? '').trim();
  if (!raw) {
    return 'none';
  }
  if (entry.requestBodyIsBinary) {
    return 'binary';
  }
  const mode = inferHttpBodySyntaxModeFromHeaders(
    entry.requestHeaders,
    entry.requestBody,
    entry.requestBodyIsBinary,
  );
  switch (mode) {
    case 'json':
      return 'json';
    case 'xml':
      return 'xml';
    case 'graphql':
      return 'graphql';
    default:
      return 'text';
  }
}

/**
 * Builds a test-suite REQUEST step config from a capture entry.
 */
export function buildRequestStepConfigFromCapture(entry: CaptureLogEntry): RequestStepConfig {
  const method = coerceCaptureHttpMethod(entry.method);
  const url = (entry.url || '').trim() || '/';
  const body = captureRequestBodyText(entry);
  const bodyType = captureBodyTypeForFlow(entry);
  return {
    method,
    url,
    headers: captureHeadersToKeyValuePairs(entry.requestHeaders),
    queryParams: [],
    body,
    bodyType,
    requestSource: 'manual',
    timeoutMs: 30_000,
  };
}

/**
 * Builds a VALIDATION step that asserts the captured response status and body.
 */
export function buildValidationStepConfigFromCapture(
  entry: CaptureLogEntry,
  requestStepId: string,
): ValidationStepConfig {
  const rules: ValidationRule[] = [];

  if (entry.statusCode !== null && entry.statusCode !== undefined) {
    rules.push({
      source: 'response_status',
      expression: '',
      operator: 'equals',
      expected: String(entry.statusCode),
    });
  }

  const bodyText = captureResponseBodyPreview(entry).trim();
  if (bodyText && !entry.responseBodyIsBinary) {
    const useContains = bodyText.length > MAX_VALIDATION_BODY_EXPECTED_CHARS;
    rules.push({
      source: 'response_body',
      expression: '',
      operator: useContains ? 'contains' : 'equals',
      expected: useContains
        ? bodyText.slice(0, MAX_VALIDATION_BODY_EXPECTED_CHARS)
        : bodyText,
      bodyFormat: 'auto',
    });
  }

  if (rules.length === 0) {
    rules.push({
      source: 'response_status',
      expression: '',
      operator: 'exists',
      expected: '',
    });
  }

  return validationStepConfigSchema.parse({
    refStepId: requestStepId,
    rules,
  });
}
