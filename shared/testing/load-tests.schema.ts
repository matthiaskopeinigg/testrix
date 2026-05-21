import { z } from 'zod';

const boundedText = (max: number) => z.string().max(max);

export const loadTestProfileSchema = z.object({
  durationSec: z.number().int().min(1).max(86_400).default(60),
  virtualUsers: z.number().int().min(1).max(10_000).default(10),
  rampUpSec: z.number().int().min(0).default(0),
});

export const loadTestArtifactSchema = z.object({
  id: z.string().min(1),
  name: boundedText(256),
  description: boundedText(4_000).default(''),
  targetRequestId: z.string().optional(),
  profile: loadTestProfileSchema,
  updatedAt: z.string(),
});

export const loadTestFolderSchema: z.ZodType<LoadTestFolder> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    name: boundedText(256),
    children: z.array(loadTestTreeItemSchema).default([]),
    updatedAt: z.string(),
  }),
);

export type LoadTestFolder = {
  readonly id: string;
  readonly name: string;
  readonly children: readonly LoadTestTreeItem[];
  readonly updatedAt: string;
};

export const loadTestTreeItemSchema = z.union([loadTestFolderSchema, loadTestArtifactSchema]);

export type LoadTestTreeItem = LoadTestFolder | z.infer<typeof loadTestArtifactSchema>;
export type LoadTestArtifact = z.infer<typeof loadTestArtifactSchema>;

export const loadTestsFileSchema = z.object({
  schemaVersion: z.literal(1),
  items: z.array(loadTestTreeItemSchema).default([]),
});

export type LoadTestsFile = z.infer<typeof loadTestsFileSchema>;

/**
 * Returns an empty load tests workspace file.
 */
export function createDefaultLoadTestsFile(): LoadTestsFile {
  return loadTestsFileSchema.parse({ schemaVersion: 1, items: [] });
}
