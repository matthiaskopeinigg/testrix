import { describe, expect, it } from 'vitest';

import { createDefaultHistory } from '../config/defaults';
import { appendMockHitToHistory, buildMockResponseSnapshot } from './append-mock-hit-to-history';
import { parseIncomingMockRequest } from '../testing/mock-server-match';

describe('appendMockHitToHistory', () => {
  it('appends matched and unmatched labels', () => {
    const file = createDefaultHistory();
    const request = parseIncomingMockRequest({
      method: 'GET',
      url: '/missing',
      headers: {},
    });
    const snapshot = buildMockResponseSnapshot({
      request,
      statusCode: 404,
      responseText: '{}',
      responseHeaders: { 'content-type': 'application/json' },
      durationMs: 1,
      matched: false,
    });
    const { file: next, itemId } = appendMockHitToHistory(file, {
      request,
      snapshot,
      matched: false,
    });
    expect(itemId).toBeTruthy();
    expect(next.items).toHaveLength(1);
    expect(next.items[0]?.label).toContain('MOCK ✕');
  });
});
