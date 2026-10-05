import { describe, expect, it } from 'vitest';

import {
  HISTORY_MAX_ENTRIES,
  capBody,
  filterHistoryEntries,
  groupHistoryEntries,
  historyDayLabel,
  historyStatusClass,
  parseHistoryFile,
  prependHistoryEntry,
  prependRequestRun,
  redactSnapshot,
  type HistoryEntry,
} from './history';

describe('parseHistoryFile', () => {
  it('returns an empty list for garbage input', () => {
    expect(parseHistoryFile(null).entries).toEqual([]);
    expect(parseHistoryFile({ entries: 'nope' }).entries).toEqual([]);
  });
});

describe('history append', () => {
  it('redacts secrets and caps bodies', () => {
    const snapshot = redactSnapshot({
      id: 'r1',
      at: '2026-01-01T00:00:00.000Z',
      method: 'GET',
      url: 'https://api.local',
      status: 200,
      statusText: 'OK',
      durationMs: 12,
      sizeLabel: '2 B',
      error: null,
      requestHeaders: [{ key: 'Authorization', value: 'Bearer live-token' }],
      requestBody: 'x'.repeat(40_000),
      responseHeaders: [{ key: 'Set-Cookie', value: 'sid=abc' }],
      responseBody: 'ok',
    });
    expect(snapshot.requestHeaders[0]?.value).toBe('••••');
    expect(snapshot.responseHeaders[0]?.value).toBe('••••');
    expect(snapshot.requestBody.length).toBeLessThan(40_000);
    expect(snapshot.requestBody).toContain('truncated');
  });

  it('prepends and caps the list', () => {
    const file = parseHistoryFile({ entries: [] });
    const base = {
      at: '2026-01-01T00:00:00.000Z',
      method: 'GET' as const,
      url: 'https://api.local',
      status: 200,
      statusText: 'OK',
      durationMs: 1,
      sizeLabel: '1 B',
      error: null,
      requestHeaders: [],
      requestBody: '',
      responseHeaders: [],
      responseBody: '',
      requestId: 'http-1',
      requestName: 'Login',
      workspaceId: 'ws_1',
    };
    let next = file;
    for (let index = 0; index < HISTORY_MAX_ENTRIES + 5; index += 1) {
      next = prependHistoryEntry(next, { ...base, id: `h${index}` });
    }
    expect(next.entries).toHaveLength(HISTORY_MAX_ENTRIES);
    expect(next.entries[0]?.id).toBe(`h${HISTORY_MAX_ENTRIES + 4}`);
  });

  it('keeps twenty request runs', () => {
    const runs = prependRequestRun([], {
      id: 'a',
      at: '2026-01-01T00:00:00.000Z',
      method: 'GET',
      url: '/',
      status: 200,
      statusText: 'OK',
      durationMs: 1,
      sizeLabel: '1 B',
      error: null,
      requestHeaders: [],
      requestBody: '',
      responseHeaders: [],
      responseBody: '',
      httpVersion: 'HTTP/2.0',
      timing: {
        dnsMs: 1,
        tcpMs: 2,
        tlsMs: 3,
        ttfbMs: 4,
        downloadMs: 5,
        redirectsMs: 6,
        otherMs: 0,
        totalMs: 21,
      },
      redirects: [{ status: 301, url: 'https://a.example', location: 'https://b.example', durationMs: 6 }],
    });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.timing?.dnsMs).toBe(1);
    expect(runs[0]?.redirects).toHaveLength(1);
    expect(runs[0]?.httpVersion).toBe('HTTP/2.0');
    expect(capBody('abcd', 2)).toContain('truncated');
  });
});

describe('history sidebar query', () => {
  const now = new Date(2026, 8, 17, 22).getTime();

  it('labels today and yesterday from a frozen clock', () => {
    expect(historyDayLabel(new Date(2026, 8, 17, 9).toISOString(), now)).toBe('Today');
    expect(historyDayLabel(new Date(2026, 8, 16, 9).toISOString(), now)).toBe('Yesterday');
  });

  it('maps status and transport errors into filter classes', () => {
    expect(historyStatusClass(204, null)).toBe('ok');
    expect(historyStatusClass(301, null)).toBe('redirect');
    expect(historyStatusClass(404, null)).toBe('client');
    expect(historyStatusClass(503, null)).toBe('server');
    expect(historyStatusClass(0, 'socket hang up')).toBe('error');
  });

  it('filters by search, method, and status class', () => {
    const entries = [
      entry({ id: 'a', method: 'GET', url: 'https://api.local/users', status: 200 }),
      entry({ id: 'b', method: 'POST', url: 'https://api.local/login', status: 401 }),
      entry({ id: 'c', method: 'GET', url: 'https://api.local/health', status: 503 }),
    ];
    expect(filterHistoryEntries(entries, { query: 'login', methods: [], statusClasses: [] }).map((item) => item.id)).toEqual(['b']);
    expect(filterHistoryEntries(entries, { query: '', methods: ['GET'], statusClasses: [] }).map((item) => item.id)).toEqual(['a', 'c']);
    expect(filterHistoryEntries(entries, { query: '', methods: [], statusClasses: ['client'] }).map((item) => item.id)).toEqual(['b']);
  });

  it('groups by method in catalog order', () => {
    const entries = [
      entry({ id: 'a', method: 'POST', status: 201 }),
      entry({ id: 'b', method: 'GET', status: 200 }),
      entry({ id: 'c', method: 'POST', status: 400 }),
    ];
    expect(groupHistoryEntries(entries, 'method').map((group) => group.id)).toEqual(['GET', 'POST']);
    expect(groupHistoryEntries(entries, 'status').map((group) => group.label)).toEqual(['2xx', '4xx']);
  });
});

function entry(patch: Partial<HistoryEntry> & Pick<HistoryEntry, 'id'>): HistoryEntry {
  return {
    at: '2026-09-17T10:00:00.000Z',
    method: 'GET',
    url: 'https://api.local',
    status: 200,
    statusText: 'OK',
    durationMs: 1,
    sizeLabel: '1 B',
    error: null,
    requestHeaders: [],
    requestBody: '',
    responseHeaders: [],
    responseBody: '',
    requestId: 'http-1',
    requestName: 'Ping',
    workspaceId: 'ws_1',
    ...patch,
  };
}
