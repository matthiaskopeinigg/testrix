import { z } from 'zod';

const metaSchema = z.object({
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const profileKindSchema = z.enum(['local', 'team']);

export type ProfileKind = z.infer<typeof profileKindSchema>;

export const profileEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  createdAt: z.string(),
  profileKind: profileKindSchema.default('local'),
  linkedDir: z.string().min(1).optional(),
  /** @deprecated Use profileKind === 'team'. Kept for migration reads. */
  teamEnabled: z.boolean().optional(),
});

export type ProfileEntry = z.infer<typeof profileEntrySchema>;

export const profilesManifestSchema = z.object({
  schemaVersion: z.literal(1),
  meta: metaSchema,
  profiles: z.array(profileEntrySchema).min(1),
});

export type ProfilesManifest = z.infer<typeof profilesManifestSchema>;

/** IPC payload: manifest plus resolved paths for the active profile. */
export const profilesStateSchema = z.object({
  activeProfileId: z.string().min(1),
  profiles: z.array(profileEntrySchema),
  activeProfileDir: z.string().min(1),
  sharedConfigDir: z.string().min(1),
  profilesRoot: z.string().min(1),
});

export type ProfilesState = z.infer<typeof profilesStateSchema>;
