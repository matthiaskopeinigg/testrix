import { z } from 'zod';

export const teamHistoryEntrySchema = z.object({
  hash: z.string().min(1),
  shortHash: z.string().min(1),
  authorName: z.string(),
  authorEmail: z.string(),
  committedAt: z.string(),
  message: z.string(),
  files: z.array(z.string()),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
});

export type TeamHistoryEntry = z.infer<typeof teamHistoryEntrySchema>;

export const teamHistoryPageSchema = z.object({
  entries: z.array(teamHistoryEntrySchema),
  hasMore: z.boolean(),
});

export type TeamHistoryPage = z.infer<typeof teamHistoryPageSchema>;

export const teamBranchEntrySchema = z.object({
  name: z.string().min(1),
  current: z.boolean(),
  remote: z.boolean(),
  ahead: z.number().int().nonnegative().optional(),
  behind: z.number().int().nonnegative().optional(),
});

export type TeamBranchEntry = z.infer<typeof teamBranchEntrySchema>;

export const teamConflictResolutionSchema = z.enum(['ours', 'theirs', 'abort']);

export type TeamConflictResolution = z.infer<typeof teamConflictResolutionSchema>;
