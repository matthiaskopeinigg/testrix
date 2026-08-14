import { z } from 'zod';

export const TEAM_PROFILES_MANIFEST_FILE_NAME = 'team-profiles.json';

export const teamProfilesManifestEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  shareScopeLabel: z.string().min(1).max(240),
});

export type TeamProfilesManifestEntry = z.infer<typeof teamProfilesManifestEntrySchema>;

export const teamProfilesManifestSchema = z.object({
  schemaVersion: z.literal(1),
  profiles: z.array(teamProfilesManifestEntrySchema),
});

export type TeamProfilesManifest = z.infer<typeof teamProfilesManifestSchema>;

export function createEmptyTeamProfilesManifest(): TeamProfilesManifest {
  return { schemaVersion: 1, profiles: [] };
}
