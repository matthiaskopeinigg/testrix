import { z } from 'zod';

export const captureHeaderPairSchema = z.object({
  key: z.string(),
  value: z.string(),
});

export type CaptureHeaderPair = z.infer<typeof captureHeaderPairSchema>;

export const captureLogEntrySchema = z.object({
  id: z.string().min(1),
  captureItemId: z.string().min(1),
  method: z.string(),
  url: z.string(),
  resourceType: z.string().optional(),
  statusCode: z.number().int().nullable().optional(),
  timeMs: z.number().nullable().optional(),
  at: z.string(),
  requestHeaders: z.array(captureHeaderPairSchema).default([]),
  responseHeaders: z.array(captureHeaderPairSchema).default([]),
  requestBody: z.string().default(''),
  responseBody: z.string().default(''),
  requestBodyTruncated: z.boolean().default(false),
  requestBodyIsBinary: z.boolean().default(false),
  responseBodyTruncated: z.boolean().default(false),
  responseBodyIsBinary: z.boolean().default(false),
});

export type CaptureLogEntry = z.infer<typeof captureLogEntrySchema>;

export const captureStartOptionsSchema = z.object({
  captureItemId: z.string().min(1),
  startUrl: z.string().max(4_096).default('about:blank'),
});

export type CaptureStartOptions = z.infer<typeof captureStartOptionsSchema>;

export const captureRuntimeStatusSchema = z.object({
  running: z.boolean(),
  captureItemId: z.string().nullable().optional(),
  runId: z.string().nullable().optional(),
  error: z.string().optional(),
});

export type CaptureRuntimeStatus = z.infer<typeof captureRuntimeStatusSchema>;
