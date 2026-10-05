import { describe, expect, it } from 'vitest';

import { collectEnvironmentSecrets } from './environment';
import { LOG_SECRET_REDACTED, redactSecrets } from './log-redact';

describe('redactSecrets', () => {
  it('replaces secret values and common token prefixes', () => {
    const line = 'token=hunter2-secret Bearer abc.def Authorization: Basic dXNlcjpwYXNz';
    const redacted = redactSecrets(line, ['hunter2-secret']);
    expect(redacted).toContain(LOG_SECRET_REDACTED);
    expect(redacted).not.toContain('hunter2-secret');
    expect(redacted).not.toContain('abc.def');
    expect(redacted).not.toContain('dXNlcjpwYXNz');
  });

  it('skips very short secrets', () => {
    expect(redactSecrets('ab cd', ['ab'])).toBe('ab cd');
  });

  it('collects secret environment values', () => {
    const secrets = collectEnvironmentSecrets({
      schemaVersion: 1,
      items: [
        {
          id: 'env-1',
          name: 'Local',
          modifiedAt: '2026-01-01T00:00:00.000Z',
          variables: [
            {
              kind: 'variable',
              id: 's1',
              key: 'pw',
              value: 'local-secret',
              description: '',
              enabled: true,
              secret: true,
            },
          ],
        },
      ],
      activeId: 'env-1',
      orderIds: ['env-1'],
    });
    expect(secrets).toEqual(['local-secret']);
    expect(redactSecrets(`pw=${secrets[0]}`, secrets)).not.toContain(secrets[0]);
    expect(redactSecrets(`pw=${secrets[0]}`, secrets)).toContain(LOG_SECRET_REDACTED);
  });
});
