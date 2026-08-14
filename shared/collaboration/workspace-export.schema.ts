import { z } from 'zod';

import { collectionsFileSchema } from '../config/collections.schema';
import { environmentsFileSchema } from '../config/environments.schema';

export const workspaceExportKindSchema = z.enum([
  'collection-subtree',
  'collections',
  'environments',
]);

export type WorkspaceExportKind = z.infer<typeof workspaceExportKindSchema>;

export const workspaceExportEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.string(),
  kind: workspaceExportKindSchema,
  payload: z.unknown(),
});

export type WorkspaceExportEnvelope = z.infer<typeof workspaceExportEnvelopeSchema>;

export function createCollectionsExportEnvelope(payload: unknown): WorkspaceExportEnvelope {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    kind: 'collections',
    payload: collectionsFileSchema.parse(payload),
  };
}

export function createEnvironmentsExportEnvelope(payload: unknown): WorkspaceExportEnvelope {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    kind: 'environments',
    payload: environmentsFileSchema.parse(payload),
  };
}
