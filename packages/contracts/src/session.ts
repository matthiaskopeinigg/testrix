import { z } from 'zod';

import { httpMethodSchema } from './collection-tree';
import { CONFIG_SCHEMA_VERSION } from './settings';
import { parseDatabaseDiagramTabNodeId, parseDatabaseTableTabNodeId } from './database';
import { isToolId } from './tools';

export const sessionRailIdSchema = z.enum([
  'collections',
  'services',
  'database',
  'environments',
  'tools',
]);

export type SessionRailId = z.infer<typeof sessionRailIdSchema>;

export const sessionTabKindSchema = z.enum([
  'http',
  'websocket',
  'environment',
  'tool',
  'database-connection',
  'database-query',
  'database-table',
  'database-diagram',
]);

export const sessionTabSchema = z.object({
  id: z.string().min(1),
  nodeId: z.string().min(1),
  kind: sessionTabKindSchema,
  title: z.string().min(1),
  method: httpMethodSchema.optional(),
  url: z.string(),
  status: z.number().int().nullable(),
});

export type SessionTab = z.infer<typeof sessionTabSchema>;

export const sessionSelectionEntrySchema = z.object({
  ids: z.array(z.string()),
  anchorId: z.string().nullable(),
});

export type SessionSelectionEntry = z.infer<typeof sessionSelectionEntrySchema>;

export const sessionEnvironmentNodeSelectionSchema = z.object({
  ids: z.array(z.string()),
  anchorId: z.string().nullable(),
  paneId: z.string().nullable(),
});

export type SessionEnvironmentNodeSelection = z.infer<typeof sessionEnvironmentNodeSelectionSchema>;

export const sessionSelectionSchema = z.object({
  collections: sessionSelectionEntrySchema,
  environments: sessionSelectionEntrySchema,
  environmentNodes: z.record(z.string(), sessionEnvironmentNodeSelectionSchema),
  databaseConnections: sessionSelectionEntrySchema.default({ ids: [], anchorId: null }),
  databaseQueries: sessionSelectionEntrySchema.default({ ids: [], anchorId: null }),
});

export type SessionSelection = z.infer<typeof sessionSelectionSchema>;

export const sessionGroupSchema = z.object({
  id: z.string().min(1),
  tabs: z.array(sessionTabSchema),
  activeTabId: z.string().nullable(),
  selectedTabIds: z.array(z.string()).default([]),
  tabAnchorId: z.string().nullable().default(null),
});

export type SessionGroup = z.infer<typeof sessionGroupSchema>;

export const DEFAULT_SELECTION_ENTRY: SessionSelectionEntry = {
  ids: [],
  anchorId: null,
};

export const DEFAULT_SESSION_SELECTION: SessionSelection = {
  collections: { ...DEFAULT_SELECTION_ENTRY },
  environments: { ...DEFAULT_SELECTION_ENTRY },
  environmentNodes: {},
  databaseConnections: { ...DEFAULT_SELECTION_ENTRY },
  databaseQueries: { ...DEFAULT_SELECTION_ENTRY },
};

export const sessionFileSchema = z.object({
  schemaVersion: z.number().int().positive(),
  sidebarCollapsed: z.boolean(),
  sidebarWidth: z.number().int().positive(),
  activeRail: sessionRailIdSchema,
  focusedGroupId: z.string().nullable(),
  splitSizes: z.array(z.number().positive()),
  groups: z.array(sessionGroupSchema),
  selection: sessionSelectionSchema,
});

export type SessionFile = z.infer<typeof sessionFileSchema>;

export const DEFAULT_SESSION_FILE: SessionFile = {
  schemaVersion: CONFIG_SCHEMA_VERSION,
  sidebarCollapsed: false,
  sidebarWidth: 248,
  activeRail: 'collections',
  focusedGroupId: null,
  splitSizes: [1],
  groups: [],
  selection: { ...DEFAULT_SESSION_SELECTION, environmentNodes: {} },
};

/**
 * Drops tabs and selections that no longer exist after a workspace switch.
 * Sidebar chrome (rail, width, collapsed) is kept.
 */
