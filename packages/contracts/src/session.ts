import { z } from 'zod';

import { httpMethodSchema } from './collection-tree';
import {
  requestResponseTabSchema,
  requestTabSectionSchema,
} from './collection-request';
import { websocketTabSectionSchema } from './collection-websocket';
import { historyGroupBySchema, requestRunSnapshotSchema } from './history';
import { newEntityId } from './entity-id';
import { CONFIG_SCHEMA_VERSION } from './settings';
import { parseDatabaseDiagramTabNodeId, parseDatabaseTableTabNodeId } from './database';
import { isServiceId, serviceIdSchema } from './services';
import { isToolId } from './tools';

export const sessionRailIdSchema = z.enum([
  'collections',
  'services',
  'database',
  'environments',
  'tools',
  'history',
]);

export type SessionRailId = z.infer<typeof sessionRailIdSchema>;

/** Tabs in the Collab dock. */
export const collabDockTabSchema = z.enum(['overview', 'workspaces', 'activity', 'people', 'runs']);

export type CollabDockTab = z.infer<typeof collabDockTabSchema>;

export const sessionTabKindSchema = z.enum([
  'http',
  'websocket',
  'collection-folder',
  'environment',
  'tool',
  'service',
  'flow',
  'flow-template',
  'load',
  'regression',
  'emulator',
  'mock-endpoint',
  'listener-session',
  'intercept-rule',
  'database-connection',
  'database-query',
  'database-table',
  'database-diagram',
  'history',
  'plantuml',
  'collab-review',
]);

export const SERVICE_ARTIFACT_TAB_KINDS = [
  'flow',
  'load',
  'regression',
  'mock-endpoint',
  'listener-session',
  'intercept-rule',
] as const;

export type ServiceArtifactTabKind = (typeof SERVICE_ARTIFACT_TAB_KINDS)[number];

export function isServiceArtifactTabKind(kind: string): kind is ServiceArtifactTabKind {
  return (SERVICE_ARTIFACT_TAB_KINDS as readonly string[]).includes(kind);
}

export const folderTabSectionSchema = z.enum([
  'overview',
  'variables',
  'headers',
  'auth',
  'scripts',
  'settings',
  'docs',
]);

export type FolderTabSection = z.infer<typeof folderTabSectionSchema>;

export const folderScriptPaneSchema = z.enum(['pre', 'post']);

export type FolderScriptPane = z.infer<typeof folderScriptPaneSchema>;

export const folderDocsModeSchema = z.enum(['write', 'split', 'preview']);

export type FolderDocsMode = z.infer<typeof folderDocsModeSchema>;

