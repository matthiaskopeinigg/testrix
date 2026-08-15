import { z } from 'zod';

import type { LoadTestArtifact, LoadTestTreeItem } from './load-tests.schema';

export const MONITORS_FILE_NAME = 'monitors.json';

export const MONITOR_TARGET_KIND_IDS = ['request', 'flow', 'load-test'] as const;
export type MonitorTargetKind = (typeof MONITOR_TARGET_KIND_IDS)[number];

export const MAX_MONITOR_RESULTS = 100;

export const monitorTargetKindSchema = z.enum(MONITOR_TARGET_KIND_IDS);

export const monitorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(256),
  cron: z.string().min(1).max(128),
  enabled: z.boolean().default(true),
  targetKind: monitorTargetKindSchema,
  targetId: z.string().min(1),
  /**
   * `null` / omit — inherit from the collection request or flow.
   * `""` — force no environment.
   * Profile id — override.
   */
  environmentId: z.string().nullable().optional(),
  lastRunAt: z.string().optional(),
  nextRunAt: z.string().optional(),
});

export type MonitorDefinition = z.infer<typeof monitorSchema>;

export const monitorResultSchema = z.object({
  id: z.string().min(1),
  monitorId: z.string().min(1),
  startedAt: z.string(),
  finishedAt: z.string(),
  ok: z.boolean(),
  message: z.string().max(2_000).default(''),
  statusCode: z.number().int().optional(),
});

export type MonitorResult = z.infer<typeof monitorResultSchema>;

export const monitorsFileSchema = z.object({
  schemaVersion: z.literal(1),
  monitors: z.array(monitorSchema).default([]),
  results: z.array(monitorResultSchema).max(MAX_MONITOR_RESULTS).default([]),
});

export type MonitorsFile = z.infer<typeof monitorsFileSchema>;

/** Empty monitors workspace file. */
export function createDefaultMonitorsFile(): MonitorsFile {
  return { schemaVersion: 1, monitors: [], results: [] };
}

/** Parses a monitors file, filling defaults. */
export function parseMonitorsFile(raw: unknown): MonitorsFile {
  const parsed = monitorsFileSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data;
  }
  return createDefaultMonitorsFile();
}

/** Prepends a result and caps history. */
export function prependMonitorResult(
  results: readonly MonitorResult[],
  result: MonitorResult,
  max = MAX_MONITOR_RESULTS,
): MonitorResult[] {
  return [result, ...results].slice(0, max);
}

/** Finds a load-test artifact by id in the nested tree. */
export function findLoadTestArtifactInTree(
  items: readonly LoadTestTreeItem[],
  id: string,
): LoadTestArtifact | null {
  for (const item of items) {
    if ('profile' in item) {
      if (item.id === id) {
        return item;
      }
    } else {
      const found = findLoadTestArtifactInTree(item.children, id);
      if (found) {
        return found;
      }
    }
  }
  return null;
}
