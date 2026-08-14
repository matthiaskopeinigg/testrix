import type { HttpHeadersSettings } from '@shared/config';
import { resolveDynamicVariables } from '@shared/dynamic-variables';

/**
 * Builds the header map applied to outgoing HTTP requests from stored default header rows.
 * Templates such as `$uuid` are resolved at call time.
 */
export function buildResolvedDefaultHeaders(
  headers: HttpHeadersSettings,
): Readonly<Record<string, string>> {
  if (!headers.applyDefaultHeaders) {
    return {};
  }

  const result: Record<string, string> = {};
  for (const row of headers.rows) {
    if (!row.enabled) {
      continue;
    }
    const key = row.key.trim();
    if (!key) {
      continue;
    }
    result[key] = resolveDynamicVariables(row.value);
  }
  return result;
}
