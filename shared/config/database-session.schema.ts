import { z } from 'zod';

/** Per-query workspace UI (result split) keyed by tab resource id (`dbq:`…). */
export const databaseQueryTabSessionSchema = z.object({
  resultPanelHeightPx: z.number().int().min(120).max(4000).optional(),
  isResultPanelHidden: z.boolean().optional(),
});

export type DatabaseQueryTabSession = z.infer<typeof databaseQueryTabSessionSchema>;

export const workspaceDatabaseQueryTabsSchema = z.record(z.string(), databaseQueryTabSessionSchema);

export type WorkspaceDatabaseQueryTabsById = z.infer<typeof workspaceDatabaseQueryTabsSchema>;

export const workspaceDatabaseSchema = z.object({
  connectionsExpanded: z.boolean().default(true),
  queriesExpanded: z.boolean().default(true),
  queryExpandedIds: z.array(z.string()).default([]),
  connectionExpandedIds: z.array(z.string()).default([]),
  showSystemObjects: z.boolean().default(false),
  queryTabsById: workspaceDatabaseQueryTabsSchema.default({}),
});

export type WorkspaceDatabaseState = z.infer<typeof workspaceDatabaseSchema>;

/** Default Database sidebar session slice. */
export function createDefaultWorkspaceDatabase(): WorkspaceDatabaseState {
  return workspaceDatabaseSchema.parse({});
}

/** Resolves per-query result-panel session, falling back to defaults. */
export function resolveDatabaseQueryTabSession(
  byId: WorkspaceDatabaseQueryTabsById | undefined,
  resourceId: string,
): DatabaseQueryTabSession {
  const raw = byId?.[resourceId];
  const parsed = databaseQueryTabSessionSchema.safeParse(raw ?? {});
  const data = parsed.success ? parsed.data : {};
  return {
    resultPanelHeightPx: data.resultPanelHeightPx,
    isResultPanelHidden: data.isResultPanelHidden ?? false,
  };
}

function mergeQueryTabsById(
  base: WorkspaceDatabaseQueryTabsById,
  patch: Readonly<Record<string, Partial<DatabaseQueryTabSession>>> | undefined,
): WorkspaceDatabaseQueryTabsById {
  if (!patch) {
    return { ...base };
  }
  const next: Record<string, DatabaseQueryTabSession> = { ...base };
  for (const [id, tab] of Object.entries(patch)) {
    next[id] = databaseQueryTabSessionSchema.parse({ ...base[id], ...tab });
  }
  return next;
}

/** Merges a partial Database sidebar session patch onto the current slice. */
export function mergeWorkspaceDatabase(
  current: WorkspaceDatabaseState | null | undefined,
  patch: Omit<Partial<WorkspaceDatabaseState>, 'queryTabsById'> & {
    readonly queryTabsById?: Readonly<Record<string, Partial<DatabaseQueryTabSession>>>;
  },
  defaults: WorkspaceDatabaseState = createDefaultWorkspaceDatabase(),
): WorkspaceDatabaseState {
  const base = current ?? defaults;
  return workspaceDatabaseSchema.parse({
    ...base,
    ...patch,
    queryExpandedIds: patch.queryExpandedIds ? [...patch.queryExpandedIds] : [...base.queryExpandedIds],
    connectionExpandedIds: patch.connectionExpandedIds
      ? [...patch.connectionExpandedIds]
      : [...base.connectionExpandedIds],
    queryTabsById: mergeQueryTabsById(base.queryTabsById, patch.queryTabsById),
  });
}
