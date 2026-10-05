import { describe, expect, it } from 'vitest';

import { newEntityId } from './entity-id';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('newEntityId', () => {
  it('returns an RFC 4122 UUID string', () => {
    expect(newEntityId()).toMatch(UUID_RE);
  });
});
