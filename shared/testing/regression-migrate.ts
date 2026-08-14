import { regressionRunSchema } from './regression-run.schema';
import {
  createDefaultRegressionArtifactPayload,
  regressionsFileSchema,
  regressionsFileV1Schema,
  type RegressionsFile,
  type RegressionTreeItem,
} from './regressions.schema';

/**
 * Migrates a regressions workspace file from v1 flat list to v2 tree at root level.
 */
export function migrateRegressionsFile(raw: unknown): RegressionsFile {
  const v2 = regressionsFileSchema.safeParse(raw);
  if (v2.success) {
    return v2.data;
  }

  const v1 = regressionsFileV1Schema.safeParse(raw);
  if (!v1.success) {
    return regressionsFileSchema.parse({ schemaVersion: 2, items: [] });
  }

  const items: RegressionTreeItem[] = v1.data.items.map((item) => {
    const ts = item.updatedAt || new Date().toISOString();
    const runs = item.runs
      .map((run) => {
        const parsed = regressionRunSchema.safeParse(run);
        return parsed.success ? parsed.data : null;
      })
      .filter((run): run is NonNullable<typeof run> => run !== null);

    const artifact = createDefaultRegressionArtifactPayload(item.id, item.name, ts);
    return {
      ...artifact,
      description: item.description ?? '',
      flowIds: [...item.flowIds],
      runs,
      createdAt: ts,
      updatedAt: ts,
    };
  });

  return regressionsFileSchema.parse({ schemaVersion: 2, items });
}
