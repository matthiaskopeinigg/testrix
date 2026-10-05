import { describe, expect, it } from 'vitest';

import {
  formatHistoryBody,
  formatHistoryHeaders,
  historyFinishedAt,
  historyStatusTone,
  parseHistoryQueryParams,
  shortHistoryId,
} from './history-display';

describe('history-display', () => {
  it('maps status classes to tones', () => {
    expect(historyStatusTone(200, null)).toBe('ok');
    expect(historyStatusTone(301, null)).toBe('info');
    expect(historyStatusTone(404, null)).toBe('warn');
    expect(historyStatusTone(500, null)).toBe('err');
    expect(historyStatusTone(0, 'timeout')).toBe('err');
  });

  it('parses query params from absolute and relative urls', () => {
    expect(parseHistoryQueryParams('https://api.local/orders?limit=25&q=paid')).toEqual([
      { key: 'limit', value: '25' },
      { key: 'q', value: 'paid' },
    ]);
    expect(parseHistoryQueryParams('/shop?id=1')).toEqual([{ key: 'id', value: '1' }]);
    expect(parseHistoryQueryParams('https://api.local/health')).toEqual([]);
  });

  it('pretty-prints json bodies', () => {
    expect(formatHistoryBody('{"ok":true}')).toBe('{\n  "ok": true\n}');
    expect(formatHistoryBody('not-json')).toBe('not-json');
  });

  it('pretty-prints xml bodies', () => {
    expect(formatHistoryBody('<root><a>1</a></root>', 'application/xml')).toContain('<root>');
    expect(formatHistoryBody('<root><a>1</a></root>', 'application/xml')).toContain('\n');
  });

  it('derives finished time and short ids', () => {
    expect(historyFinishedAt('2026-03-12T10:00:00.000Z', 1500)).toBe('2026-03-12T10:00:01.500Z');
    expect(shortHistoryId('abcdefghijklmnop')).toBe('abcdefgh');
  });

  it('formats headers for clipboard copy in stored order', () => {
    expect(
      formatHistoryHeaders([
        { key: 'Accept', value: '*/*' },
        { key: '  ', value: 'skip' },
        { key: 'User-Agent', value: 'Testrix/2.0' },
      ]),
    ).toBe('Accept: */*\nUser-Agent: Testrix/2.0');
  });
});
