import { describe, expect, it } from 'vitest';

import { escapeHtml, fileSlug, formatClockDuration, formatDurationMs } from './text-format';

describe('text-format', () => {
  it('escapes html metacharacters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });

  it('builds file slugs with a fallback', () => {
    expect(fileSlug('  My Suite #1 ', 'regression')).toBe('my-suite-1');
    expect(fileSlug('!!!', 'diagram')).toBe('diagram');
  });

  it('formats durations by magnitude', () => {
    expect(formatDurationMs(850.4)).toBe('850ms');
    expect(formatDurationMs(2400)).toBe('2.4s');
    expect(formatDurationMs(90_000)).toBe('1.5m');
    expect(formatClockDuration(20_400)).toBe('20s');
    expect(formatClockDuration(80_000)).toBe('1m 20s');
  });
});
