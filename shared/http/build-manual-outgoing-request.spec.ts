import { describe, expect, it } from 'vitest';

import { createDefaultHttpSettings } from '../config/http-settings.schema';
import { createDefaultLoadTestManualTarget } from '../testing/load-test-target.schema';

import { buildManualOutgoingRequest } from './build-manual-outgoing-request';

describe('buildManualOutgoingRequest', () => {
  const defaults = createDefaultHttpSettings();
  const http = {
    ...defaults,
    request: {
      ...defaults.request,
      autoFixUrlOnSend: false,
      prependWwwOnSend: false,
    },
  };

  it('returns null when the URL is empty', () => {
    expect(
      buildManualOutgoingRequest({
        loadTestId: 'lt-1',
        manual: createDefaultLoadTestManualTarget(),
        http,
      }),
    ).toBeNull();
  });

  it('builds a collection-style GET payload without a body', () => {
    const result = buildManualOutgoingRequest({
      loadTestId: 'lt-1',
      manual: {
        ...createDefaultLoadTestManualTarget(),
        url: 'https://api.example.com/health',
        requestBody: { mode: 'json', raw: '{"ping":true}' },
        bodyType: 'json',
        body: '{"ping":true}',
      },
      http,
    });
    expect(result).not.toBeNull();
    expect(result!.outgoing.method).toBe('GET');
    expect(result!.outgoing.url).toBe('https://api.example.com/health');
    expect(result!.outgoing.body).toEqual({ kind: 'none' });
  });

  it('encodes a JSON body for POST instead of using a none shortcut', () => {
    const result = buildManualOutgoingRequest({
      loadTestId: 'lt-1',
      manual: {
        ...createDefaultLoadTestManualTarget(),
        method: 'POST',
        url: 'https://api.example.com/items',
        requestBody: { mode: 'json', raw: '{"name":"load"}' },
        bodyType: 'json',
        body: '{"name":"load"}',
      },
      http,
    });
    expect(result).not.toBeNull();
    expect(result!.outgoing.method).toBe('POST');
    expect(result!.outgoing.body).toEqual({
      kind: 'text',
      content: '{"name":"load"}',
      contentType: 'application/json',
    });
  });

  it('substitutes flow CACHE aliases in the manual URL', () => {
    const result = buildManualOutgoingRequest({
      loadTestId: 'flow-3',
      manual: {
        ...createDefaultLoadTestManualTarget(),
        url: 'https://api.example.com/redis/{{email}}',
      },
      http,
      variableContext: { email: 'cached@example.com' },
    });
    expect(result).not.toBeNull();
    expect(result!.outgoing.url).toBe('https://api.example.com/redis/cached@example.com');
  });
});
