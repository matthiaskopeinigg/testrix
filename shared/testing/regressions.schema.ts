import { z } from 'zod';

import {
  createDefaultRegressionProfile,
  createDefaultRegressionThresholds,
  regressionProfileSchema,
  regressionRunSchema,
  regressionThresholdsSchema,
  type RegressionProfile,
  type RegressionRun,
  type RegressionThresholds,
} from './regression-run.schema';

const boundedText = (max: number) => z.string().max(max);

export const regressionNodeMetadataSchema = z.object({
  description: boundedText(4_000).default(''),
  tags: z.array(boundedText(64)).max(32).default([]),
  archivedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type RegressionNodeMetadata = z.infer<typeof regressionNodeMetadataSchema>;

export const regressionArtifactSchema = z.object({
  id: z.string().min(1),
  name: boundedText(256),
  release: boundedText(128).default(''),
  description: boundedText(4_000).default(''),
  tags: z.array(boundedText(64)).max(32).default([]),
  archivedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  docs: boundedText(32_000).default(''),
  flowIds: z.array(z.string()).default([]),
  profile: regressionProfileSchema,
  thresholds: regressionThresholdsSchema,
  runs: z.array(regressionRunSchema).max(30).default([]),
});

export type RegressionArtifact = z.infer<typeof regressionArtifactSchema>;

function folderChildrenAreArtifactsOnly(children: readonly RegressionTreeItem[]): boolean {
  for (const child of children) {
    if (!('profile' in child)) {
      return false;
    }
  }
  return true;
}

export type RegressionFolder = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly archivedAt?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly children: readonly RegressionTreeItem[];
};

export const regressionFolderSchema: z.ZodType<RegressionFolder> = z.lazy(() =>
  z
    .object({
      id: z.string().min(1),
      name: boundedText(256),
      description: boundedText(4_000).default(''),
      tags: z.array(boundedText(64)).max(32).default([]),
      archivedAt: z.string().nullable().optional(),
      createdAt: z.string(),
      updatedAt: z.string(),
      children: z.array(regressionTreeItemSchema).default([]),
    })
    .superRefine((folder, ctx) => {
      if (!folderChildrenAreArtifactsOnly(folder.children)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Regression folders may only contain regression artifacts (no nested folders).',
          path: ['children'],
        });
      }
    }),
);

export const regressionTreeItemSchema = z.union([regressionArtifactSchema, regressionFolderSchema]);

export type RegressionTreeItem = RegressionArtifact | RegressionFolder;

export const regressionsFileSchema = z.object({
  schemaVersion: z.literal(2),
  items: z.array(regressionTreeItemSchema).default([]),
});

export type RegressionsFile = z.infer<typeof regressionsFileSchema>;

/** v1 flat artifact shape for migration. */
export const regressionArtifactV1Schema = z.object({
  id: z.string().min(1),
  name: boundedText(256),
  description: boundedText(4_000).default(''),
  flowIds: z.array(z.string()).default([]),
  runs: z.array(z.unknown()).default([]),
  updatedAt: z.string(),
});

export const regressionsFileV1Schema = z.object({
  schemaVersion: z.literal(1),
  items: z.array(regressionArtifactV1Schema).default([]),
});

export type RegressionsFileV1 = z.infer<typeof regressionsFileV1Schema>;

export function isRegressionArtifact(item: RegressionTreeItem): item is RegressionArtifact {
  return 'profile' in item;
}

export function isRegressionFolder(item: RegressionTreeItem): item is RegressionFolder {
  return !isRegressionArtifact(item);
}

/** Returns default payload for a new regression artifact. */
export function createDefaultRegressionArtifactPayload(
  id: string,
  name: string,
  ts = new Date().toISOString(),
): RegressionArtifact {
  return regressionArtifactSchema.parse({
    id,
    name,
    release: '',
    description: '',
    tags: [],
    createdAt: ts,
    updatedAt: ts,
    docs: '',
    flowIds: [],
    profile: createDefaultRegressionProfile(),
    thresholds: createDefaultRegressionThresholds(),
    runs: [],
  });
}

/**
 * Returns an empty regressions workspace file (v2 tree).
 */
export function createDefaultRegressionsFile(): RegressionsFile {
  return regressionsFileSchema.parse({ schemaVersion: 2, items: [] });
}

export type { RegressionProfile, RegressionRun, RegressionThresholds };
