import type { HttpMethod } from '@testrix/contracts';

import type { WorkbenchTab } from './workbench.store';

export interface MockKeyValue {
  readonly id: string;
  readonly key: string;
  readonly value: string;
  readonly enabled: boolean;
}

export interface MockResponse {
  readonly status: number;
  readonly statusText: string;
  readonly durationMs: number;
  readonly sizeLabel: string;
  readonly body: string;
  readonly headers: readonly MockKeyValue[];
}

export interface MockWsMessage {
  readonly id: string;
  readonly direction: 'in' | 'out';
  readonly body: string;
  readonly at: string;
}

let rowSeq = 0;

/** Empty trailing row for the KV editor. */
export function emptyMockRow(): MockKeyValue {
  rowSeq += 1;
  return { id: `kv-new-${rowSeq}`, key: '', value: '', enabled: true };
}

/** Clones mock rows and always ends with one blank row. */
export function withTrailingRow(rows: readonly MockKeyValue[]): MockKeyValue[] {
  const copy = rows.map((row) => ({ ...row }));
  const last = copy[copy.length - 1];
  if (!last || last.key.trim() || last.value.trim()) {
    copy.push(emptyMockRow());
  }
  return copy;
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
    { id: `${tab.id}-p1`, key: 'limit', value: '25', enabled: true },
    { id: `${tab.id}-p2`, key: 'cursor', value: '', enabled: false },
    { id: `${tab.id}-p3`, key: 'q', value: slug, enabled: true },
  ];
}

/**
 * Builds mock request headers for an HTTP tab.
 */
export function buildMockHeaders(tab: WorkbenchTab): MockKeyValue[] {
  return [
    { id: `${tab.id}-h1`, key: 'Accept', value: 'application/json', enabled: true },
    { id: `${tab.id}-h2`, key: 'Content-Type', value: 'application/json', enabled: true },
    {
      id: `${tab.id}-h3`,
      key: 'Authorization',
      value: 'Bearer tx_mock_4f8c2a91e0b3',
      enabled: true,
    },
    { id: `${tab.id}-h4`, key: 'User-Agent', value: 'Testrix/2.0', enabled: true },
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
    },
    {
      id: `${tab.id}-a2`,
      key: 'Token',
      value: 'tx_mock_4f8c2a91e0b3',
      enabled: true,
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
      { id: `${tab.id}-rh1`, key: 'content-type', value: 'application/json; charset=utf-8', enabled: true },
      { id: `${tab.id}-rh2`, key: 'x-request-id', value: `req_mock_${slug.slice(0, 8)}`, enabled: true },
      { id: `${tab.id}-rh3`, key: 'cache-control', value: 'no-store', enabled: true },
    ],
  };
}

/**
 * Builds mock WebSocket message history.
 */
export function buildMockWsMessages(tab: WorkbenchTab): MockWsMessage[] {
  const channel = slugFromTab(tab);
  return [
    {
      id: `${tab.id}-m1`,
      direction: 'out',
      body: `{ "type": "subscribe", "channel": "${channel}" }`,
      at: '17:41:02',
    },
    {
      id: `${tab.id}-m2`,
      direction: 'in',
      body: `{ "type": "ack", "channel": "${channel}", "ok": true }`,
      at: '17:41:02',
    },
    {
      id: `${tab.id}-m3`,
      direction: 'in',
      body: `{ "type": "event", "channel": "${channel}", "payload": { "n": 1 } }`,
      at: '17:41:05',
    },
  ];
}
