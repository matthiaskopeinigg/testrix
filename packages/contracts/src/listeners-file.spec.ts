import { describe, expect, it } from 'vitest';

import {
  LISTENER_ACTIVITY_MAX,
  emptyListenerArtifact,
  parseListenersFile,
  prependListenerActivity,
  type ListenerActivityEntry,
} from './listeners-file';

function entry(partial: Partial<ListenerActivityEntry> = {}): ListenerActivityEntry {
  return {
    id: partial.id ?? 'hit_1',
    at: partial.at ?? 1,
    method: partial.method ?? 'GET',
    url: partial.url ?? 'https://example.com/',
    status: partial.status ?? 200,
    resourceType: partial.resourceType,
    requestHeaders: partial.requestHeaders ?? {},
    headers: partial.headers ?? {},
    requestBody: partial.requestBody ?? '',
    body: partial.body ?? '',
  };
}

describe('prependListenerActivity', () => {
  it('keeps newest first and caps length', () => {
    const seed = Array.from({ length: LISTENER_ACTIVITY_MAX }, (_, index) =>
      entry({ id: `old_${index}`, at: index, url: `https://example.com/${index}` }),
    );
    const next = prependListenerActivity(seed, entry({ id: 'new', at: 999, url: 'https://example.com/new' }));
    expect(next[0]?.id).toBe('new');
    expect(next).toHaveLength(LISTENER_ACTIVITY_MAX);
    expect(next.some((item) => item.id === `old_${LISTENER_ACTIVITY_MAX - 1}`)).toBe(false);
  });
});

describe('parseListenersFile activity', () => {
  it('round-trips activity on artifacts', () => {
    const artifact = emptyListenerArtifact('Capture');
    const withHits = {
      ...artifact,
      activity: [entry({ id: 'a1', method: 'POST', url: 'https://api.example/x', status: 204 })],
    };
    const parsed = parseListenersFile({ items: [withHits] });
    const node = parsed.items[0];
    expect(node?.kind).toBe('artifact');
    if (node?.kind !== 'artifact')
      return;
    expect(node.activity).toHaveLength(1);
    expect(node.activity[0]?.method).toBe('POST');
    expect(node.activity[0]?.status).toBe(204);
  });

  it('defaults missing activity to an empty list', () => {
    const parsed = parseListenersFile({
      items: [{ kind: 'artifact', id: 'l1', name: 'L', updatedAt: '', mode: 'browser' }],
    });
    const node = parsed.items[0];
    expect(node?.kind).toBe('artifact');
    if (node?.kind !== 'artifact')
      return;
    expect(node.activity).toEqual([]);
  });
});
