import type { HttpSettings } from '../config/http-settings.schema';
import { buildRequestDisplayUrl } from '../config/request-url';
import { normalizeOutgoingRequestUrl } from '../config/normalize-outgoing-request-url';
import { resolveDynamicVariables } from '../dynamic-variables/dynamic-variables';
import { resolveTemplateVariables } from '../dynamic-variables/template-variables';
import type { LoadTestManualTarget } from '../testing/load-test-target.schema';

import type { BuildOutgoingRequestResult } from './build-outgoing-request';
import { outgoingHttpRequestSchema } from './outgoing-request.schema';

function resolveHeaderMap(
  headers: LoadTestManualTarget['headers'],
  variableContext: Readonly<Record<string, string>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of headers ?? []) {
    if (!row.enabled || !row.key.trim()) {
      continue;
    }
    const withEnv = resolveTemplateVariables(row.value, { environment: variableContext });
    out[row.key] = resolveDynamicVariables(withEnv);
  }
  return out;
}

/**
 * Builds an outgoing HTTP request from a load test manual target definition.
 */
export function buildManualOutgoingRequest(input: {
  readonly loadTestId: string;
  readonly manual: LoadTestManualTarget;
  readonly http: HttpSettings;
  readonly variableContext?: Readonly<Record<string, string>>;
}): BuildOutgoingRequestResult | null {
  const variableContext = input.variableContext ?? {};
  const resolveText = (text: string): string =>
    resolveDynamicVariables(
      resolveTemplateVariables(text, { environment: variableContext }),
    );

  const path = resolveText(String(input.manual.url ?? '')).trim();
  if (!path) {
    return null;
  }

  const queryResolved = (input.manual.queryParams ?? []).map((row, index) => ({
    id: `q-${index}`,
    ...row,
    key: resolveText(row.key),
    value: resolveText(row.value ?? ''),
  }));
  let url = buildRequestDisplayUrl(path, queryResolved);
  url = normalizeOutgoingRequestUrl(url, {
    defaultScheme: input.http.request.defaultUrlScheme,
    enabled: input.http.request.autoFixUrlOnSend,
    prependWww: input.http.request.prependWwwOnSend,
  });

  const headers = resolveHeaderMap(input.manual.headers, variableContext);

  const outgoing = outgoingHttpRequestSchema.parse({
    requestId: input.loadTestId,
    method: input.manual.method ?? 'GET',
    url,
    headers,
    body: { kind: 'none' },
    transport: {
      timeoutMs: Number(input.manual.timeoutMs) || input.http.request.timeoutMs,
      useCookies: true,
      http2Enabled: input.http.request.http2Enabled,
      http2FallbackToHttp1: true,
      followRedirects: true,
      maxRedirects: 10,
      strictSsl: true,
      disableCookiesGlobally: false,
      ignoreInvalidSsl: false,
      proxy: input.http.proxy,
      certificates: input.http.certificates,
      dns: input.http.dns,
      retries: input.http.retries,
    },
    scripts: { pre: [], post: [] },
    environmentId: null,
    variableContext,
  });

  return {
    outgoing,
    resolvedAuthSource: 'manual',
    ancestorFolderIds: [],
  };
}
