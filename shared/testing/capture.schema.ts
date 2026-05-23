import { z } from 'zod';

import { captureLogEntrySchema } from './capture-log-entry.schema';
import { captureTrafficFilterPrefsSchema } from './capture-traffic-prefs.schema';

const boundedText = (max: number) => z.string().max(max);

/** Maximum traffic rows persisted per capture session in `capture.json`. */
export const MAX_CAPTURE_PERSISTED_TRAFFIC = 400;

export const captureItemSchema = z.object({
  id: z.string().min(1),
  name: boundedText(256),
  startUrl: boundedText(4_096),
  updatedAt: z.string(),
  traffic: z.array(captureLogEntrySchema).max(MAX_CAPTURE_PERSISTED_TRAFFIC).default([]),
  trafficFilter: captureTrafficFilterPrefsSchema.optional(),
});

export const captureFolderSchema: z.ZodType<CaptureFolder> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    name: boundedText(256),
    children: z.array(captureTreeItemSchema).default([]),
    updatedAt: z.string(),
  }),
);

export type CaptureFolder = {
  readonly id: string;
  readonly name: string;
  readonly children: readonly CaptureTreeItem[];
  readonly updatedAt: string;
};

export const captureTreeItemSchema = z.union([captureItemSchema, captureFolderSchema]);

export type CaptureTreeItem = CaptureFolder | z.infer<typeof captureItemSchema>;
export type CaptureItem = z.infer<typeof captureItemSchema>;

export const captureFileV2Schema = z.object({
  schemaVersion: z.literal(2),
  active: z.boolean().default(false),
  items: z.array(captureTreeItemSchema).default([]),
});

export const captureFileSchema = z.object({
  schemaVersion: z.literal(3),
  active: z.boolean().default(false),
  items: z.array(captureTreeItemSchema).default([]),
});

/** Legacy flat capture file (schema v1). */
export const captureFileV1Schema = z.object({
  schemaVersion: z.literal(1),
  active: z.boolean().default(false),
  items: z.array(captureItemSchema).default([]),
});

export type CaptureFile = z.infer<typeof captureFileSchema>;

/**
 * Returns true when a tree item is a capture session (not a folder).
 */
export function isCaptureItem(item: CaptureTreeItem): item is CaptureItem {
  return 'startUrl' in item;
}

/**
 * Returns an empty capture workspace file.
 */
export function createDefaultCaptureFile(): CaptureFile {
  return captureFileSchema.parse({ schemaVersion: 3 });
}

/**
 * Builds a new capture session item with defaults.
 */
export function createDefaultCaptureItem(id: string, name = 'New capture', updatedAt?: string): CaptureItem {
  const ts = updatedAt ?? new Date().toISOString();
  return captureItemSchema.parse({
    id,
    name,
    startUrl: 'https://example.com',
    updatedAt: ts,
  });
}
