import { describe, expect, it } from 'vitest';

import {
  createDefaultProfilesManifest,
  createPathsAnchorV2,
  createProfileEntry,
  pathsAnchorRawSchema,
  pathsAnchorSchema,
  planPathsAnchorV1ToV2,
  profilesManifestSchema,
} from '@shared/config';

describe('workspace profile paths migration', () => {
  it('plans v1 to v2 migration with default profile name', () => {
    const v1 = {
      schemaVersion: 1 as const,
      meta: { createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' },
      configDir: 'C:/legacy/config',
    };
    const plan = planPathsAnchorV1ToV2(v1, 'C:/userData', 'profile-uuid-1');

    expect(plan.defaultProfileName).toBe('Default');
    expect(plan.legacyConfigDir).toBe('C:/legacy/config');
    expect(plan.anchor.schemaVersion).toBe(2);
    expect(plan.anchor.sharedConfigDir).toBe('C:/userData');
    expect(plan.anchor.profilesRoot).toBe('C:/userData/profiles');
    expect(plan.anchor.activeProfileId).toBe('profile-uuid-1');
  });

  it('creates fresh v2 anchor', () => {
    const anchor = createPathsAnchorV2('/data/Testrix', 'id-a');
    expect(pathsAnchorSchema.parse(anchor).activeProfileId).toBe('id-a');
  });

  it('parses v1 and v2 raw anchors', () => {
    const v1 = pathsAnchorRawSchema.parse({
      schemaVersion: 1,
      meta: { createdAt: 'a', updatedAt: 'b' },
      configDir: '/cfg',
    });
    expect(v1.schemaVersion).toBe(1);

    const v2 = pathsAnchorRawSchema.parse({
      schemaVersion: 2,
      meta: { createdAt: 'a', updatedAt: 'b' },
      sharedConfigDir: '/u',
      profilesRoot: '/u/profiles',
      activeProfileId: 'p1',
    });
    expect(v2.schemaVersion).toBe(2);
  });

  it('validates profiles manifest', () => {
    const manifest = createDefaultProfilesManifest('abc', 'Testing');
    expect(profilesManifestSchema.parse(manifest).profiles[0]?.name).toBe('Testing');
    expect(createProfileEntry('id-1', 'Development').name).toBe('Development');
  });
});
