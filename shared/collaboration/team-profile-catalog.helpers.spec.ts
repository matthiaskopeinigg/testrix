import { describe, expect, it } from 'vitest';

import type { ProfileEntry } from '../config/profiles.schema';
import { asTeamProfile } from '../config/profile-kind';

import { buildTeamRemoteCatalog, listImportableRemoteProfileIds, listPublishableLocalProfiles } from './team-profile-catalog.helpers';

function localProfile(id: string, name: string): ProfileEntry {
  return { id, name, createdAt: '2026-01-01T00:00:00.000Z', profileKind: 'local' };
}

describe('team-profile-catalog.helpers', () => {
  it('marks imported team profiles in remote catalog', () => {
    const local = [asTeamProfile(localProfile('a', 'Alpha'))];
    const catalog = buildTeamRemoteCatalog(
      [
        { id: 'a', name: 'Alpha', shareScopeLabel: 'All shared workspace files' },
        { id: 'b', name: 'Beta', shareScopeLabel: 'collections.json only' },
      ],
      local,
      '2026-01-01T00:00:00.000Z',
    );

    expect(catalog.profiles).toEqual([
      expect.objectContaining({ id: 'a', imported: true }),
      expect.objectContaining({ id: 'b', imported: false }),
    ]);
  });

  it('lists importable remote profile ids', () => {
    const ids = listImportableRemoteProfileIds(
      [{ id: 'remote-1', name: 'Remote', shareScopeLabel: 'All shared workspace files' }],
      [localProfile('local-1', 'Local')],
    );
    expect(ids).toEqual(['remote-1']);
  });

  it('lists publishable local profiles only', () => {
    const profiles = [
      localProfile('local-1', 'Local'),
      asTeamProfile(localProfile('team-1', 'Team')),
    ];
    expect(listPublishableLocalProfiles(profiles).map((profile) => profile.id)).toEqual(['local-1']);
  });
});
