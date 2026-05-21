import { z } from 'zod';

const boundedText = (max: number) => z.string().max(max);

export const regressionRunSchema = z.object({
  id: z.string().min(1),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  status: z.enum(['running', 'passed', 'failed', 'cancelled']).default('running'),
  passedCount: z.number().int().min(0).default(0),
  failedCount: z.number().int().min(0).default(0),
});

export const regressionArtifactSchema = z.object({
  id: z.string().min(1),
  name: boundedText(256),
  description: boundedText(4_000).default(''),
  flowIds: z.array(z.string()).default([]),
  runs: z.array(regressionRunSchema).default([]),
  updatedAt: z.string(),
});

export const regressionsFileSchema = z.object({
  schemaVersion: z.literal(1),
  items: z.array(regressionArtifactSchema).default([]),
});

export type RegressionsFile = z.infer<typeof regressionsFileSchema>;
export type RegressionArtifact = z.infer<typeof regressionArtifactSchema>;

/**
 * Returns an empty regressions workspace file.
 */
export function createDefaultRegressionsFile(): RegressionsFile {
  return regressionsFileSchema.parse({ schemaVersion: 1, items: [] });
}
