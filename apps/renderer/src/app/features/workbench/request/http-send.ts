import {
  ancestorFolderConfigs,
  applyPathParams,
  applyQueryToUrl,
  encodeRequestBody,
  ensureRequestUrlScheme,
  expandPlaceholderMap,
  expandPlaceholders,
  findNodePath,
  interpolateKvRows,
  interpolateTemplate,
  mergeFolderConfigs,
  effectiveVerifyTls,
  mergeRequestSettings,
  oauthTokenExpired,
  overlayCookies,
  overlayRows,
  resolvedAuth,
  variableMapFromRows,
  type CollectionCookie,
  type CollectionFolderAuth,
  type CollectionFolderSettings,
  type CollectionKvRow,
  type CollectionTree,
  type ExpandPlaceholderOptions,
  type HttpExecuteRequest,
  type RequestAuthMode,
  type RequestBody,
} from '@testrix/contracts';

export type { RequestAuthMode };

export interface HttpSendPlan {
  readonly payload: HttpExecuteRequest;
  readonly storeCookies: boolean;
  readonly inheritedHeaders: readonly CollectionKvRow[];
  readonly inheritedParams: readonly CollectionKvRow[];
  readonly inheritedAuth: CollectionFolderAuth;
  readonly needsRefresh: boolean;
}

function interpolateAuth(auth: CollectionFolderAuth, vars: Record<string, string>): CollectionFolderAuth {
  return {
    ...auth,
    token: interpolateTemplate(auth.token, vars),
    username: interpolateTemplate(auth.username, vars),
    password: interpolateTemplate(auth.password, vars),
    realm: interpolateTemplate(auth.realm, vars),
    apiKey: interpolateTemplate(auth.apiKey, vars),
    apiKeyHeader: interpolateTemplate(auth.apiKeyHeader, vars),
    accessToken: interpolateTemplate(auth.accessToken, vars),
    refreshToken: interpolateTemplate(auth.refreshToken, vars),
    clientId: interpolateTemplate(auth.clientId, vars),
    clientSecret: interpolateTemplate(auth.clientSecret, vars),
    authUrl: interpolateTemplate(auth.authUrl, vars),
    tokenUrl: interpolateTemplate(auth.tokenUrl, vars),
    deviceAuthUrl: interpolateTemplate(auth.deviceAuthUrl, vars),
    scope: interpolateTemplate(auth.scope, vars),
    audience: interpolateTemplate(auth.audience, vars),
  };
}

function expandText(text: string, vars: Record<string, string>, options: ExpandPlaceholderOptions): string {
  return expandPlaceholders(interpolateTemplate(text, vars), options);
}

function expandAuth(
  auth: CollectionFolderAuth,
  vars: Record<string, string>,
  options: ExpandPlaceholderOptions,
): CollectionFolderAuth {
  const interpolated = interpolateAuth(auth, vars);
  return {
    ...interpolated,
    token: expandPlaceholders(interpolated.token, options),
    username: expandPlaceholders(interpolated.username, options),
    password: expandPlaceholders(interpolated.password, options),
    realm: expandPlaceholders(interpolated.realm, options),
    apiKey: expandPlaceholders(interpolated.apiKey, options),
    apiKeyHeader: expandPlaceholders(interpolated.apiKeyHeader, options),
    accessToken: expandPlaceholders(interpolated.accessToken, options),
    refreshToken: expandPlaceholders(interpolated.refreshToken, options),
    clientId: expandPlaceholders(interpolated.clientId, options),
    clientSecret: expandPlaceholders(interpolated.clientSecret, options),
    authUrl: expandPlaceholders(interpolated.authUrl, options),
    tokenUrl: expandPlaceholders(interpolated.tokenUrl, options),
    deviceAuthUrl: expandPlaceholders(interpolated.deviceAuthUrl, options),
    scope: expandPlaceholders(interpolated.scope, options),
    audience: expandPlaceholders(interpolated.audience, options),
  };
}

function expandKvRows(
  rows: readonly CollectionKvRow[],
  vars: Record<string, string>,
  options: ExpandPlaceholderOptions,
): CollectionKvRow[] {
  return interpolateKvRows(rows, vars).map((row) => ({
    ...row,
    key: expandPlaceholders(row.key, options),
    value: expandPlaceholders(row.value, options),
  }));
}

export function nearestFolderId(tree: CollectionTree, nodeId: string): string | null {
  const path = findNodePath(tree, nodeId);
  if (!path)
    return null;
  for (let index = path.length - 2; index >= 0; index -= 1) {
    const node = path[index];
    if (node?.kind === 'folder')
      return node.id;
  }
  return null;
}

