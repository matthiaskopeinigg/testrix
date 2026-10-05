import { describe, expect, it } from 'vitest';

import {
  applyFlowCaptureRules,
  applyFlowResponse,
  assertFlowMatch,
  BODY_PREVIEW_LIMIT,
  devicePickPrefixKind,
  flowUrlMatches,
  headerMapFromPairs,
  httpSummary,
  normalizeUrlForCompare,
  previewBody,
  sleep,
} from './flow-host-helpers';

describe('flow URL matching', () => {
  it('supports contains, equals and regex modes', () => {
    // Arrange
    const url = 'https://api.test/users/42';

    // Act
    const results = [
      flowUrlMatches(url, '/users/', 'contains'),
      flowUrlMatches(url, url, 'equals'),
      flowUrlMatches(url, 'users/\\d+$', 'regex'),
      flowUrlMatches(url, '(', 'regex'),
    ];

    // Assert
    expect(results).toEqual([true, true, true, false]);
  });

  it('explains a failed assertion and rejects an invalid pattern', () => {
    // Act
    const equals = (): void => assertFlowMatch('a', 'b', 'equals', 'Title');
    const regex = (): void => assertFlowMatch('a', '(', 'regex', 'Title');
    const contains = (): void => assertFlowMatch('hello', 'ell', 'contains', 'Title');

    // Assert
    expect(equals).toThrow('Title is "a", expected "b"');
    expect(regex).toThrow('Invalid pattern "("');
    expect(contains).not.toThrow();
  });

  it('ignores the hash and trailing slash when comparing URLs', () => {
    // Act
    const normalized = normalizeUrlForCompare(' example.com/path/#top ');

    // Assert
    expect(normalized).toBe(normalizeUrlForCompare('example.com/path'));
    expect(normalizeUrlForCompare('')).toBe('');
  });
});

describe('flow step helpers', () => {
  it('caps previews and lower-cases header names', () => {
    // Act
    const preview = previewBody('x'.repeat(BODY_PREVIEW_LIMIT + 10));
    const headers = headerMapFromPairs([
      { key: ' Content-Type ', value: 'json' },
      { key: '', value: 'dropped' },
    ]);

    // Assert
    expect(preview).toHaveLength(BODY_PREVIEW_LIMIT + 1);
    expect(headers).toEqual({ 'content-type': 'json' });
  });

  it('summarizes HTTP details for the run log', () => {
    // Act
    const summaries = [
      httpSummary({ kind: 'capture', captures: { token: 'a' } } as never),
      httpSummary({ kind: 'http', status: 200, method: 'GET', url: 'https://a.test' } as never),
      httpSummary({ kind: 'http', hit: false } as never),
    ];

    // Assert
    expect(summaries).toEqual(['captured token', '200 · GET · https://a.test', 'no hit']);
  });

  it('only re-runs device steps other than start and install before Pick', () => {
    // Act
    const kinds = ['device-tap', 'device-start', 'device-install', 'browser-click'].map(devicePickPrefixKind);

    // Assert
    expect(kinds).toEqual([true, false, false, false]);
  });

  it('rejects a sleep when the run is cancelled', async () => {
    // Arrange
    const controller = new AbortController();

    // Act
    const pending = sleep(10_000, controller.signal);
    controller.abort();

    // Assert
    await expect(pending).rejects.toThrow('cancelled');
  });

  it('writes the last HTTP exchange onto the flow context', () => {
    const vars = {
      status: 0,
      body: '',
      headers: {},
      vars: {} as Record<string, string>,
      method: '',
      url: '',
      requestBody: '',
    };
    applyFlowResponse(vars, 201, '{"ok":true}', { 'content-type': 'application/json' }, {
      method: 'POST',
      url: 'https://api.test/items',
    });
    expect(vars.status).toBe(201);
    expect(vars.vars['status']).toBe('201');
    expect(applyFlowCaptureRules(vars, JSON.stringify([{ name: 'code', kind: 'status' }]))).toEqual({
      code: '201',
    });
    expect(vars.vars['code']).toBe('201');
  });
});
