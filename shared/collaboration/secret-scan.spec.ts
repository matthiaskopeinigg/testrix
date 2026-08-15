import { describe, expect, it } from 'vitest';

import { scanWorkspaceTextForSecrets, secretScanShouldBlock } from './secret-scan';

describe('scanWorkspaceTextForSecrets', () => {
  it('blocks private keys and AWS access keys', () => {
    const findings = scanWorkspaceTextForSecrets(
      'collections.json',
      '{"key":"AKIAIOSFODNN7EXAMPLE","pem":"-----BEGIN PRIVATE KEY-----"}',
    );
    expect(findings.map((f) => f.kind).sort()).toEqual(['aws-key', 'private-key']);
    expect(secretScanShouldBlock(findings)).toBe(true);
  });

  it('warns on JWTs without blocking', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.signaturexx';
    const findings = scanWorkspaceTextForSecrets('history.json', `{"token":"${jwt}"}`);
    expect(findings.some((f) => f.kind === 'jwt')).toBe(true);
    expect(secretScanShouldBlock(findings)).toBe(false);
  });

  it('blocks inline secret environment values', () => {
    const raw = JSON.stringify({
      environments: [
        {
          nodes: [{ kind: 'variable', secret: true, value: 'still-here' }],
        },
      ],
    });
    const findings = scanWorkspaceTextForSecrets('environments.json', raw);
    expect(findings.some((f) => f.kind === 'inline-env-secret')).toBe(true);
    expect(secretScanShouldBlock(findings)).toBe(true);
  });
});