export function planHttpSend(input: {
  readonly tree: CollectionTree;
  readonly nodeId: string;
  readonly method: string;
  readonly url: string;
  readonly pathParams?: readonly CollectionKvRow[];
  readonly params: readonly CollectionKvRow[];
  readonly headers: readonly CollectionKvRow[];
  readonly body: string | RequestBody;
  readonly authMode: RequestAuthMode;
  readonly requestAuth: CollectionFolderAuth;
  readonly requestScripts?: { readonly preRequest: string; readonly postResponse: string };
  readonly requestSettings?: Partial<CollectionFolderSettings>;
  readonly abortId?: string;
  readonly envVars: Readonly<Record<string, string>>;
  readonly defaultHeaders?: readonly CollectionKvRow[];
  readonly emailDomain?: string;
  readonly jarCookies?: readonly CollectionCookie[];
  readonly workspaceVerifyTls?: boolean;
  readonly now?: Date;
  readonly uuid?: () => string;
}): HttpSendPlan {
  const configs = ancestorFolderConfigs(input.tree, input.nodeId);
  const merged = mergeFolderConfigs(configs);
  const settings = mergeRequestSettings(merged.settings, input.requestSettings);
  const expandOptions: ExpandPlaceholderOptions = {
    now: input.now,
    emailDomain: input.emailDomain,
    uuid: input.uuid,
  };
  const rawVars = {
    ...input.envVars,
    ...variableMapFromRows(merged.variables),
  };
  const vars = expandPlaceholderMap(rawVars, expandOptions);
  const displayDefaults = interpolateKvRows(input.defaultHeaders ?? [], rawVars);
  const displayFolderHeaders = interpolateKvRows(merged.headers, rawVars);
  const defaultHeaders = expandKvRows(input.defaultHeaders ?? [], vars, expandOptions);
  const inheritedHeaders = expandKvRows(merged.headers, vars, expandOptions);
  const inheritedParams = expandKvRows(merged.params, vars, expandOptions);
  const requestHeaders = expandKvRows(input.headers, vars, expandOptions);
  const requestParams = expandKvRows(input.params, vars, expandOptions);
  const pathParams = expandKvRows(input.pathParams ?? [], vars, expandOptions);
  const headerMap = new Map<string, CollectionKvRow>();
  for (const row of overlayRows(defaultHeaders, inheritedHeaders))
    headerMap.set(row.key.trim().toLowerCase(), row);
  for (const row of requestHeaders.filter((item) => item.enabled && item.key.trim()))
    headerMap.set(row.key.trim().toLowerCase(), row);

  const encoded =
    typeof input.body === 'string'
      ? { text: input.body, contentType: null as string | null }
      : encodeRequestBody(input.body);
  if (encoded.contentType && !headerMap.has('content-type')) {
    headerMap.set('content-type', {
      id: 'content-type',
      enabled: true,
      key: 'Content-Type',
      value: encoded.contentType,
      description: '',
    });
  }

  const expandedUrl = expandText(input.url, vars, expandOptions);
  const withPath = applyPathParams(expandedUrl, pathParams);
  const url = ensureRequestUrlScheme(
    applyQueryToUrl(withPath, [...inheritedParams, ...requestParams.filter((row) => row.enabled && row.key.trim())]),
  );
  const inheritedAuth = expandAuth(merged.auth, vars, expandOptions);
  const resolved = resolvedAuth(input.authMode, input.requestAuth, merged.auth);
  const auth = expandAuth(resolved, vars, expandOptions);
  const preRequest = [
    ...configs.map((config) => config.scripts.preRequest),
    input.requestScripts?.preRequest ?? '',
  ].filter((block) => block.trim());
  const postResponse = [
    input.requestScripts?.postResponse ?? '',
    ...[...configs].reverse().map((config) => config.scripts.postResponse),
  ].filter((block) => block.trim());
  const storeCookies = settings.storeCookies;

  return {
    payload: {
      method: input.method,
      url,
      headers: [...headerMap.values()].map((row) => ({ key: row.key, value: row.value })),
      body: expandText(encoded.text, vars, expandOptions),
      followRedirects: settings.followRedirects,
      verifyTls: effectiveVerifyTls(settings, input.workspaceVerifyTls ?? true),
      timeoutMs: settings.timeoutMs,
      sendCookies: settings.sendCookies,
      cookies: settings.sendCookies ? overlayCookies(settings.cookies, input.jarCookies ?? []) : [],
      auth,
      preRequest,
      postResponse,
      variables: vars,
      abortId: input.abortId,
    },
    storeCookies,
    inheritedHeaders: overlayRows(displayDefaults, displayFolderHeaders),
    inheritedParams: interpolateKvRows(merged.params, rawVars),
    inheritedAuth,
    needsRefresh: auth.type === 'oauth2' && oauthTokenExpired(auth.expiresAt) && !!auth.refreshToken.trim(),
  };
}
