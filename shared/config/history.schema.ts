import { z } from 'zod';

import { httpKeyValueRowSchema } from './http-settings.schema';
import { httpResponseHeaderSchema, httpResponseSnapshotSchema } from '../http/outgoing-request.schema';

const metaHistorySchema = z.object({
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Request fields captured when a run is appended to history. */
export const historyRequestCaptureSchema = z.object({
  headers: z.array(httpResponseHeaderSchema).default([]),
  queryParams: z.array(httpKeyValueRowSchema).default([]),
  body: z.string().optional(),
});

export type HistoryRequestCapture = z.infer<typeof historyRequestCaptureSchema>;

export const historyItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  method: z.string().min(1),
  url: z.string().min(1),
  requestedAt: z.string(),
  order: z.number().optional(),
  requestId: z.string().optional(),
  snapshotId: z.string().optional(),
  snapshot: httpResponseSnapshotSchema.optional(),
  request: historyRequestCaptureSchema.optional(),
});

export type HistoryItem = z.infer<typeof historyItemSchema>;

export const historyFileSchema = z.object({
  schemaVersion: z.literal(1),
  meta: metaHistorySchema,
  items: z.array(historyItemSchema),
});

export type HistoryFile = z.infer<typeof historyFileSchema>;
