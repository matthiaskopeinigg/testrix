import { z } from 'zod';

export const teamCommitFileStatusSchema = z.enum(['added', 'modified', 'deleted', 'renamed']);

export type TeamCommitFileStatus = z.infer<typeof teamCommitFileStatusSchema>;

export const teamCommitFileChangeSchema = z.object({
  path: z.string().min(1),
  status: teamCommitFileStatusSchema,
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  previousPath: z.string().nullable().optional(),
  diff: z.string(),
});

export type TeamCommitFileChange = z.infer<typeof teamCommitFileChangeSchema>;

export const teamCommitDetailSchema = z.object({
  hash: z.string().min(1),
  shortHash: z.string().min(1),
  message: z.string(),
  authorName: z.string(),
  authorEmail: z.string(),
  committedAt: z.string(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  files: z.array(teamCommitFileChangeSchema),
});

export type TeamCommitDetail = z.infer<typeof teamCommitDetailSchema>;
