import { z } from 'zod';

import { teamProfilesManifestEntrySchema } from './team-profiles-manifest.schema';

export const teamRemoteCatalogEntrySchema = teamProfilesManifestEntrySchema.extend({
  imported: z.boolean(),
});

export type TeamRemoteCatalogEntry = z.infer<typeof teamRemoteCatalogEntrySchema>;

export const teamRemoteCatalogSchema = z.object({
  profiles: z.array(teamRemoteCatalogEntrySchema),
  fetchedAt: z.string(),
});

export type TeamRemoteCatalog = z.infer<typeof teamRemoteCatalogSchema>;

export const teamFetchRemoteCatalogOptionsSchema = z.object({
  importMissing: z.boolean().optional(),
});

export type TeamFetchRemoteCatalogOptions = z.infer<typeof teamFetchRemoteCatalogOptionsSchema>;

export const teamFetchRemoteCatalogResultSchema = teamRemoteCatalogSchema.extend({
  importedProfileIds: z.array(z.string().min(1)),
});

export type TeamFetchRemoteCatalogResult = z.infer<typeof teamFetchRemoteCatalogResultSchema>;

export const teamImportProfilesResultSchema = z.object({
  importedProfileIds: z.array(z.string().min(1)),
});

export type TeamImportProfilesResult = z.infer<typeof teamImportProfilesResultSchema>;

export const teamPublishProfileResultSchema = z.object({
  profileId: z.string().min(1),
});

export type TeamPublishProfileResult = z.infer<typeof teamPublishProfileResultSchema>;

export const teamCreateProfileResultSchema = z.object({
  profileId: z.string().min(1),
});

export type TeamCreateProfileResult = z.infer<typeof teamCreateProfileResultSchema>;