export function sanitizeSessionForWorkspace(
  session: SessionFile,
  validCollectionIds: ReadonlySet<string>,
  validEnvironmentIds: ReadonlySet<string>,
  validDatabaseTabIds: ReadonlySet<string> = new Set(),
  validDatabaseConnectionIds: ReadonlySet<string> = new Set(),
  validDatabaseQueryIds: ReadonlySet<string> = new Set(),
): SessionFile {
  const validTabNodes = new Set([...validCollectionIds, ...validEnvironmentIds]);
  const groups = session.groups
    .map((group) => {
      const tabs = group.tabs.filter((tab) =>
        isSessionTabAlive(tab, validTabNodes, validDatabaseTabIds, validDatabaseConnectionIds),
      );
      const tabIds = new Set(tabs.map((tab) => tab.id));
      const selected = sanitizeSelectionEntry(
        { ids: group.selectedTabIds, anchorId: group.tabAnchorId },
        tabIds,
      );
      const activeTabId =
        group.activeTabId && tabIds.has(group.activeTabId)
          ? group.activeTabId
          : (tabs[tabs.length - 1]?.id ?? null);
      return {
        ...group,
        tabs,
        activeTabId,
        selectedTabIds: selected.ids,
        tabAnchorId: selected.anchorId,
      };
    })
    .filter((group) => group.tabs.length > 0);
  const focusedGroupId =
    session.focusedGroupId && groups.some((group) => group.id === session.focusedGroupId)
      ? session.focusedGroupId
      : (groups[0]?.id ?? null);
  const splitSizes =
    groups.length === 0
      ? [1]
      : groups.length === session.splitSizes.length
        ? session.splitSizes
        : Array.from({ length: Math.max(1, groups.length) }, () => 1 / Math.max(1, groups.length));

  const environmentNodes: SessionFile['selection']['environmentNodes'] = {};
  for (const [envId, entry] of Object.entries(session.selection.environmentNodes)) {
    if (!validEnvironmentIds.has(envId)) {
      continue;
    }
    environmentNodes[envId] = entry;
  }

  return {
    ...session,
    focusedGroupId,
    splitSizes,
    groups,
    selection: {
      collections: sanitizeSelectionEntry(session.selection.collections, validCollectionIds),
      environments: sanitizeSelectionEntry(session.selection.environments, validEnvironmentIds),
      environmentNodes,
      databaseConnections: sanitizeSelectionEntry(
        session.selection.databaseConnections ?? DEFAULT_SELECTION_ENTRY,
        validDatabaseConnectionIds,
      ),
      databaseQueries: sanitizeSelectionEntry(
        session.selection.databaseQueries ?? DEFAULT_SELECTION_ENTRY,
        validDatabaseQueryIds,
      ),
    },
  };
}

/**
 * Drops ids that are no longer in `valid`. If the anchor is gone, uses the last remaining id.
 */
export function sanitizeSelectionEntry(
  entry: SessionSelectionEntry,
  valid: ReadonlySet<string>,
): SessionSelectionEntry {
  const ids = entry.ids.filter((id) => valid.has(id));
  const anchorId =
    entry.anchorId && ids.includes(entry.anchorId) ? entry.anchorId : (ids[ids.length - 1] ?? null);
  return { ids, anchorId };
}

function parseSelection(raw: unknown): SessionSelection {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      collections: { ...DEFAULT_SELECTION_ENTRY },
      environments: { ...DEFAULT_SELECTION_ENTRY },
      environmentNodes: {},
      databaseConnections: { ...DEFAULT_SELECTION_ENTRY },
      databaseQueries: { ...DEFAULT_SELECTION_ENTRY },
    };
  }
  const source = raw as Record<string, unknown>;
  const parsed = sessionSelectionSchema.safeParse({
    collections: source['collections'] ?? DEFAULT_SELECTION_ENTRY,
    environments: source['environments'] ?? DEFAULT_SELECTION_ENTRY,
    environmentNodes: source['environmentNodes'] ?? {},
    databaseConnections: source['databaseConnections'] ?? DEFAULT_SELECTION_ENTRY,
    databaseQueries: source['databaseQueries'] ?? DEFAULT_SELECTION_ENTRY,
  });
  return parsed.success
    ? parsed.data
    : {
        collections: { ...DEFAULT_SELECTION_ENTRY },
        environments: { ...DEFAULT_SELECTION_ENTRY },
        environmentNodes: {},
        databaseConnections: { ...DEFAULT_SELECTION_ENTRY },
        databaseQueries: { ...DEFAULT_SELECTION_ENTRY },
      };
}

function isSessionTabAlive(
  tab: SessionTab,
  validTabNodes: ReadonlySet<string>,
  validDatabaseTabIds: ReadonlySet<string>,
  validDatabaseConnectionIds: ReadonlySet<string>,
): boolean {
  if (tab.kind === 'tool')
    return isToolId(tab.nodeId);
  if (tab.kind === 'database-connection' || tab.kind === 'database-query')
    return validDatabaseTabIds.has(tab.nodeId);
  if (tab.kind === 'database-table') {
    const target = parseDatabaseTableTabNodeId(tab.nodeId);
    return target ? validDatabaseConnectionIds.has(target.connectionId) : false;
  }
  if (tab.kind === 'database-diagram') {
    const target = parseDatabaseDiagramTabNodeId(tab.nodeId);
    return target ? validDatabaseConnectionIds.has(target.connectionId) : false;
  }
  return validTabNodes.has(tab.nodeId);
}

export function parseSessionFile(raw: unknown): SessionFile {
  const source =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const activeRail = source['activeRail'] === 'testing' ? 'services' : source['activeRail'];
  return sessionFileSchema.parse({
    ...DEFAULT_SESSION_FILE,
    ...source,
    activeRail: activeRail ?? DEFAULT_SESSION_FILE.activeRail,
    selection: parseSelection(source['selection']),
    schemaVersion: CONFIG_SCHEMA_VERSION,
  });
}
