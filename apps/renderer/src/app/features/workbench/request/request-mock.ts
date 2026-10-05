import { newEntityId, type CollectionCookie, type CollectionKvRow, type HttpMethod, type HttpRedirectHop, type HttpTiming } from '@testrix/contracts';

import type { WorkbenchTab } from '../workbench.store';

export interface MockKeyValue {
  readonly id: string;
  readonly key: string;
  readonly value: string;
  readonly enabled: boolean;
  readonly description: string;
  readonly source?: string;
  readonly sourceId?: string;
}

export interface MockResponse {
  readonly status: number;
  readonly statusText: string;
  readonly durationMs: number;
  readonly sizeLabel: string;
  readonly body: string;
  readonly headers: readonly MockKeyValue[];
  readonly url?: string;
  readonly httpVersion?: string;
  readonly timing?: HttpTiming;
  readonly redirects?: readonly HttpRedirectHop[];
  readonly setCookies?: readonly CollectionCookie[];
}

/** Empty trailing row for the KV editor. */
export function emptyMockRow(): MockKeyValue {
  return { id: newEntityId(), key: '', value: '', enabled: true, description: '' };
}

/** True when a row has both a key and a value — required before adding another blank row. */
export function isKvRowFilled(row: Pick<MockKeyValue, 'key' | 'value'>): boolean {
  return Boolean(row.key.trim() && row.value.trim());
}

/** Clones mock rows and ends with one blank row only after the last filled key+value pair. */
export function withTrailingRow(rows: readonly MockKeyValue[]): MockKeyValue[] {
  const copy = rows.map((row) => ({ ...row, description: row.description ?? '' }));
  const last = copy[copy.length - 1];
  if (!last || isKvRowFilled(last))
    copy.push(emptyMockRow());
  return copy;
}

/** Drops trailing blanks so folder/settings JSON stays compact. */
export function persistMockRows(rows: readonly MockKeyValue[]): CollectionKvRow[] {
  return rows
    .filter((row) => row.key.trim() || row.value.trim() || row.description.trim())
    .map((row) => ({
      id: row.id,
      enabled: row.enabled,
      key: row.key,
      value: row.value,
      description: row.description,
    }));
}

function slugFromTab(tab: WorkbenchTab): string {
  return tab.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'item';
}

function statusText(status: number): string {
  switch (status) {
    case 200:
      return 'OK';
    case 201:
      return 'Created';
    case 204:
      return 'No Content';
    case 400:
      return 'Bad Request';
    case 401:
      return 'Unauthorized';
    case 404:
      return 'Not Found';
    case 500:
      return 'Internal Server Error';
    default:
      return 'OK';
  }
}

/**
 * Builds mock query params for an HTTP tab.
 */
export function buildMockParams(tab: WorkbenchTab): MockKeyValue[] {
  const slug = slugFromTab(tab);
  return [
    { id: `${tab.id}-p1`, key: 'limit', value: '25', enabled: true, description: '' },
    { id: `${tab.id}-p2`, key: 'cursor', value: '', enabled: false, description: '' },
    { id: `${tab.id}-p3`, key: 'q', value: slug, enabled: true, description: '' },
  ];
}

/**
 * Builds mock request headers for an HTTP tab.
 */
export function buildMockHeaders(tab: WorkbenchTab): MockKeyValue[] {
  return [
    { id: `${tab.id}-h1`, key: 'Accept', value: 'application/json', enabled: true, description: '' },
    { id: `${tab.id}-h2`, key: 'Content-Type', value: 'application/json', enabled: true, description: '' },
    {
      id: `${tab.id}-h3`,
      key: 'Authorization',
      value: 'Bearer tx_mock_4f8c2a91e0b3',
      enabled: true,
      description: '',
    },
    { id: `${tab.id}-h4`, key: 'User-Agent', value: 'Testrix/2.0', enabled: true, description: '' },
  ];
}

/**
 * Builds a mock request body string for the given method.
 */
export function buildMockBody(method: HttpMethod | undefined, tab: WorkbenchTab): string {
  if (!method || method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return '';
  }
  const slug = slugFromTab(tab);
  if (method === 'DELETE') {
    return `{\n  "confirm": true,\n  "id": "${slug}"\n}`;
  }
  return `{
  "name": "${tab.title}",
  "slug": "${slug}",
  "active": true,
  "meta": {
    "source": "testrix-mock"
  }
}`;
}

/**
 * Builds mock auth fields for the Auth sub-tab.
 */
export function buildMockAuth(tab: WorkbenchTab): MockKeyValue[] {
  return [
    {
      id: `${tab.id}-a1`,
      key: 'Type',
      value: 'Bearer Token',
      enabled: true,
      description: '',
    },
    {
      id: `${tab.id}-a2`,
      key: 'Token',
      value: 'tx_mock_4f8c2a91e0b3',
      enabled: true,
      description: '',
    },
  ];
}

/**
 * Builds a mock HTTP response for Send.
 */
export function buildMockResponse(tab: WorkbenchTab): MockResponse {
  const status = tab.status ?? 200;
  const slug = slugFromTab(tab);
  const body = `{
  "ok": ${status < 400},
  "status": ${status},
  "data": {
    "id": "${slug}-01",
    "name": "${tab.title}",
    "updatedAt": "2026-09-15T17:42:11.000Z"
  },
  "requestId": "req_mock_${slug.slice(0, 8)}"
}`;

  return {
    status,
    statusText: statusText(status),
    durationMs: 48 + (slug.length % 70),
    sizeLabel: `${new Blob([body]).size} B`,
    body,
    headers: [
      { id: `${tab.id}-rh1`, key: 'content-type', value: 'application/json; charset=utf-8', enabled: true, description: '' },
      { id: `${tab.id}-rh2`, key: 'x-request-id', value: `req_mock_${slug.slice(0, 8)}`, enabled: true, description: '' },
      { id: `${tab.id}-rh3`, key: 'cache-control', value: 'no-store', enabled: true, description: '' },
    ],
  };
}
