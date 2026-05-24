import { z } from 'zod';

export const workspaceFileScopeSchema = z.enum(['global', 'profile']);

export type WorkspaceFileScope = z.infer<typeof workspaceFileScopeSchema>;

export const workspaceFileInventoryEntrySchema = z.object({
  fileName: z.string(),
  scope: workspaceFileScopeSchema,
  absolutePath: z.string(),
  exists: z.boolean(),
  schemaVersion: z.number().nullable(),
  currentVersion: z.number().nullable(),
  updatedAt: z.string().nullable(),
});

export type WorkspaceFileInventoryEntry = z.infer<typeof workspaceFileInventoryEntrySchema>;
