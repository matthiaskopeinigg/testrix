import { z } from 'zod';

export const teamConflictFilePreviewSchema = z.object({
  path: z.string().min(1),
  ours: z.string(),
  theirs: z.string(),
  base: z.string().nullable(),
  diff: z.string(),
  mergeable: z.boolean(),
});

export type TeamConflictFilePreview = z.infer<typeof teamConflictFilePreviewSchema>;

export const teamConflictFileResolutionSchema = z.object({
  path: z.string().min(1),
  resolution: z.enum(['ours', 'theirs', 'merged']),
  content: z.string().optional(),
});

export type TeamConflictFileResolution = z.infer<typeof teamConflictFileResolutionSchema>;
