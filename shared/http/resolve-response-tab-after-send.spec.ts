import { describe, expect, it } from 'vitest';

import type { HttpResponseSnapshot } from './outgoing-request.schema';
import {
  isResponseTabAvailable,
  resolveResponseTabAfterSend,
} from './resolve-response-tab-after-send';

function minimalSnapshot(overrides: Partial<HttpResponseSnapshot> = {}): HttpResponseSnapshot {
  return {
    id: 'run-1',
    capturedAt: new Date().toISOString(),
    requestSummary: { method: 'GET', url: 'https://example.com' },
    status: { code: 200, text: 'OK', ok: true },
    headers: [{ key: 'Content-Type', value: 'text/html' }],
    body: { encoding: 'text', text: '<!DOCTYPE html><html></html>' },
    timing: { totalMs: 10 },
    size: { headersBytes: 0, bodyBytes: 0 },
    redirects: [],
    ...overrides,
  };
}

describe('resolveResponseTabAfterSend', () => {
  it('keeps timeline when sending another HTML response', () => {
    const snapshot = minimalSnapshot();
    expect(
      resolveResponseTabAfterSend({
        currentTab: 'timeline',
        pinnedBaselineId: null,
        snapshot,
        runCount: 2,
        defaultTabOnSend: 'preview',
      }),
    ).toBe('timeline');
  });

  it('uses diff when a baseline is pinned', () => {
    const snapshot = minimalSnapshot();
    expect(
      resolveResponseTabAfterSend({
        currentTab: 'timeline',
        pinnedBaselineId: 'baseline-1',
        snapshot,
        runCount: 2,
        defaultTabOnSend: 'body',
      }),
    ).toBe('diff');
  });

  it('falls back to configured default when preview tab is unavailable', () => {
    const snapshot = minimalSnapshot({
      headers: [{ key: 'Content-Type', value: 'application/json' }],
      body: { encoding: 'text', text: '{}' },
    });
    expect(
      resolveResponseTabAfterSend({
        currentTab: 'preview',
        pinnedBaselineId: null,
        snapshot,
        runCount: 1,
        defaultTabOnSend: 'timeline',
      }),
    ).toBe('timeline');
  });

  it('falls back to pretty when default preview is unavailable', () => {
    const snapshot = minimalSnapshot({
      headers: [{ key: 'Content-Type', value: 'application/json' }],
      body: { encoding: 'text', text: '{}' },
    });
    expect(
      resolveResponseTabAfterSend({
        currentTab: 'cookies',
        pinnedBaselineId: null,
        snapshot,
        runCount: 1,
        defaultTabOnSend: 'preview',
      }),
    ).toBe('body');
  });
});

describe('isResponseTabAvailable', () => {
  it('requires html or image for preview', () => {
    const html = minimalSnapshot();
    expect(isResponseTabAvailable('preview', html, 1)).toBe(true);
    const json = minimalSnapshot({
      headers: [{ key: 'Content-Type', value: 'application/json' }],
      body: { encoding: 'text', text: '{}' },
    });
    expect(isResponseTabAvailable('preview', json, 1)).toBe(false);
  });
});
