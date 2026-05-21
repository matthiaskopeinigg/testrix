import { z } from 'zod';

import { httpResponseSnapshotSchema } from '../http/outgoing-request.schema';

export const REQUEST_RESPONSE_TAB_IDS = [
  'body',
  'headers',
  'raw',
  'diff',
  'timeline',
  'preview',
  'cookies',
  'redirects',
  'snapshots',
] as const;

export type RequestResponseTabId = (typeof REQUEST_RESPONSE_TAB_IDS)[number];

export const requestRunSessionSchema = z.object({
  runs: z.array(httpResponseSnapshotSchema).max(20).default([]),
  compareSelection: z
    .object({
      a: z.string(),
      b: z.string(),
    })
    .nullable()
    .default(null),
  pinnedBaselineId: z.string().nullable().default(null),
  responsePanelHeightPx: z.number().int().min(120).max(1200).optional(),
  activeResponseTab: z.enum(REQUEST_RESPONSE_TAB_IDS).default('body'),
  isResponsePanelHidden: z.boolean().default(false),
});

export type RequestRunSession = z.infer<typeof requestRunSessionSchema>;

export const workspaceRequestRunsSchema = z.record(z.string(), requestRunSessionSchema);

export type WorkspaceRequestRunsById = z.infer<typeof workspaceRequestRunsSchema>;

export function resolveRequestRunSession(
  byId: WorkspaceRequestRunsById | undefined,
  requestId: string,
): RequestRunSession {
  const raw = byId?.[requestId];
  const parsed = requestRunSessionSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : requestRunSessionSchema.parse({});
}
