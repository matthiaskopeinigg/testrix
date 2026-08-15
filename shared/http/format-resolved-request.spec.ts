import { describe, expect, it } from 'vitest';

import { formatResolvedRequest } from './format-resolved-request';
import type { OutgoingHttpRequest } from './outgoing-request.schema';

describe('formatResolvedRequest', () => {
  it('masks bearer tokens and lists variable keys without values', () => {
    const outgoing = {
      requestId: 'req-1',
      method: 'GET',
      url: 'https://api.example.com/users',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer super-secret',
      },
      body: { kind: 'none' },
      environmentId: 'env-1',
      variableContext: { baseUrl: 'https://api.example.com' },
    } as unknown as OutgoingHttpRequest;
    const text = formatResolvedRequest(outgoing);
    expect(text).toContain('GET https://api.example.com/users');
    expect(text).toContain('Authorization: Bearer ••••');
    expect(text).not.toContain('super-secret');
    expect(text).toContain('Variables: baseUrl');
  });
});
