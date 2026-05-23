import { z } from 'zod';

import {
  CAPTURE_RESOURCE_CATEGORY_IDS,
  CAPTURE_TRAFFIC_FILTER_SCOPE_IDS,
  type CaptureResourceCategory,
  type CaptureTrafficFilterScope,
} from './capture-traffic-filter';

export const captureTrafficFilterPrefsSchema = z.object({
  query: z.string().default(''),
  scope: z.enum(CAPTURE_TRAFFIC_FILTER_SCOPE_IDS).default('all'),
  resourceCategory: z.enum(CAPTURE_RESOURCE_CATEGORY_IDS).default('all'),
});

export type CaptureTrafficFilterPrefs = z.infer<typeof captureTrafficFilterPrefsSchema>;

/**
 * Returns default traffic filter prefs for a capture session tab.
 */
export function createDefaultCaptureTrafficFilterPrefs(): CaptureTrafficFilterPrefs {
  return captureTrafficFilterPrefsSchema.parse({});
}

/**
 * Coerces unknown persisted traffic filter prefs.
 */
export function coerceCaptureTrafficFilterPrefs(raw: unknown): CaptureTrafficFilterPrefs {
  return captureTrafficFilterPrefsSchema.parse(raw ?? {});
}

export type {
  CaptureResourceCategory,
  CaptureTrafficFilterScope,
} from './capture-traffic-filter';
