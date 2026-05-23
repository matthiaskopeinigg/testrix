import type { MockServerEndpoint, MockResponse } from '@shared/testing';
import type { CollectionRequestBody } from '@shared/config';
import type { MockServerTabSectionId } from '@shared/config';

import type { TxIconName } from '@app/shared/icons/tx-icon.registry';

import { formatRequestBodyModeLabel } from '../../workspace/request-workspace-tab/request-tab-overview-summary';

export interface MockServerOverviewConfigCard {
  readonly section: MockServerTabSectionId;
  readonly label: string;
  readonly value: string;
  readonly icon: TxIconName;
}

/** Short label for the mock response body mode. */
export function formatMockResponseBodyLabel(body: MockResponse['body']): string {
  return formatRequestBodyModeLabel(body as CollectionRequestBody);
}

/** Builds jump cards for the mock endpoint overview configuration grid. */
export function buildMockServerOverviewConfigCards(
  endpoint: MockServerEndpoint,
): readonly MockServerOverviewConfigCard[] {
  const totalMatchers = endpoint.matchers.length;
  const enabledMatchers = endpoint.matchers.filter((m) => m.enabled).length;
  const matchersValue =
    totalMatchers === 0
      ? 'No matchers configured'
      : `${enabledMatchers} of ${totalMatchers} matcher${totalMatchers === 1 ? '' : 's'} enabled`;

  const { response } = endpoint;
  const bodyLabel = formatMockResponseBodyLabel(response.body);
  const responseValue = `${response.statusCode} · ${response.latencyMs} ms · ${bodyLabel}`;

  const advancedValue =
    endpoint.priority > 0
      ? `Priority ${endpoint.priority}`
      : 'Default routing priority';

  return [
    { section: 'matchers', label: 'Matchers', value: matchersValue, icon: 'filter' },
    { section: 'response', label: 'Response', value: responseValue, icon: 'api' },
    { section: 'advanced', label: 'Advanced', value: advancedValue, icon: 'settings' },
  ];
}
