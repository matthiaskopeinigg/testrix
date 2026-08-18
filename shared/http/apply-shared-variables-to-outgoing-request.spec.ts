import { describe, expect, it } from 'vitest';

import { createDefaultHttpSettings } from '../config/http-settings.schema';
import { createDefaultLoadTestManualTarget } from '../testing/load-test-target.schema';

import { applySharedVariablesToOutgoingRequest } from './apply-shared-variables-to-outgoing-request';
import { buildManualOutgoingRequest } from './build-manual-outgoing-request';

describe('applySharedVariablesToOutgoingRequest', () => {
  const defaults = createDefaultHttpSettings();
  const http = {
    ...defaults,
    request: {
      ...defaults.request,
      autoFixUrlOnSend: false,
      prependWwwOnSend: false,
    },
  };

  it('substitutes a CACHE alias into a leftover REQUEST URL template', () => {
    const built = buildManualOutgoingRequest({
      loadTestId: 'flow-3',
      manual: {
        ...createDefaultLoadTestManualTarget(),
        url: 'https://api.example.com/redis/{{email}}',
      },
      http,
    });
    expect(built).not.toBeNull();
    expect(built!.outgoing.url).toBe('https://api.example.com/redis/{{email}}');

    const applied = applySharedVariablesToOutgoingRequest(built!.outgoing, {
      email: 'cached@example.com',
    });
    expect(applied.url).toBe('https://api.example.com/redis/cached@example.com');
  });

  it('resolves a CACHE alias stored with catalog braces', () => {
    const built = buildManualOutgoingRequest({
      loadTestId: 'flow-3',
      manual: {
        ...createDefaultLoadTestManualTarget(),
        url: 'https://api.example.com/redis/{{email}}',
      },
      http,
    });
    expect(built).not.toBeNull();

    const applied = applySharedVariablesToOutgoingRequest(built!.outgoing, {
      '{{email}}': 'cached@example.com',
    });
    expect(applied.url).toBe('https://api.example.com/redis/cached@example.com');
  });
});
