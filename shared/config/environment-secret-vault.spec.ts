import { describe, expect, it } from 'vitest';

import {
  extractEnvironmentSecrets,
  hydrateEnvironmentSecrets,
  environmentsHaveInlineSecrets,
} from './environment-secret-vault';
import type { EnvironmentsFile } from './environments.schema';

function sample(secretValue: string): EnvironmentsFile {
  return {
    schemaVersion: 1,
    meta: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    environments: [
      {
        id: 'env-1',
        name: 'Local',
        nodes: [
          { id: 'var-1', kind: 'variable', key: 'token', value: secretValue, secret: true },
          { id: 'var-2', kind: 'variable', key: 'baseUrl', value: 'http://localhost', secret: false },
        ],
      },
    ],
  };
}

describe('environment-secret-vault', () => {
  it('extracts secret values and hydrates them back', () => {
    const extracted = extractEnvironmentSecrets(sample('s3cret'));
    const secretVar = extracted.file.environments[0]?.nodes[0];
    expect(secretVar && secretVar.kind === 'variable' ? secretVar.value : 'missing').toBe('');
    expect(secretVar && secretVar.kind === 'variable' ? secretVar.vaultRef : undefined).toBe('env:var-1');
    expect(extracted.secrets['env:var-1']).toBe('s3cret');
    expect(environmentsHaveInlineSecrets(extracted.file)).toBe(false);

    const hydrated = hydrateEnvironmentSecrets(extracted.file, extracted.secrets);
    const restored = hydrated.environments[0]?.nodes[0];
    expect(restored && restored.kind === 'variable' ? restored.value : '').toBe('s3cret');
  });
});
