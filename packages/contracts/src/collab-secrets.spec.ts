import { describe, expect, it } from 'vitest';

import {
  COLLAB_SECRETS_VERSION,
  EMPTY_COLLAB_SECRETS,
  collabSecretsFileSchema,
  parseCollabSecretsFile,
} from './collab-secrets';

describe('parseCollabSecretsFile', () => {
  it.each([null, undefined, 'text', 42, []])('returns an empty overlay for %j', (raw) => {
    // Act
    const parsed = parseCollabSecretsFile(raw);

    // Assert
    expect(parsed).toEqual(EMPTY_COLLAB_SECRETS);
  });

  it('keeps string secrets and drops everything else', () => {
    // Arrange
    const raw = {
      schemaVersion: 99,
      environments: { v1: 'token', v2: 7, v3: '' },
      auth: { node: { token: 'abc', password: null }, empty: {}, bad: 'x' },
      headers: { node: { row: 'Bearer x' } },
      cookies: [],
      databases: { db: 'pw', other: false },
      extra: { anything: true },
    };

    // Act
    const parsed = parseCollabSecretsFile(raw);

    // Assert
    expect(parsed).toEqual({
      schemaVersion: COLLAB_SECRETS_VERSION,
      environments: { v1: 'token' },
      auth: { node: { token: 'abc' } },
      headers: { node: { row: 'Bearer x' } },
      cookies: {},
      databases: { db: 'pw' },
    });
  });

  it('satisfies the secrets file schema', () => {
    expect(collabSecretsFileSchema.parse(parseCollabSecretsFile({ environments: { v1: 'x' } }))).toMatchObject({
      schemaVersion: COLLAB_SECRETS_VERSION,
      environments: { v1: 'x' },
    });
  });

  it('does not share nested maps with the empty template', () => {
    // Act
    const parsed = parseCollabSecretsFile(null);
    parsed.environments['leak'] = 'x';

    // Assert
    expect(EMPTY_COLLAB_SECRETS.environments).toEqual({});
  });
});
