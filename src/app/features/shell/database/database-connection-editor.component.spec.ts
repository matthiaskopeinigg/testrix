import { describe, expect, it } from 'vitest';

import type { DatabaseConnection } from '@shared/config';

import {
  cloneConnectionDraft,
  connectionPersistPatch,
  sanitizeCredentialPatch,
} from './database-connection-editor.component';

function connection(patch: Partial<DatabaseConnection> = {}): DatabaseConnection {
  return {
    id: 'c1',
    kind: 'connection',
    name: 'Oracle',
    type: 'oracle',
    host: 'db',
    port: 1521,
    user: 'testrix',
    password: 'secret',
    connectOnBoot: false,
    ...patch,
  };
}

describe('database-connection-editor credentials', () => {
  it('clones so the editor cannot mutate the persisted connection in place', () => {
    const stored = connection();
    const draft = cloneConnectionDraft(stored);
    draft.user = '';
    draft.password = '';
    expect(stored.user).toBe('testrix');
    expect(stored.password).toBe('secret');
  });

  it('ignores empty user/password patches until the field is focused', () => {
    const current = connection();
    expect(sanitizeCredentialPatch(current, { user: undefined, password: undefined }, false, false)).toBeNull();
    expect(sanitizeCredentialPatch(current, { name: 'Renamed', password: undefined }, false, false)).toEqual({
      name: 'Renamed',
    });
    expect(sanitizeCredentialPatch(current, { password: undefined }, false, true)).toEqual({
      password: undefined,
    });
  });

  it('keeps stored secrets when Save sees a blank password field', () => {
    const stored = connection();
    const draft = connection({ user: '', password: '', name: 'Renamed' });
    expect(connectionPersistPatch(draft, stored)).toMatchObject({
      name: 'Renamed',
      user: 'testrix',
      password: 'secret',
    });
  });
});
