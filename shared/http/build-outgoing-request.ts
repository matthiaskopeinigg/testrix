import { findCollectionRequestInTree } from '../config/collect-collection-ancestors';
import { applyPathParamsToUrl } from '../config/apply-path-params';
import { getEnvironmentDefinition } from '../config/environment-variables';
import { httpMethodAllowsRequestBody, type HttpMethodId } from '../config/http-settings.schema';
import {
  resolveCollectionRequestAuth,
  applyCollectionRequestAuth,
} from '../config/resolve-collection-request-auth';
import { resolveCollectionTransport } from '../config/resolve-collection-transport';
import {
  resolveCollectionRequestHeaders,
  resolvedHeadersToMap,
} from '../config/resolve-collection-request-headers';
import { resolveRequestVariables } from '../config/resolve-request-variables';
import { buildRequestDisplayUrl, normalizeOutgoingRequestUrl } from '../config/request-url';
import { suggestRequestContentType } from '../config/collection-request-settings.schema';
import { resolveTemplateVariables } from '../dynamic-variables/template-variables';
import { resolveDynamicVariables } from '../dynamic-variables/dynamic-variables';

import type { CollectionExecutionInput } from './collection-execution.schema';
import type { OutgoingHttpRequest } from './outgoing-request.schema';
import { outgoingHttpRequestSchema } from './outgoing-request.schema';
import { encodedRequestBodySchema } from './encoded-body.schema';
import { encodeRequestBody, resolveEncodedBodyTemplates } from './encode-request-body';

export interface BuildOutgoingRequestResult {
  readonly outgoing: OutgoingHttpRequest;
  readonly resolvedAuthSource: string;
  readonly ancestorFolderIds: readonly string[];
}

function resolveHeaderValues(
  headers: Readonly<Record<string, string>>,
  variableContext: Readonly<Record<string, string>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const withEnv = resolveTemplateVariables(value, { environment: variableContext });
    out[key] = resolveDynamicVariables(withEnv);
  }
  return out;
}

function headerKeyExists(headers: Readonly<Record<string, string>>, name: string): boolean {
  const lower = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === lower);
}

function mergeScripts(
  ancestorFolders: readonly { settings: { scripts: { pre: string; post: string } } }[],
  requestScripts: { pre: string; post: string },
): { pre: string[]; post: string[] } {
  const pre: string[] = [];
  for (const folder of ancestorFolders) {
    const s = folder.settings.scripts.pre.trim();
    if (s) {
      pre.push(s);
    }
  }
  const reqPre = requestScripts.pre.trim();
  if (reqPre) {
    pre.push(reqPre);
  }

  const post: string[] = [];
  const reqPost = requestScripts.post.trim();
  if (reqPost) {
    post.push(reqPost);
  }
  for (let i = ancestorFolders.length - 1; i >= 0; i--) {
    const s = ancestorFolders[i].settings.scripts.post.trim();
    if (s) {
      post.push(s);
    }
  }

  return { pre, post };
}

/**
 * Builds a fully merged outgoing HTTP request from collection tree + global settings.
 */
export function buildOutgoingRequest(input: CollectionExecutionInput): BuildOutgoingRequestResult | null {
  const loc = findCollectionRequestInTree(input.nodes, input.requestId);
  if (!loc) {
    return null;
  }

  const { request, ancestorFolders } = loc;
  const settings = request.settings;
  const environment = getEnvironmentDefinition(
    input.environments.environments,
    settings.environmentId ?? '',
  );
  const variableContext = resolveRequestVariables(
    ancestorFolders,
    environment,
    input.runScope?.sharedVariables ?? {},
  );

  const resolveText = (text: string): string =>
    resolveDynamicVariables(
      resolveTemplateVariables(text, { environment: variableContext }),
    );

  const pathWithParams = applyPathParamsToUrl(request.url, settings.pathParams, variableContext);
  const queryResolved = settings.queryParams.map((row) => ({
    ...row,
    key: resolveText(row.key),
    value: resolveText(row.value ?? ''),
  }));
  let url = buildRequestDisplayUrl(pathWithParams, queryResolved);

  const headerRows = resolveCollectionRequestHeaders({
    globalHeaders: input.http.headers,
    ancestorFolders,
    requestHeaders: settings.headers,
  });
  let headers = resolveHeaderValues(resolvedHeadersToMap(headerRows), variableContext);

  const authResolved = resolveCollectionRequestAuth(settings.auth, ancestorFolders);
  url = applyCollectionRequestAuth(authResolved.auth, headers, url);

  url = normalizeOutgoingRequestUrl(url, {
    defaultScheme: input.http.request.defaultUrlScheme,
    enabled: input.http.request.autoFixUrlOnSend,
    prependWww: input.http.request.prependWwwOnSend,
  });

  const method = request.method as HttpMethodId;
  const allowsBody = httpMethodAllowsRequestBody(method);

  let body = allowsBody ? encodeRequestBody(settings.body) : { kind: 'none' as const };
  if (allowsBody) {
    body = resolveEncodedBodyTemplates(body, resolveText);
    const contentTypeHint = suggestRequestContentType(settings.body);
    if (contentTypeHint?.trim() && !headerKeyExists(headers, 'content-type')) {
      headers['Content-Type'] = contentTypeHint.trim();
    }
  }

  const transport = resolveCollectionTransport(input.http, ancestorFolders, settings.transport);
  const scripts = mergeScripts(ancestorFolders, settings.scripts);

  const authLabel =
    authResolved.source === 'folder'
      ? `${authResolved.folderLabel ?? 'Folder'} (${authResolved.auth.type})`
      : authResolved.source === 'request'
        ? `Request (${authResolved.auth.type})`
        : 'None';

  const outgoing = outgoingHttpRequestSchema.parse({
    requestId: request.id,
    method,
    url,
    headers,
    body: encodedRequestBodySchema.parse(body),
    transport: {
      timeoutMs: transport.timeoutMs,
      useCookies: transport.useCookies,
      http2Enabled: transport.http2Enabled,
      http2FallbackToHttp1: transport.http2FallbackToHttp1,
      followRedirects: transport.followRedirects,
      maxRedirects: transport.maxRedirects,
      strictSsl: transport.strictSsl,
      disableCookiesGlobally: transport.disableCookiesGlobally,
      ignoreInvalidSsl: transport.ignoreInvalidSsl,
      proxy: transport.proxy,
      certificates: transport.certificates,
      dns: transport.dns,
      retries: transport.retries,
    },
    scripts,
    environmentId: settings.environmentId ?? null,
    variableContext: { ...variableContext },
  });

  return {
    outgoing,
    resolvedAuthSource: authLabel,
    ancestorFolderIds: ancestorFolders.map((f) => f.id),
  };
}
