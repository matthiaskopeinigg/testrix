import { describe, expect, it } from 'vitest';

import type { HistoryItem } from '../config/history.schema';

import { filterHistoryByStatus, sortHistoryItems } from './history-sidebar-view';

const baseItem = (patch: Partial<HistoryItem>): HistoryItem => ({
  id: patch.id ?? '1',
  label: patch.label ?? 'x',
  method: patch.method ?? 'GET',
  url: patch.url ?? '/',
  requestedAt: patch.requestedAt ?? '2026-01-02T12:00:00.000Z',
  ...patch,
});

describe('filterHistoryByStatus', () => {
  it('keeps items without a response for no-response filter', () => {
    const items = [baseItem({ id: 'a' }), baseItem({ id: 'b', snapshot: undefined })];
    expect(filterHistoryByStatus(items, 'no-response').map((i) => i.id)).toEqual(['a', 'b']);
    expect(filterHistoryByStatus(items, 'all')).toHaveLength(2);
  });
});

describe('sortHistoryItems', () => {
  it('sorts by newest first', () => {
    const items = [
      baseItem({ id: 'old', requestedAt: '2026-01-01T12:00:00.000Z' }),
      baseItem({ id: 'new', requestedAt: '2026-01-03T12:00:00.000Z' }),
    ];
    expect(sortHistoryItems(items, 'date-new').map((i) => i.id)).toEqual(['new', 'old']);
  });
});