export const sessionTabSchema = z.object({
  id: z.string().min(1),
  nodeId: z.string().min(1),
  kind: sessionTabKindSchema,
  title: z.string().min(1),
  method: httpMethodSchema.optional(),
  url: z.string(),
  status: z.number().int().nullable(),
  folderSection: folderTabSectionSchema.optional(),
  folderScriptPane: folderScriptPaneSchema.optional(),
  folderDocsMode: folderDocsModeSchema.optional(),
  requestSection: requestTabSectionSchema.optional(),
  requestScriptPane: folderScriptPaneSchema.optional(),
  requestDocsMode: folderDocsModeSchema.optional(),
  requestSplitRatio: z.number().min(0).max(0.95).optional(),
  requestResponseTab: requestResponseTabSchema.optional(),
  requestResponseHidden: z.boolean().optional(),
  requestSnippetLang: z.enum(['curl', 'fetch', 'httpie']).optional(),
  websocketSection: websocketTabSectionSchema.optional(),
  /** Load / Regression results dock collapsed. */
  resultsDockHidden: z.boolean().optional(),
  /** PlantUML tab: Grid, Source, or Build. */
  plantumlView: z.enum(['grid', 'source', 'build']).optional(),
  plantumlGridZoom: z.number().optional(),
  plantumlGridPanX: z.number().optional(),
  plantumlGridPanY: z.number().optional(),
  plantumlPreviewZoom: z.number().optional(),
  plantumlPreviewPanX: z.number().optional(),
  plantumlPreviewPanY: z.number().optional(),
  plantumlBuilderWidth: z.number().optional(),
  plantumlBuilderCollapsed: z.boolean().optional(),
  serviceSection: z.string().optional(),
  /** Flow editor: Design / Data / Runs / Settings is `serviceSection`. */
  flowOutlineOpen: z.boolean().optional(),
  flowSelectedNodeIds: z.array(z.string()).optional(),
  flowScenarioId: z.string().optional(),
  readonly: z.boolean().optional(),
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

export const sessionServiceSidebarSchema = z.object({
  search: z.string().default(''),
  expandedIds: z.array(z.string()).default([]),
  sort: z.enum(['manual', 'name', 'updated']).default('manual'),
  tags: z.array(z.string()).default([]),
});

export type SessionServiceSidebar = z.infer<typeof sessionServiceSidebarSchema>;

/** Flow templates sidebar chrome (open state, search, sort, filters, collapse). */
export const sessionFlowTemplatesSidebarSchema = z.object({
  panelOpen: z.boolean().default(false),
  search: z.string().default(''),
  sort: z.enum(['manual', 'name']).default('manual'),
  tags: z.array(z.string()).default([]),
  collapsedGroupIds: z.array(z.string()).default([]),
});

export type SessionFlowTemplatesSidebar = z.infer<typeof sessionFlowTemplatesSidebarSchema>;

export const DEFAULT_FLOW_TEMPLATES_SIDEBAR: SessionFlowTemplatesSidebar = {
  panelOpen: false,
  search: '',
  sort: 'manual',
  tags: [],
  collapsedGroupIds: [],
};

/** Per-request editor chrome that survives closing the tab and restarting. */
export const sessionRequestViewSchema = z.object({
  section: requestTabSectionSchema.optional(),
  scriptPane: folderScriptPaneSchema.optional(),
  docsMode: folderDocsModeSchema.optional(),
  splitRatio: z.number().min(0).max(0.95).optional(),
  responseTab: requestResponseTabSchema.optional(),
  responseHidden: z.boolean().optional(),
  snippetLang: z.enum(['curl', 'fetch', 'httpie']).optional(),
  websocketSection: websocketTabSectionSchema.optional(),
});

export type SessionRequestView = z.infer<typeof sessionRequestViewSchema>;

/** Reads editor chrome off a session tab. Absent fields stay unset. */
export function requestViewFromTab(tab: Partial<SessionTab>): SessionRequestView {
  const view: SessionRequestView = {};
  if (tab.requestSection)
    view.section = tab.requestSection;
  if (tab.requestScriptPane)
    view.scriptPane = tab.requestScriptPane;
  if (tab.requestDocsMode)
    view.docsMode = tab.requestDocsMode;
  if (typeof tab.requestSplitRatio === 'number')
    view.splitRatio = tab.requestSplitRatio;
  if (tab.requestResponseTab)
    view.responseTab = tab.requestResponseTab;
  if (typeof tab.requestResponseHidden === 'boolean')
    view.responseHidden = tab.requestResponseHidden;
  if (tab.requestSnippetLang)
    view.snippetLang = tab.requestSnippetLang;
  if (tab.websocketSection)
    view.websocketSection = tab.websocketSection;
  return view;
}

/** Maps a saved request view back onto tab fields. */
export function tabChromeFromRequestView(view: SessionRequestView | undefined): Partial<SessionTab> {
  if (!view)
    return {};
  const chrome: Partial<SessionTab> = {};
  if (view.section)
    chrome.requestSection = view.section;
  if (view.scriptPane)
    chrome.requestScriptPane = view.scriptPane;
  if (view.docsMode)
    chrome.requestDocsMode = view.docsMode;
  if (typeof view.splitRatio === 'number')
    chrome.requestSplitRatio = view.splitRatio;
  if (view.responseTab)
    chrome.requestResponseTab = view.responseTab;
  if (typeof view.responseHidden === 'boolean')
    chrome.requestResponseHidden = view.responseHidden;
  if (view.snippetLang)
    chrome.requestSnippetLang = view.snippetLang;
  if (view.websocketSection)
    chrome.websocketSection = view.websocketSection;
  return chrome;
}

/** Per-artifact results/response dock chrome that survives closing the tab. */
export const sessionResultsDockSchema = z.object({
  hidden: z.boolean().default(false),
});

export type SessionResultsDock = z.infer<typeof sessionResultsDockSchema>;

const listenerNetworkSortSchema = z.enum(['time-desc', 'time-asc', 'method', 'status', 'url']);

/** Listener Network list chrome that survives tab close and restart. */
export const sessionListenerUiSchema = z.object({
  search: z.string().default(''),
  sort: listenerNetworkSortSchema.default('time-desc'),
});

export type SessionListenerUi = z.infer<typeof sessionListenerUiSchema>;

export const DEFAULT_LISTENER_UI: SessionListenerUi = {
  search: '',
  sort: 'time-desc',
};

/** Interceptor Activity list chrome that survives tab close and restart. */
export const sessionInterceptUiSchema = z.object({
  search: z.string().default(''),
  sort: listenerNetworkSortSchema.default('time-desc'),
});

export type SessionInterceptUi = z.infer<typeof sessionInterceptUiSchema>;

export const DEFAULT_INTERCEPT_UI: SessionInterceptUi = {
  search: '',
  sort: 'time-desc',
};

/** Max persisted flow runs kept per scenario in the session. */
export const FLOW_RUN_HISTORY_MAX = 20;

export function newFlowRunId(_now = Date.now()): string {
  return newEntityId();
}

/** One completed flow run — restores canvas badges and feeds the History section. */
export const sessionFlowLastRunSchema = z.object({
  id: z.string().default(''),
  at: z.string().default(''),
  scenarioId: z.string().default(''),
  scenarioName: z.string().default(''),
  passed: z.number().int().nonnegative().default(0),
  failed: z.number().int().nonnegative().default(0),
  skipped: z.number().int().nonnegative().default(0),
  cancelled: z.number().int().nonnegative().default(0),
  statuses: z.record(z.string(), z.string()).default({}),
  messages: z.record(z.string(), z.string()).default({}),
  exchanges: z.record(z.string(), z.any()).default({}),
});

export type SessionFlowLastRun = z.infer<typeof sessionFlowLastRunSchema>;

/**
 * Prepends a run snapshot and caps history length (newest first).
 */
export function prependFlowRun(
  runs: readonly SessionFlowLastRun[],
  snapshot: SessionFlowLastRun,
): SessionFlowLastRun[] {
  const id = snapshot.id || newFlowRunId();
  const next = [{ ...snapshot, id }, ...runs.filter((run) => run.id !== id)];
  return next.slice(0, FLOW_RUN_HISTORY_MAX);
}

/** Per-flow editor chrome that survives closing the tab. */
export const sessionFlowUiSchema = z
  .object({
    outlineOpen: z.boolean().default(false),
    scenarioId: z.string().optional(),
    selectedNodeIds: z.array(z.string()).default([]),
    section: z.string().optional(),
    /** Newest-first run history per scenario id. */
    runHistoryByScenarioId: z.record(z.string(), z.array(sessionFlowLastRunSchema)).default({}),
    /** @deprecated Migrated into runHistoryByScenarioId. */
    lastRunByScenarioId: z.record(z.string(), sessionFlowLastRunSchema).optional(),
  })
  .transform((value) => {
    const history: Record<string, SessionFlowLastRun[]> = { ...(value.runHistoryByScenarioId ?? {}) };
    for (const [scenarioId, snap] of Object.entries(value.lastRunByScenarioId ?? {})) {
      if ((history[scenarioId]?.length ?? 0) > 0)
        continue;
      history[scenarioId] = [sessionFlowLastRunSchema.parse({ ...snap, scenarioId })];
    }
    return {
      outlineOpen: value.outlineOpen,
      scenarioId: value.scenarioId,
      selectedNodeIds: value.selectedNodeIds,
      section: value.section,
      runHistoryByScenarioId: history,
    };
  });

export type SessionFlowUi = z.output<typeof sessionFlowUiSchema>;

/** Crash-recovery snapshot for an in-progress flow or load run. */
export const sessionRunCheckpointSchema = z.object({
  savedAt: z.string(),
  kind: z.enum(['flow', 'load']),
  json: z.string(),
});

export type SessionRunCheckpoint = z.infer<typeof sessionRunCheckpointSchema>;

export const palettePinKindSchema = z.enum(['http', 'websocket', 'flow']);

export type PalettePinKind = z.infer<typeof palettePinKindSchema>;

export const palettePinSchema = z.object({
  kind: palettePinKindSchema,
  id: z.string().min(1),
  label: z.string(),
});

export type PalettePin = z.infer<typeof palettePinSchema>;

export const MAX_PALETTE_PINS = 20;

export const sessionFileSchema = z.object({
  schemaVersion: z.number().int().positive(),
  sidebarCollapsed: z.boolean(),
  sidebarWidth: z.number().int().positive(),
  /** Collab dock on the right edge. */
  collabDockOpen: z.boolean().default(false),
  collabDockWidth: z.number().int().positive().default(360),
  collabDockTab: collabDockTabSchema.default('overview'),
  /** Flow Design inspector width for normal nodes (session-persisted). */
  flowInspectorWidth: z.number().int().positive().default(300),
  /** Flow Design inspector width for wide nodes (request, database, intercept). */
  flowInspectorWideWidth: z.number().int().positive().default(460),
  activeRail: sessionRailIdSchema,
  activeService: serviceIdSchema.nullable().default(null),
  toolsDrill: z.preprocess(
    (value) => (value === 'plantuml' ? 'plantuml' : null),
    z.enum(['plantuml']).nullable().default(null),
  ),
  serviceSidebar: z.record(z.string(), sessionServiceSidebarSchema).default({}),
  flowTemplatesSidebar: sessionFlowTemplatesSidebarSchema.default(DEFAULT_FLOW_TEMPLATES_SIDEBAR),
  flowUiById: z.record(z.string(), sessionFlowUiSchema).default({}),
  resultsDockByNodeId: z.record(z.string(), sessionResultsDockSchema).default({}),
  requestViewsByNodeId: z.record(z.string(), sessionRequestViewSchema).default({}),
  /** Listener Network search/sort keyed by listener node id (survives tab close). */
  listenerUiById: z.record(z.string(), sessionListenerUiSchema).default({}),
  /** Interceptor Activity search/sort keyed by intercept node id (survives tab close). */
  interceptUiById: z.record(z.string(), sessionInterceptUiSchema).default({}),
  /** Last open section per service artifact node id (survives tab close). */
  serviceSectionByNodeId: z.record(z.string(), z.string()).default({}),
  /** Command-palette pins keyed by workspace id (max 20 per workspace). */
  palettePinsByWorkspace: z.record(z.string(), z.array(palettePinSchema).max(MAX_PALETTE_PINS)).default({}),
  focusedGroupId: z.string().nullable(),
  splitSizes: z.array(z.number().positive()),
  groups: z.array(sessionGroupSchema),
  selection: sessionSelectionSchema,
  requestRunsById: z.record(z.string(), z.array(requestRunSnapshotSchema)).default({}),
  runCheckpointsByArtifactId: z.record(z.string(), sessionRunCheckpointSchema).default({}),
  /** Last History sidebar group mode for this session. */
  historyGroupBy: historyGroupBySchema.optional(),
});

export type SessionFile = z.infer<typeof sessionFileSchema>;

export const DEFAULT_SESSION_FILE: SessionFile = {
  schemaVersion: CONFIG_SCHEMA_VERSION,
  sidebarCollapsed: false,
  sidebarWidth: 248,
  collabDockOpen: false,
  collabDockWidth: 360,
  collabDockTab: 'overview',
  flowInspectorWidth: 300,
  flowInspectorWideWidth: 460,
  activeRail: 'collections',
  activeService: null,
  toolsDrill: null,
  serviceSidebar: {},
  flowTemplatesSidebar: { ...DEFAULT_FLOW_TEMPLATES_SIDEBAR },
  flowUiById: {},
  resultsDockByNodeId: {},
  requestViewsByNodeId: {},
  listenerUiById: {},
  interceptUiById: {},
  serviceSectionByNodeId: {},
  palettePinsByWorkspace: {},
  focusedGroupId: null,
  splitSizes: [1],
  groups: [],
  selection: { ...DEFAULT_SESSION_SELECTION, environmentNodes: {} },
  requestRunsById: {},
  runCheckpointsByArtifactId: {},
};

/**
 * Drops tabs and selections that no longer exist after a workspace switch.
 * Sidebar chrome (rail, width, collapsed) is kept.
 */
export type SessionServiceTabIds = Partial<Record<ServiceArtifactTabKind, ReadonlySet<string>>>;

function isValidServiceArtifactNodeId(nodeId: string, validServiceIds: SessionServiceTabIds): boolean {
  for (const ids of Object.values(validServiceIds)) {
    if (ids?.has(nodeId))
      return true;
  }
  return false;
}

export function sanitizeSessionForWorkspace(
  session: SessionFile,
  validCollectionIds: ReadonlySet<string>,
  validEnvironmentIds: ReadonlySet<string>,
  validDatabaseTabIds: ReadonlySet<string> = new Set(),
  validDatabaseConnectionIds: ReadonlySet<string> = new Set(),
  validDatabaseQueryIds: ReadonlySet<string> = new Set(),
  validHistoryIds: ReadonlySet<string> = new Set(),
  validServiceIds: SessionServiceTabIds = {},
  validPlantumlIds: ReadonlySet<string> = new Set(),
  validEmulatorDeviceIds: ReadonlySet<string> = new Set(),
): SessionFile {
  const validTabNodes = new Set([...validCollectionIds, ...validEnvironmentIds]);
  const groups = session.groups
    .map((group) => {
      const tabs = group.tabs.filter((tab) =>
        isSessionTabAlive(
          tab,
          validTabNodes,
          validDatabaseTabIds,
          validDatabaseConnectionIds,
          validHistoryIds,
          validServiceIds,
          validPlantumlIds,
          validEmulatorDeviceIds,
        ),
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
    flowUiById: Object.fromEntries(
      Object.entries(session.flowUiById ?? {}).filter(([id]) => (validServiceIds.flow?.has(id) ?? true)),
    ),
    resultsDockByNodeId: session.resultsDockByNodeId ?? {},
    requestViewsByNodeId: Object.fromEntries(
      Object.entries(session.requestViewsByNodeId ?? {}).filter(
        ([id]) => validTabNodes.has(id) || validHistoryIds.has(id),
      ),
    ),
    listenerUiById: Object.fromEntries(
      Object.entries(session.listenerUiById ?? {}).filter(
        ([id]) => validServiceIds['listener-session']?.has(id) ?? false,
      ),
    ),
    interceptUiById: Object.fromEntries(
      Object.entries(session.interceptUiById ?? {}).filter(
        ([id]) => validServiceIds['intercept-rule']?.has(id) ?? false,
      ),
    ),
    serviceSectionByNodeId: Object.fromEntries(
      Object.entries(session.serviceSectionByNodeId ?? {}).filter(([id]) =>
        isValidServiceArtifactNodeId(id, validServiceIds),
      ),
    ),
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
  validHistoryIds: ReadonlySet<string>,
  validServiceIds: SessionServiceTabIds,
  validPlantumlIds: ReadonlySet<string>,
  validEmulatorDeviceIds: ReadonlySet<string>,
): boolean {
  if (tab.kind === 'flow-template' || tab.kind === 'collab-review')
    return true;
  if (tab.kind === 'history')
    return validHistoryIds.has(tab.nodeId);
  if (tab.kind === 'plantuml')
    return validPlantumlIds.has(tab.nodeId);
  if (tab.kind === 'tool') {
    // PlantUML is a Tools drill-in, not a singleton tool tab.
    if (tab.nodeId === 'plantuml')
      return false;
    return isToolId(tab.nodeId);
  }
  if (tab.kind === 'service')
    return isServiceId(tab.nodeId);
  if (tab.kind === 'emulator')
    return validEmulatorDeviceIds.has(tab.nodeId);
  if (isServiceArtifactTabKind(tab.kind)) {
    const valid = validServiceIds[tab.kind];
    return valid ? valid.has(tab.nodeId) : false;
  }
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
  const withoutRecorder = dropRecorderSession(source);
  const rawRail = withoutRecorder['activeRail'];
  const activeRail =
    rawRail === 'testing'
      ? 'services'
      : rawRail === 'diagrams' || rawRail === 'collab'
        ? 'collections'
        : rawRail;
  return sessionFileSchema.parse({
    ...DEFAULT_SESSION_FILE,
    ...withoutRecorder,
    activeRail: activeRail ?? DEFAULT_SESSION_FILE.activeRail,
    selection: parseSelection(withoutRecorder['selection']),
    schemaVersion: CONFIG_SCHEMA_VERSION,
  });
}

function dropRecorderSession(source: Record<string, unknown>): Record<string, unknown> {
  const removedServices = new Set(['recorder', 'monitors', 'lookups']);
  const knownTabKinds = new Set<string>(sessionTabKindSchema.options);
  const activeServiceRaw = source['activeService'];
  const activeService =
    typeof activeServiceRaw === 'string' && removedServices.has(activeServiceRaw)
      ? null
      : activeServiceRaw;
  if (!Array.isArray(source['groups']))
    return { ...source, activeService };
  const groups = source['groups'].map((group) => {
    if (!group || typeof group !== 'object' || Array.isArray(group))
      return group;
    const next = group as Record<string, unknown>;
    const tabs = Array.isArray(next['tabs'])
      ? next['tabs'].filter((tab) => {
          if (!tab || typeof tab !== 'object' || Array.isArray(tab))
            return false;
          const row = tab as Record<string, unknown>;
          if (typeof row['kind'] === 'string' && !knownTabKinds.has(row['kind']))
            return false;
          if (row['kind'] === 'tool' && typeof row['nodeId'] === 'string' && !isToolId(row['nodeId']))
            return false;
          if (
            row['kind'] === 'service' &&
            typeof row['nodeId'] === 'string' &&
            removedServices.has(row['nodeId'])
          )
            return false;
          return true;
        })
      : next['tabs'];
    const activeTabId =
      typeof next['activeTabId'] === 'string' &&
      Array.isArray(tabs) &&
      !tabs.some((tab) => tab && typeof tab === 'object' && (tab as Record<string, unknown>)['id'] === next['activeTabId'])
        ? ((tabs[0] && typeof tabs[0] === 'object' ? (tabs[0] as Record<string, unknown>)['id'] : null) ?? null)
        : next['activeTabId'];
    return { ...next, tabs, activeTabId };
  });
  return { ...source, activeService, groups };
}
