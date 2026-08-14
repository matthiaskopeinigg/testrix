import { z } from 'zod';

const metaSchema = z.object({
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Legacy single-directory anchor (read-only for migration). */
export const pathsAnchorV1Schema = z.object({
  schemaVersion: z.literal(1),
  meta: metaSchema,
  configDir: z.string().min(1),
});

export type PathsAnchorV1 = z.infer<typeof pathsAnchorV1Schema>;

/** Current anchor: global settings dir + profile workspace root. */
export const pathsAnchorSchema = z.object({
  schemaVersion: z.literal(2),
  meta: metaSchema,
  sharedConfigDir: z.string().min(1),
  profilesRoot: z.string().min(1),
  activeProfileId: z.string().min(1),
});

export type PathsAnchor = z.infer<typeof pathsAnchorSchema>;

export const pathsAnchorRawSchema = z.discriminatedUnion('schemaVersion', [
  pathsAnchorV1Schema,
  pathsAnchorSchema,
]);

export type PathsAnchorRaw = z.infer<typeof pathsAnchorRawSchema>;
