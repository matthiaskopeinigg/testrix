import type {
  CollectionFolderAuth,
  CollectionRequestBody,
  CollectionRequestPathParam,
  CollectionRequestSettings,
  HttpKeyValueRow,
  HttpRequestSectionId,
} from '@shared/config';

import type { TxIconName } from '@app/shared/icons/tx-icon.registry';

export interface RequestOverviewFolderVariable {
  readonly source: string;
  readonly key: string;
}

/** @deprecated Use {@link RequestOverviewFolderVariable}. */
export type RequestOverviewInheritedVariable = RequestOverviewFolderVariable;

export interface RequestOverviewConfigCard {
  readonly section: HttpRequestSectionId;
  readonly label: string;
  readonly value: string;
  readonly icon: TxIconName;
}

const BODY_MODE_LABELS: Record<CollectionRequestBody['mode'], string> = {
  none: 'No body',
  json: 'JSON',
  text: 'Text',
  html: 'HTML',
  xml: 'XML',
  'form-data': 'Form data',
  'x-www-form-urlencoded': 'URL encoded',
  binary: 'Binary',
  graphql: 'GraphQL',
};

/** Human-readable label for the request body mode. */
export function formatRequestBodyModeLabel(body: CollectionRequestBody): string {
  return BODY_MODE_LABELS[body.mode] ?? body.mode;
}

/** Counts enabled key/value rows with a non-empty key. */
export function countEnabledKeyValueRows(rows: readonly HttpKeyValueRow[]): number {
  return rows.filter((row) => row.enabled !== false && row.key.trim().length > 0).length;
}

/** Counts path params with a non-empty key. */
export function countPathParams(rows: readonly CollectionRequestPathParam[]): number {
  return rows.filter((row) => row.key.trim().length > 0).length;
}

/** Short auth label for overview cards. */
export function formatRequestAuthLabel(auth: CollectionFolderAuth): string {
  if (auth.type === 'inherit') {
    return 'Inherit from folder';
  }
  if (auth.type === 'none') {
    return 'No auth';
  }
  if (auth.type === 'bearer') {
    return 'Bearer token';
  }
  if (auth.type === 'basic') {
    return 'Basic auth';
  }
  if (auth.type === 'apiKey') {
    return 'API key';
  }
  if (auth.type === 'oauth2') {
    return 'OAuth 2.0';
  }
  return 'Unknown auth';
}

/** Builds jump cards for the configuration grid. */
export function buildRequestOverviewConfigCards(
  settings: CollectionRequestSettings,
): readonly RequestOverviewConfigCard[] {
  const pathCount = countPathParams(settings.pathParams);
  const queryCount = countEnabledKeyValueRows(settings.queryParams);
  const headerCount = countEnabledKeyValueRows(settings.headers.rows);
  const paramsValue =
    pathCount === 0 && queryCount === 0
      ? 'No params configured'
      : `${pathCount} path · ${queryCount} query`;

  const preLen = settings.scripts.pre.trim().length;
  const postLen = settings.scripts.post.trim().length;
  const scriptsValue =
    preLen === 0 && postLen === 0
      ? 'No scripts'
      : `${preLen > 0 ? 'Pre-request' : ''}${preLen > 0 && postLen > 0 ? ' · ' : ''}${postLen > 0 ? 'Post-response' : ''}`;

  const timeoutMs = settings.transport.timeoutMs;
  const settingsValue =
    timeoutMs !== undefined && timeoutMs > 0
      ? `${timeoutMs} ms timeout · ${settings.transport.followRedirects === false ? 'No redirects' : 'Follow redirects'}`
      : settings.transport.followRedirects === false
        ? 'No redirect follow'
        : 'Default transport';

  const docsTrimmed = settings.docs.trim();
  const docsValue = docsTrimmed.length > 0 ? `${docsTrimmed.length} chars documented` : 'No documentation';

  return [
    { section: 'params', label: 'Params', value: paramsValue, icon: 'hash' },
    { section: 'auth', label: 'Auth', value: formatRequestAuthLabel(settings.auth), icon: 'lock' },
    {
      section: 'headers',
      label: 'Headers',
      value: headerCount === 0 ? 'No request headers' : `${headerCount} request header${headerCount === 1 ? '' : 's'}`,
      icon: 'layers',
    },
    { section: 'body', label: 'Body', value: formatRequestBodyModeLabel(settings.body), icon: 'fileText' },
    { section: 'scripts', label: 'Scripts', value: scriptsValue, icon: 'code' },
    { section: 'settings', label: 'Settings', value: settingsValue, icon: 'sliders' },
    { section: 'docs', label: 'Docs', value: docsValue, icon: 'fileText' },
  ];
}
