import {
  HTTP_METHOD_IDS,
  HTTP_REQUEST_SECTION_IDS,
  HTTP_RESPONSE_TAB_ON_SEND_IDS,
  HTTP_URL_SCHEME_IDS,
  type HttpMethodId,
  type HttpRequestSectionId,
  type HttpResponseTabOnSendId,
  type HttpUrlSchemeId,
} from '@shared/config';

import type { TxDropdownOption } from '../../tx-dropdown/tx-dropdown.types';

export const HTTP_METHOD_OPTIONS: readonly TxDropdownOption[] = HTTP_METHOD_IDS.map((id) => ({
  value: id,
  label: id,
}));

export const HTTP_URL_SCHEME_OPTIONS: readonly TxDropdownOption<HttpUrlSchemeId>[] =
  HTTP_URL_SCHEME_IDS.map((id) => ({
    value: id,
    label: id.toUpperCase(),
  }));

const REQUEST_SECTION_LABELS: Record<HttpRequestSectionId, string> = {
  overview: 'Overview',
  params: 'Params',
  auth: 'Authorization',
  headers: 'Headers',
  body: 'Body',
  scripts: 'Scripts',
  settings: 'Settings',
  docs: 'Docs',
  response: 'Response',
};

export const HTTP_REQUEST_SECTION_OPTIONS: readonly TxDropdownOption[] = HTTP_REQUEST_SECTION_IDS.map(
  (id) => ({
    value: id,
    label: REQUEST_SECTION_LABELS[id],
  }),
);

const RESPONSE_TAB_ON_SEND_LABELS: Record<HttpResponseTabOnSendId, string> = {
  body: 'Pretty',
  raw: 'Raw',
  headers: 'Headers',
  timeline: 'Timeline',
  preview: 'Preview',
  diff: 'Diff',
};

export const HTTP_RESPONSE_TAB_ON_SEND_OPTIONS: readonly TxDropdownOption<HttpResponseTabOnSendId>[] =
  HTTP_RESPONSE_TAB_ON_SEND_IDS.map((id) => ({
    value: id,
    label: RESPONSE_TAB_ON_SEND_LABELS[id],
  }));

export function httpMethodLabel(id: HttpMethodId): string {
  return id;
}

