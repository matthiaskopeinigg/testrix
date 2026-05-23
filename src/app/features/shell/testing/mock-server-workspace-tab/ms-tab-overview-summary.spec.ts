import { describe, expect, it } from 'vitest';

import { createDefaultMockServerEndpoint } from '../../../../../../shared/testing/mock-server.schema';

import { buildMockServerOverviewConfigCards } from './ms-tab-overview-summary';

describe('buildMockServerOverviewConfigCards', () => {
  it('summarizes matchers, response, and advanced settings', () => {
    const endpoint = createDefaultMockServerEndpoint('e1', 'Users', '2020-01-01T00:00:00.000Z');
    const cards = buildMockServerOverviewConfigCards(endpoint);

    expect(cards).toHaveLength(3);
    expect(cards[0]?.section).toBe('matchers');
    expect(cards[0]?.value).toContain('No matchers');
    expect(cards[1]?.section).toBe('response');
    expect(cards[1]?.value).toContain('200');
    expect(cards[2]?.section).toBe('advanced');
  });
});
