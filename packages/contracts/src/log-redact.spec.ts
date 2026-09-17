import { describe, expect, it } from 'vitest';

import { collectEnvironmentSecrets, createDefaultEnvironmentsFile } from './environment';
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
    const secrets = collectEnvironmentSecrets(createDefaultEnvironmentsFile());
    expect(secrets.some((value) => value.endsWith('-secret'))).toBe(true);
    expect(redactSecrets(`pw=${secrets[0]}`, secrets)).not.toContain(secrets[0]);
    expect(redactSecrets(`pw=${secrets[0]}`, secrets)).toContain(LOG_SECRET_REDACTED);
  });
});
