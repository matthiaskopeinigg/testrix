import { describe, expect, it } from 'vitest';

import type { ProfileEntry } from './profiles.schema';
import { asTeamProfile, shouldPromoteLegacyTeamProfile } from './profile-kind';

function localProfile(id: string): ProfileEntry {
  return { id, name: id, createdAt: '2026-01-01T00:00:00.000Z', profileKind: 'local' };
}

describe('shouldPromoteLegacyTeamProfile', () => {
  it('does not promote a local profile that is only listed in profileSync', () => {
    expect(shouldPromoteLegacyTeamProfile(localProfile('local'), true)).toBe(false);
  });

  it('promotes a leftover teamEnabled profile listed in profileSync', () => {
    expect(
      shouldPromoteLegacyTeamProfile({ ...localProfile('legacy'), teamEnabled: true }, true),
    ).toBe(true);
  });

  it('does not promote an already-team profile', () => {
    expect(shouldPromoteLegacyTeamProfile(asTeamProfile(localProfile('team')), true)).toBe(false);
  });
});
