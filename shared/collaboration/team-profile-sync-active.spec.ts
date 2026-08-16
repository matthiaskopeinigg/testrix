import { describe, expect, it } from 'vitest';

import type { ProfileEntry } from '../config/profiles.schema';
import { asTeamProfile } from '../config/profile-kind';

import { isActiveTeamProfileSyncEnabled, listProfileSyncTargets, shouldRunTeamSyncCycle } from './team-profile-sync.helpers';

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

  it('pauses background sync while a local profile is active', () => {
    expect(shouldRunTeamSyncCycle('interval', false)).toBe(false);
    expect(shouldRunTeamSyncCycle('focus', false)).toBe(false);
    expect(shouldRunTeamSyncCycle('save', false)).toBe(false);
    expect(shouldRunTeamSyncCycle('manual', false)).toBe(false);
    expect(shouldRunTeamSyncCycle('retry', false)).toBe(false);
    expect(shouldRunTeamSyncCycle('profile-switch', false)).toBe(false);
  });

  it('allows publish and import cycles while a local profile is active', () => {
    expect(shouldRunTeamSyncCycle('publish', false)).toBe(true);
    expect(shouldRunTeamSyncCycle('create-team-profile', false)).toBe(true);
    expect(shouldRunTeamSyncCycle('unpublish', false)).toBe(true);
    expect(shouldRunTeamSyncCycle('import', false)).toBe(true);
    expect(shouldRunTeamSyncCycle('create-branch', false)).toBe(true);
  });

  it('runs background sync while a team profile is active', () => {
    expect(shouldRunTeamSyncCycle('interval', true)).toBe(true);
    expect(shouldRunTeamSyncCycle('manual', true)).toBe(true);
  });
});
