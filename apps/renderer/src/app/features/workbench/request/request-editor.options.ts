import type { ConnectedPosition } from '@angular/cdk/overlay';

import { REQUEST_BODY_MODES, REQUEST_TAB_SECTIONS, type OAuthGrantType, type RequestTabSection } from '@testrix/contracts';
import type { TxSelectOption } from '@testrix/ui';

export type SendState = 'idle' | 'sending' | 'done';
export type OverlayKind = 'preview' | 'code' | null;
export type ScriptPane = 'pre' | 'post';

export interface ScriptSnippet {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly pane: ScriptPane | 'both';
  readonly code: string;
}

export const SCRIPT_SNIPPETS: readonly ScriptSnippet[] = [
  {
    id: 'set-var',
    label: 'Set a variable',
    detail: 'tx.variables.set',
    pane: 'both',
    code: `tx.variables.set('token', 'value');\n`,
  },
  {
    id: 'get-var',
    label: 'Get a variable',
    detail: 'tx.variables.get',
    pane: 'both',
    code: `const token = tx.variables.get('token');\n`,
  },
  {
    id: 'add-header',
    label: 'Add a header',
    detail: 'tx.request.addHeader',
    pane: 'pre',
    code: `tx.request.addHeader('X-Request-Id', tx.variables.get('requestId') || '1');\n`,
  },
  {
    id: 'set-url',
    label: 'Set request URL',
    detail: 'tx.request.url',
    pane: 'pre',
    code: `tx.request.url = tx.request.url.replace('{{host}}', tx.variables.get('host'));\n`,
  },
  {
    id: 'set-body',
    label: 'Set JSON body',
    detail: 'tx.request.body',
    pane: 'pre',
    code: `tx.request.body = JSON.stringify({\n  ok: true,\n});\n`,
  },
  {
    id: 'status-200',
    label: 'Status is 200',
    detail: 'pm.test',
    pane: 'post',
    code: `pm.test('Status is 200', () => {\n  if (pm.response.code !== 200)\n    throw new Error('unexpected status ' + pm.response.code);\n});\n`,
  },
  {
    id: 'parse-json',
    label: 'Parse JSON body',
    detail: 'pm.response.json',
    pane: 'post',
    code: `const json = pm.response.json();\n`,
  },
  {
    id: 'save-id',
    label: 'Save a JSON field',
    detail: 'pm.variables.set',
    pane: 'post',
    code: `const json = pm.response.json();\nif (json && json.id)\n  pm.variables.set('id', json.id);\n`,
  },
  {
    id: 'header-exists',
    label: 'Response header exists',
    detail: 'pm.response.headers',
    pane: 'post',
    code: `const hasJson = pm.response.headers.some((row) => {\n  return row.key.toLowerCase() === 'content-type' && String(row.value).includes('json');\n});\nif (!hasJson)\n  throw new Error('expected JSON content-type');\n`,
  },
];

export const PRE_SCRIPT_PLACEHOLDER = '// Runs before Send\ntx.request.addHeader(\'X-Client\', \'testrix\');';
export const POST_SCRIPT_PLACEHOLDER = '// Runs after the response\nif (pm.response.code !== 200)\n  throw new Error(\'unexpected status\');';

export interface RequestSection {
  readonly id: RequestTabSection;
  readonly label: string;
}

export const SECTIONS: readonly RequestSection[] = REQUEST_TAB_SECTIONS.map((id) => ({
  id,
  label: id === 'params' ? 'Params' : id.charAt(0).toUpperCase() + id.slice(1),
}));

export const COMPLETE_POSITIONS: ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
];

export const AUTH_MODE_OPTIONS: readonly TxSelectOption[] = [
  { value: 'inherit', label: 'Inherit folder' },
  { value: 'none', label: 'No auth' },
  { value: 'bearer', label: 'Bearer token' },
  { value: 'basic', label: 'Basic' },
  { value: 'apikey', label: 'API key' },
  { value: 'digest', label: 'Digest' },
  { value: 'oauth2', label: 'OAuth 2.0' },
];

export const BODY_MODE_OPTIONS: readonly TxSelectOption[] = REQUEST_BODY_MODES.map((value) => ({
  value,
  label: value === 'form-data' ? 'Form data' : value === 'urlencoded' ? 'URL encoded' : value.toUpperCase() === value ? value : value.charAt(0).toUpperCase() + value.slice(1),
}));

export const SNIPPET_LANGS: readonly TxSelectOption[] = [
  { value: 'curl', label: 'cURL' },
  { value: 'fetch', label: 'Fetch' },
  { value: 'httpie', label: 'HTTPie' },
];

export const GRANT_LABELS: Record<OAuthGrantType, string> = {
  authorization_code: 'Authorization code',
  client_credentials: 'Client credentials',
  password: 'Password',
  device_code: 'Device code',
};

export const DIFF_CURRENT = '__current__';
