import { describe, expect, it } from 'vitest';

import { flowBrowserOpenUrlCandidates, resolveFlowBrowserOpenUrl } from './flow-open-url';

describe('flow-open-url', () => {
  it('adds https for bare hosts', () => {
    expect(resolveFlowBrowserOpenUrl('magenta.at', {})).toBe('https://magenta.at');
    expect(resolveFlowBrowserOpenUrl('example.com/path', {})).toBe('https://example.com/path');
  });

  it('keeps local hosts on http', () => {
    expect(resolveFlowBrowserOpenUrl('localhost:3000', {})).toBe('http://localhost:3000');
  });

  it('interpolates then adds a scheme', () => {
    expect(resolveFlowBrowserOpenUrl('{{host}}/app', { host: 'api.example.com' })).toBe(
      'https://api.example.com/app',
    );
  });

  it('lists www as a DNS fallback candidate', () => {
    expect(flowBrowserOpenUrlCandidates('https://magenta.at')).toEqual([
      'https://magenta.at',
      'https://www.magenta.at',
    ]);
  });
});
