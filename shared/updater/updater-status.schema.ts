import { z } from 'zod';

export const UPDATER_STATE_IDS = [
  'idle',
  'checking',
  'available',
  'not-available',
  'downloading',
  'downloaded',
  'error',
  'disabled',
] as const;

export type UpdaterState = (typeof UPDATER_STATE_IDS)[number];

export const UPDATE_CHANNEL_IDS = ['stable', 'beta'] as const;

export type UpdateChannel = (typeof UPDATE_CHANNEL_IDS)[number];

export const updaterInfoSchema = z.object({
  version: z.string().optional(),
  releaseNotes: z.string().nullable().optional(),
  releasePageUrl: z.string().nullable().optional(),
  percent: z.number().min(0).max(100).optional(),
  bytesPerSecond: z.number().nonnegative().optional(),
  transferred: z.number().nonnegative().optional(),
  total: z.number().nonnegative().optional(),
  devPreviewOnly: z.boolean().optional(),
  externalOnly: z.boolean().optional(),
  installerAssetName: z.string().optional(),
  installerDownloadUrl: z.string().optional(),
  installerLocalPath: z.string().optional(),
});

export type UpdaterInfo = z.infer<typeof updaterInfoSchema>;

export const updaterStatusSchema = z.object({
  state: z.enum(UPDATER_STATE_IDS),
  info: updaterInfoSchema.nullable(),
  message: z.string().optional(),
});

export type UpdaterStatus = z.infer<typeof updaterStatusSchema>;

export const updateCheckCacheSchema = z.object({
  checkedAt: z.string(),
  channel: z.enum(UPDATE_CHANNEL_IDS).optional(),
  status: updaterStatusSchema,
});

export type UpdateCheckCache = z.infer<typeof updateCheckCacheSchema>;
