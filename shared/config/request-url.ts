import { highlightTemplateVariables } from '../dynamic-variables/template-variable-highlight';
import {
  DYNAMIC_VARIABLES,
  type DynamicVariableCatalogItem,
} from '../dynamic-variables/dynamic-variables';

import { createHttpKeyValueRow, type HttpKeyValueRow } from './http-settings.schema';
import type { CollectionRequestPathParam } from './collection-request-settings.schema';
import { parsePathParamKeysFromUrl } from './collection-request-path-params';

const PATH_PARAM_HIGHLIGHT_PATTERN = /:([A-Za-z0-9_]+)/g;

/**
 * Builds the URL shown in the request bar (path + enabled query string).
 * Persisted `url` on the node is the path only (no `?` query).
 */
export function buildRequestDisplayUrl(
  path: string,
  queryParams: readonly HttpKeyValueRow[],
): string {
  const base = path.trim();
  const enabled = queryParams.filter((row) => row.enabled && row.key.trim());
  if (enabled.length === 0) {
    return base;
  }
  const qs = enabled
    .map(
      (row) =>
        `${encodeURIComponent(row.key.trim())}=${encodeURIComponent(row.value ?? '')}`,
    )
    .join('&');
  if (!base) {
    return `?${qs}`;
  }
  return base.includes('?') ? `${base}&${qs}` : `${base}?${qs}`;
}

export interface ParsedRequestUrlInput {
  readonly path: string;
  readonly queryParams: HttpKeyValueRow[];
}

/**
 * Splits display URL into stored path and query rows (new ids for parsed keys).
 */
export function parseRequestUrlInput(
  input: string,
  existingQueryParams: readonly HttpKeyValueRow[],
): ParsedRequestUrlInput {
  const qIndex = input.indexOf('?');
  const path = (qIndex === -1 ? input : input.slice(0, qIndex)).trim();
  const search = qIndex === -1 ? '' : input.slice(qIndex + 1);
  const byKey = new Map(existingQueryParams.map((row) => [row.key.trim().toLowerCase(), row]));

  const queryParams: HttpKeyValueRow[] = [];
  if (search.trim()) {
    const params = new URLSearchParams(search);
    for (const [key, value] of params.entries()) {
      const prior = byKey.get(key.toLowerCase());
      queryParams.push(
        prior
          ? { ...prior, key, value, enabled: true }
          : createHttpKeyValueRow({ key, value, enabled: true }),
      );
    }
  }

  return { path, queryParams };
}

/**
 * HTML for the URL mirror layer: highlights `:path` segments, `$` variables, and `{{env}}` placeholders.
 */
export function highlightRequestUrlDisplay(
  text: string,
  pathParams: readonly CollectionRequestPathParam[],
  catalog: readonly DynamicVariableCatalogItem[] = DYNAMIC_VARIABLES,
): string {
  if (!text) {
    return '';
  }

  const valueByKey = new Map(pathParams.map((row) => [row.key, row.value ?? '']));
  let html = '';
  let lastIndex = 0;
  const pattern = new RegExp(PATH_PARAM_HIGHLIGHT_PATTERN.source, 'g');

  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const index = match.index;
    const segment = text.slice(lastIndex, index);
    html += highlightTemplateVariables(segment, catalog);
    const key = match[1] ?? '';
    const token = `:${key}`;
    const value = valueByKey.get(key) ?? '';
    html += `<span class="tx-url-path-param" data-path-key="${escapeAttr(key)}" data-path-value="${escapeAttr(value)}">${escapeHtml(token)}</span>`;
    lastIndex = index + match[0].length;
  }

  html += highlightTemplateVariables(text.slice(lastIndex), catalog);
  return html;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll("'", '&#39;');
}

/** Re-export for URL change handlers. */
export { parsePathParamKeysFromUrl };

export {
  normalizeOutgoingRequestUrl,
  type NormalizeOutgoingUrlOptions,
} from './normalize-outgoing-request-url';
