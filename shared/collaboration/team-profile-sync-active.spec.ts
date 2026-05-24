import { describe, expect, it } from 'vitest';

import type { ProfileEntry } from '../config/profiles.schema';
import { asTeamProfile } from '../config/profile-kind';

import { isActiveTeamProfileSyncEnabled, listProfileSyncTargets } from './team-profile-sync.helpers';

function localProfile(id: string, name: string): ProfileEntry {
  return { id, name, createdAt: '2026-01-01T00:00:00.000Z', profileKind: 'local' };
}

describe('active team profile sync', () => {
  it('syncs only when active profile is a team profile', () => {
    const profiles = [
      localProfile('local', 'Local'),
      asTeamProfile(localProfile('team', 'Team')),
    ];

    expect(isActiveTeamProfileSyncEnabled(profiles, 'local')).toBe(false);
    expect(isActiveTeamProfileSyncEnabled(profiles, 'team')).toBe(true);
  });

  it('returns a single sync target for the active team profile', () => {
    const profilesRoot = 'C:/profiles';
    const profiles = [asTeamProfile(localProfile('team', 'Team'))];
    const targets = listProfileSyncTargets(profiles, profilesRoot, { entries: [] }, 'team');
    expect(targets).toHaveLength(1);
    expect(targets[0]?.profileId).toBe('team');
  });

  it('returns no sync targets for local active profile', () => {
    const profilesRoot = 'C:/profiles';
    const profiles = [localProfile('local', 'Local')];
    const targets = listProfileSyncTargets(profiles, profilesRoot, { entries: [] }, 'local');
    expect(targets).toHaveLength(0);
  });
});
