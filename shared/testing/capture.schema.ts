import { z } from 'zod';

const boundedText = (max: number) => z.string().max(max);

export const captureItemSchema = z.object({
  id: z.string().min(1),
  name: boundedText(256),
  startUrl: boundedText(4_096).default('about:blank'),
  updatedAt: z.string(),
});

export const captureFileSchema = z.object({
  schemaVersion: z.literal(1),
  active: z.boolean().default(false),
  items: z.array(captureItemSchema).default([]),
});

export type CaptureFile = z.infer<typeof captureFileSchema>;
export type CaptureItem = z.infer<typeof captureItemSchema>;

/**
 * Returns an empty capture workspace file.
 */
export function createDefaultCaptureFile(): CaptureFile {
  return captureFileSchema.parse({ schemaVersion: 1 });
}
