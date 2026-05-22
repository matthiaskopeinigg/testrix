import { z } from 'zod';

import { ANIMATION_SPEED_IDS, type AnimationSpeed } from './animation-speed';
import {
  ENVIRONMENT_LIST_SIDEBAR_FILTER_IDS,
  ENVIRONMENT_LIST_SIDEBAR_SORT_BY_IDS,
  type EnvironmentListSidebarFilter,
  type EnvironmentListSidebarSortBy,
} from './environment-list-sidebar';
import {
  ENVIRONMENT_SIDEBAR_FILTER_IDS,
  ENVIRONMENT_SIDEBAR_SORT_BY_IDS,
  type EnvironmentSidebarFilter,
  type EnvironmentSidebarSortBy,
} from './environment-sidebar';
import {
  createDefaultCollections,
  createDefaultEnvironments,
  createDefaultSession,
  createDefaultSettings,
} from './defaults';
import { createDefaultEditorKeyboardSettings } from './editor-settings.schema';
import { coerceCollectionFolderClickBehavior } from './collection-folder-click-behavior';
import { enrichCollectionFolderSettings } from './collection-folder-settings.schema';
import { enrichCollectionRequestSettings } from './collection-request-settings.schema';
import { enrichCollectionWebsocketSettings } from './collection-websocket-settings.schema';
import { collectionsFileSchema, type CollectionsFile } from './collections.schema';
import {
  environmentDefinitionSchema,
  environmentItemSchema,
  environmentsFileSchema,
  type EnvironmentDefinition,
  type EnvironmentNode,
  type EnvironmentScopeNode,
  type EnvironmentsFile,
} from './environments.schema';
import type { SessionFile } from './session.schema';
import {
  DESIGN_SYSTEM_PILLAR_IDS,
  workspaceDesignSystemSchema,
  type DesignSystemPillarId,
} from './design-system-session.schema';
import { workspaceDevelopmentSchema } from './development-session.schema';
import { workspaceTestingSchema } from './testing-session.schema';
import { sessionFileSchema } from './session.schema';
import {
  createDefaultWorkspaceEditor,
  workspaceEditorStateSchema,
  workspaceTabKindSchema,
  type TabGroupState,
} from './workspace-editor.schema';
import {
  coerceHttpRequestSectionId,
  coerceHttpResponseTabOnSend,
  coerceHttpUrlScheme,
  ensureDefaultHttpHeaderRows,
  normalizeHttpCertificatesSettings,
  normalizeHttpDnsSettings,
  type HttpSettings,
} from './http-settings.schema';
import {
  coerceHttpMethodDisplay,
} from './http-method-display';
import {
  coerceWorkspaceEditorLayout,
  type WorkspaceEditorLayoutId,
} from './workspace-editor-layout.schema';
import { shouldStripWorkspaceTabOnRestore } from '../testing/workspace-tab-ids';

export interface MigrateSettingsOptions {
  readonly appVersion?: string;
}
import { normalizeAppearanceThemeId } from '../theme/theme-catalog';
import { isUiFontId } from '../theme/ui-font-catalog';
import {
  isUiFontSizeId,
  isUiFontWeightId,
  isUiLineHeightId,
} from '../theme/ui-typography-catalog';
import { settingsFileSchema, type SettingsFile } from './settings.schema';

/** v1-only; bump when schemas gain migrations. */

const isAnimationSpeed = (value: unknown): value is AnimationSpeed =>
  typeof value === 'string' && (ANIMATION_SPEED_IDS as readonly string[]).includes(value);

function migrateEnvironmentSidebarFilter(
  value: unknown,
  fallback: EnvironmentSidebarFilter,
): EnvironmentSidebarFilter {
  return typeof value === 'string' &&
    (ENVIRONMENT_SIDEBAR_FILTER_IDS as readonly string[]).includes(value)
    ? (value as EnvironmentSidebarFilter)
    : fallback;
}

function migrateEnvironmentSidebarSortBy(
  value: unknown,
  fallback: EnvironmentSidebarSortBy,
): EnvironmentSidebarSortBy {
  return typeof value === 'string' &&
    (ENVIRONMENT_SIDEBAR_SORT_BY_IDS as readonly string[]).includes(value)
    ? (value as EnvironmentSidebarSortBy)
    : fallback;
}

function migrateEnvironmentListSidebarFilter(
  value: unknown,
  fallback: EnvironmentListSidebarFilter,
): EnvironmentListSidebarFilter {
  return typeof value === 'string' &&
    (ENVIRONMENT_LIST_SIDEBAR_FILTER_IDS as readonly string[]).includes(value)
    ? (value as EnvironmentListSidebarFilter)
    : fallback;
}

function migrateEnvironmentListSidebarSortBy(
  value: unknown,
  fallback: EnvironmentListSidebarSortBy,
): EnvironmentListSidebarSortBy {
  return typeof value === 'string' &&
    (ENVIRONMENT_LIST_SIDEBAR_SORT_BY_IDS as readonly string[]).includes(value)
    ? (value as EnvironmentListSidebarSortBy)
    : fallback;
}

const VALID_WORKSPACE_TAB_KINDS = new Set<string>(workspaceTabKindSchema.options);

/**
 * Drops editor tabs with unknown kinds and clears active tab when it was removed.
 */
function migrateWorkspaceEditorGroups(
  groupsRaw: Record<string, unknown>,
  defaults: Record<string, TabGroupState>,
): Record<string, TabGroupState> {
  const merged: Record<string, TabGroupState> = { ...defaults };

  for (const [groupId, groupValue] of Object.entries(groupsRaw)) {
    if (typeof groupValue !== 'object' || groupValue === null) {
      continue;
    }

    const groupRecord = groupValue as Record<string, unknown>;
    const tabsRaw = Array.isArray(groupRecord['tabs']) ? groupRecord['tabs'] : [];
    const tabs = tabsRaw.filter((tab): tab is TabGroupState['tabs'][number] => {
      if (typeof tab !== 'object' || tab === null) {
        return false;
      }
      const record = tab as Record<string, unknown>;
      const kind = record['kind'];
      const resourceId = record['resourceId'];
      if (typeof kind !== 'string' || !VALID_WORKSPACE_TAB_KINDS.has(kind)) {
        return false;
      }
      if (typeof resourceId !== 'string') {
        return false;
      }
      return !shouldStripWorkspaceTabOnRestore(
        kind as TabGroupState['tabs'][number]['kind'],
        resourceId,
      );
    });

    const activeTabId =
      typeof groupRecord['activeTabId'] === 'string' ? groupRecord['activeTabId'] : null;
    const activeStillPresent = activeTabId !== null && tabs.some((tab) => tab.id === activeTabId);

    merged[groupId] = {
      tabs,
      activeTabId: activeStillPresent ? activeTabId : (tabs[0]?.id ?? null),
    };
  }

  return merged;
}

/**
 * Maps legacy `animationsEnabled` / `entranceAnimationSpeed` to `animationSpeed`.
 */
function migrateAppearance(
  raw: Record<string, unknown> | undefined,
  defaults: SettingsFile['appearance'],
): SettingsFile['appearance'] {
  const legacy = raw ?? {};
  const uiFont = isUiFontId(legacy['uiFont']) ? legacy['uiFont'] : defaults.uiFont;
  const uiFontSize = isUiFontSizeId(legacy['uiFontSize']) ? legacy['uiFontSize'] : defaults.uiFontSize;
  const uiFontWeight = isUiFontWeightId(legacy['uiFontWeight'])
    ? legacy['uiFontWeight']
    : defaults.uiFontWeight;
  const uiLineHeight = isUiLineHeightId(legacy['uiLineHeight'])
    ? legacy['uiLineHeight']
    : defaults.uiLineHeight;

  const theme = normalizeAppearanceThemeId(legacy['theme'] ?? defaults.theme);

  return {
    ...defaults,
    ...legacy,
    theme,
    uiFont,
    uiFontSize,
    uiFontWeight,
    uiLineHeight,
  };
}

function migrateEditorSection(
  raw: unknown,
  defaults: SettingsFile['editor'],
): SettingsFile['editor'] {
  const legacy =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const keyboardLegacy =
    typeof legacy['keyboard'] === 'object' && legacy['keyboard'] !== null
      ? (legacy['keyboard'] as Record<string, unknown>)
      : {};
  return {
    ...defaults,
    ...legacy,
    keyboard: {
      ...createDefaultEditorKeyboardSettings(),
      ...keyboardLegacy,
    },
  };
}

function migrateUi(
  raw: Record<string, unknown> | undefined,
  defaults: SettingsFile['ui'],
): SettingsFile['ui'] {
  const legacy = raw ?? {};

  let animationSpeed = defaults.animationSpeed;

  if (isAnimationSpeed(legacy['animationSpeed'])) {
    animationSpeed = legacy['animationSpeed'];
  } else if (isAnimationSpeed(legacy['entranceAnimationSpeed'])) {
    animationSpeed = legacy['entranceAnimationSpeed'];
  }

  if (legacy['animationsEnabled'] === false) {
    animationSpeed = 'none';
  }

  return {
    ...defaults,
    ...legacy,
    animationSpeed,
  };
}

function migrateHttpSection(
  raw: unknown,
  defaults: HttpSettings,
  appVersion: string,
): HttpSettings {
  if (typeof raw !== 'object' || raw === null) {
    return {
      ...defaults,
      headers: {
        ...defaults.headers,
        rows: ensureDefaultHttpHeaderRows(defaults.headers.rows, appVersion),
      },
    };
  }
  const record = raw as Record<string, unknown>;
  const subsection = <K extends keyof HttpSettings>(key: K): HttpSettings[K] => ({
    ...defaults[key],
    ...(typeof record[key] === 'object' && record[key] !== null ? (record[key] as HttpSettings[K]) : {}),
  });
  const headers = subsection('headers');
  const request = subsection('request');
  return {
    request: {
      ...request,
      activeSectionOnOpen: coerceHttpRequestSectionId(request.activeSectionOnOpen),
      defaultResponseTabOnSend: coerceHttpResponseTabOnSend(request.defaultResponseTabOnSend),
      defaultUrlScheme: coerceHttpUrlScheme(
        request.defaultUrlScheme,
        defaults.request.defaultUrlScheme,
      ),
      autoFixUrlOnSend:
        typeof request.autoFixUrlOnSend === 'boolean'
          ? request.autoFixUrlOnSend
          : defaults.request.autoFixUrlOnSend,
      prependWwwOnSend:
        typeof request.prependWwwOnSend === 'boolean'
          ? request.prependWwwOnSend
          : defaults.request.prependWwwOnSend,
    },
    retries: subsection('retries'),
    testing: subsection('testing'),
    headers: {
      ...headers,
      rows: ensureDefaultHttpHeaderRows(headers.rows, appVersion),
    },
    certificates: normalizeHttpCertificatesSettings(record['certificates'] ?? defaults.certificates),
    dns: normalizeHttpDnsSettings(record['dns'] ?? defaults.dns),
    proxy: subsection('proxy'),
  };
}

function migrateCollectionsSection(
  raw: unknown,
  defaults: SettingsFile['collections'],
  httpRaw: unknown,
): SettingsFile['collections'] {
  const merged =
    typeof raw === 'object' && raw !== null
      ? { ...defaults, ...(raw as Record<string, unknown>) }
      : { ...defaults };

  let editorLayout: WorkspaceEditorLayoutId = coerceWorkspaceEditorLayout(merged.editorLayout);

  if (
    typeof raw !== 'object' ||
    raw === null ||
    (raw as Record<string, unknown>)['editorLayout'] === undefined
  ) {
    const http =
      typeof httpRaw === 'object' && httpRaw !== null
        ? (httpRaw as Record<string, unknown>)
        : null;
    const request =
      typeof http?.['request'] === 'object' && http['request'] !== null
        ? (http['request'] as Record<string, unknown>)
        : null;
    if (request?.['requestTabLayout'] !== undefined) {
      editorLayout = coerceWorkspaceEditorLayout(request['requestTabLayout']);
    }
  }

  return {
    ...merged,
    editorLayout,
    displayHttpMethod: coerceHttpMethodDisplay(merged.displayHttpMethod),
    folderClickBehavior: coerceCollectionFolderClickBehavior(merged.folderClickBehavior),
  } as SettingsFile['collections'];
}

/**
 * Merges persisted settings with current defaults (e.g. new `ui` block) then validates.
 */
export function migrateSettings(data: unknown, options?: MigrateSettingsOptions): SettingsFile {
  const defaults = createDefaultSettings();
  const appVersion = options?.appVersion?.trim() || '0.0.0';

  if (typeof data !== 'object' || data === null) {
    return defaults;
  }

  const record = data as Record<string, unknown>;
  if (record['schemaVersion'] !== 1) {
    throw new Error(`Unsupported settings schemaVersion: ${String(record['schemaVersion'])}`);
  }

  const section = <T extends object>(key: string, fallback: T): T => ({
    ...fallback,
    ...(typeof record[key] === 'object' && record[key] !== null ? (record[key] as T) : {}),
  });

  const rawUi =
    typeof record['ui'] === 'object' && record['ui'] !== null
      ? (record['ui'] as Record<string, unknown>)
      : undefined;

  return settingsFileSchema.parse({
    ...defaults,
    ...record,
    general: section('general', defaults.general),
    appearance: migrateAppearance(
      typeof record['appearance'] === 'object' && record['appearance'] !== null
        ? (record['appearance'] as Record<string, unknown>)
        : undefined,
      defaults.appearance,
    ),
    privacy: section('privacy', defaults.privacy),
    updates: section('updates', defaults.updates),
    ui: migrateUi(rawUi, defaults.ui),
    logging: section('logging', defaults.logging),
    dataConfig: section('dataConfig', defaults.dataConfig),
    collections: migrateCollectionsSection(record['collections'], defaults.collections, record['http']),
    environments: section('environments', defaults.environments),
    testSuite: section('testSuite', defaults.testSuite),
    editor: migrateEditorSection(record['editor'], defaults.editor),
    http: migrateHttpSection(record['http'], defaults.http, appVersion),
    databases: section('databases', defaults.databases),
    meta:
      typeof record['meta'] === 'object' && record['meta'] !== null
        ? { ...defaults.meta, ...(record['meta'] as object) }
        : defaults.meta,
  });
}

export function migrateSession(data: unknown): SessionFile {
  const defaults = createDefaultSession();

  if (typeof data !== 'object' || data === null) {
    return defaults;
  }

  const record = data as Record<string, unknown>;
  if (record['schemaVersion'] !== 1) {
    throw new Error(`Unsupported session schemaVersion: ${String(record['schemaVersion'])}`);
  }

  const section = <T extends object>(key: string, fallback: T): T => ({
    ...fallback,
    ...(typeof record[key] === 'object' && record[key] !== null ? (record[key] as T) : {}),
  });

  const workspaceRaw =
    typeof record['workspace'] === 'object' && record['workspace'] !== null
      ? (record['workspace'] as Record<string, unknown>)
      : {};

  const collectionsRaw =
    typeof workspaceRaw['collections'] === 'object' && workspaceRaw['collections'] !== null
      ? (workspaceRaw['collections'] as Record<string, unknown>)
      : {};

  const environmentsRaw =
    typeof workspaceRaw['environments'] === 'object' && workspaceRaw['environments'] !== null
      ? (workspaceRaw['environments'] as Record<string, unknown>)
      : {};

  const designSystemRaw =
    typeof workspaceRaw['designSystem'] === 'object' && workspaceRaw['designSystem'] !== null
      ? (workspaceRaw['designSystem'] as Record<string, unknown>)
      : {};

  const developmentRaw =
    typeof workspaceRaw['development'] === 'object' && workspaceRaw['development'] !== null
      ? (workspaceRaw['development'] as Record<string, unknown>)
      : {};

  const editorDefaults = createDefaultWorkspaceEditor();
  const editorRaw =
    typeof workspaceRaw['editor'] === 'object' && workspaceRaw['editor'] !== null
      ? (workspaceRaw['editor'] as Record<string, unknown>)
      : null;

  const legacyRecentIds = Array.isArray(workspaceRaw['recentIds'])
    ? (workspaceRaw['recentIds'] as string[])
    : [];

  const editorGroupsRaw =
    editorRaw && typeof editorRaw['groups'] === 'object' && editorRaw['groups'] !== null
      ? (editorRaw['groups'] as Record<string, unknown>)
      : {};

  const editorMerged = {
    ...editorDefaults,
    ...(editorRaw ?? {}),
    recentResourceIds: Array.isArray(editorRaw?.['recentResourceIds'])
      ? (editorRaw['recentResourceIds'] as string[])
      : legacyRecentIds.length > 0
        ? legacyRecentIds
        : editorDefaults.recentResourceIds,
    groups: migrateWorkspaceEditorGroups(editorGroupsRaw, editorDefaults.groups),
  };

  const editor = workspaceEditorStateSchema.parse(editorMerged);

  const designSystem = workspaceDesignSystemSchema.parse({
    ...defaults.workspace.designSystem,
    activePillar: migrateDesignSystemPillar(
      designSystemRaw['activePillar'],
      defaults.workspace.designSystem.activePillar,
    ),
    activeSectionId:
      typeof designSystemRaw['activeSectionId'] === 'string' && designSystemRaw['activeSectionId'].length > 0
        ? designSystemRaw['activeSectionId']
        : defaults.workspace.designSystem.activeSectionId,
    expandedPillars: migrateDesignSystemExpandedPillars(
      designSystemRaw['expandedPillars'],
      defaults.workspace.designSystem.expandedPillars,
    ),
    debugEnabled:
      typeof designSystemRaw['debugEnabled'] === 'boolean'
        ? designSystemRaw['debugEnabled']
        : defaults.workspace.designSystem.debugEnabled,
  });

  const developmentToolsRaw =
    typeof developmentRaw['tools'] === 'object' && developmentRaw['tools'] !== null
      ? (developmentRaw['tools'] as Record<string, unknown>)
      : {};

  const development = workspaceDevelopmentSchema.parse({
    tools: {
      ...defaults.workspace.development.tools,
      ...developmentToolsRaw,
    },
  });

  const testingRaw =
    typeof workspaceRaw['testing'] === 'object' && workspaceRaw['testing'] !== null
      ? (workspaceRaw['testing'] as Record<string, unknown>)
      : {};

  const testing = workspaceTestingSchema.parse({
    ...defaults.workspace.testing,
    ...testingRaw,
  });

  return sessionFileSchema.parse({
    ...defaults,
    ...record,
    meta: section('meta', defaults.meta),
    window: section('window', defaults.window),
    navigation: section('navigation', defaults.navigation),
    workspace: {
      ...defaults.workspace,
      activeId:
        typeof workspaceRaw['activeId'] === 'string' || workspaceRaw['activeId'] === null
          ? (workspaceRaw['activeId'] as string | null)
          : defaults.workspace.activeId,
      recentIds: legacyRecentIds,
      activeSidebarPanelId:
        typeof workspaceRaw['activeSidebarPanelId'] === 'string' ||
        workspaceRaw['activeSidebarPanelId'] === null
          ? (workspaceRaw['activeSidebarPanelId'] as string | null)
          : defaults.workspace.activeSidebarPanelId,
      sidebarPanelOpen:
        typeof workspaceRaw['sidebarPanelOpen'] === 'boolean'
          ? workspaceRaw['sidebarPanelOpen']
          : defaults.workspace.sidebarPanelOpen,
      collections: {
        ...defaults.workspace.collections,
        expandedFolderIds: Array.isArray(collectionsRaw['expandedFolderIds'])
          ? (collectionsRaw['expandedFolderIds'] as string[])
          : defaults.workspace.collections.expandedFolderIds,
        folderTabsById:
          collectionsRaw['folderTabsById'] &&
          typeof collectionsRaw['folderTabsById'] === 'object' &&
          collectionsRaw['folderTabsById'] !== null
            ? (collectionsRaw['folderTabsById'] as Record<string, unknown>)
            : defaults.workspace.collections.folderTabsById,
        requestTabsById:
          collectionsRaw['requestTabsById'] &&
          typeof collectionsRaw['requestTabsById'] === 'object' &&
          collectionsRaw['requestTabsById'] !== null
            ? (collectionsRaw['requestTabsById'] as Record<string, unknown>)
            : defaults.workspace.collections.requestTabsById,
        websocketTabsById:
          collectionsRaw['websocketTabsById'] &&
          typeof collectionsRaw['websocketTabsById'] === 'object' &&
          collectionsRaw['websocketTabsById'] !== null
            ? (collectionsRaw['websocketTabsById'] as Record<string, unknown>)
            : defaults.workspace.collections.websocketTabsById,
        requestRunsById:
          collectionsRaw['requestRunsById'] &&
          typeof collectionsRaw['requestRunsById'] === 'object' &&
          collectionsRaw['requestRunsById'] !== null
            ? (collectionsRaw['requestRunsById'] as Record<string, unknown>)
            : defaults.workspace.collections.requestRunsById,
        folderRunsById:
          collectionsRaw['folderRunsById'] &&
          typeof collectionsRaw['folderRunsById'] === 'object' &&
          collectionsRaw['folderRunsById'] !== null
            ? (collectionsRaw['folderRunsById'] as Record<string, unknown>)
            : defaults.workspace.collections.folderRunsById,
      },
      environments: {
        ...defaults.workspace.environments,
        expandedFolderIds: Array.isArray(environmentsRaw['expandedFolderIds'])
          ? (environmentsRaw['expandedFolderIds'] as string[])
          : defaults.workspace.environments.expandedFolderIds,
        sidebarFilter: migrateEnvironmentSidebarFilter(
          environmentsRaw['sidebarFilter'],
          defaults.workspace.environments.sidebarFilter,
        ),
        sidebarSortBy: migrateEnvironmentSidebarSortBy(
          environmentsRaw['sidebarSortBy'],
          defaults.workspace.environments.sidebarSortBy,
        ),
        listSidebarFilter: migrateEnvironmentListSidebarFilter(
          environmentsRaw['listSidebarFilter'],
          defaults.workspace.environments.listSidebarFilter,
        ),
        listSidebarSortBy: migrateEnvironmentListSidebarSortBy(
          environmentsRaw['listSidebarSortBy'],
          defaults.workspace.environments.listSidebarSortBy,
        ),
      },
      editor,
      designSystem,
      development,
      testing,
    },
  });
}

function migrateDesignSystemPillar(
  value: unknown,
  fallback: DesignSystemPillarId,
): DesignSystemPillarId {
  if (typeof value === 'string' && (DESIGN_SYSTEM_PILLAR_IDS as readonly string[]).includes(value)) {
    return value as DesignSystemPillarId;
  }
  return fallback;
}

function migrateDesignSystemExpandedPillars(
  value: unknown,
  fallback: readonly DesignSystemPillarId[],
): DesignSystemPillarId[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }
  const seen = new Set<DesignSystemPillarId>();
  const pillars: DesignSystemPillarId[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !(DESIGN_SYSTEM_PILLAR_IDS as readonly string[]).includes(item)) {
      continue;
    }
    const pillar = item as DesignSystemPillarId;
    if (seen.has(pillar)) {
      continue;
    }
    seen.add(pillar);
    pillars.push(pillar);
  }
  return pillars.length > 0 ? pillars : [...fallback];
}

/**
 * Merges persisted collections with defaults then validates.
 */
export function migrateCollections(data: unknown): CollectionsFile {
  const defaults = createDefaultCollections();

  if (typeof data !== 'object' || data === null) {
    return defaults;
  }

  const record = data as Record<string, unknown>;
  if (record['schemaVersion'] !== 1) {
    throw new Error(`Unsupported collections schemaVersion: ${String(record['schemaVersion'])}`);
  }

  const rawNodes = Array.isArray(record['nodes']) ? record['nodes'] : defaults.nodes;

  return collectionsFileSchema.parse({
    ...defaults,
    ...record,
    meta:
      typeof record['meta'] === 'object' && record['meta'] !== null
        ? { ...defaults.meta, ...(record['meta'] as object) }
        : defaults.meta,
    nodes: enrichCollectionNodesFromRaw(rawNodes),
  });
}

/** Maps raw JSON nodes and fills default settings before Zod parse. */
function enrichCollectionNodesFromRaw(nodes: unknown[]): unknown[] {
  return nodes.map((item) => {
    if (typeof item !== 'object' || item === null) {
      return item;
    }
    const record = item as Record<string, unknown>;
    const kind = record['kind'];

    if (kind === 'folder') {
      const children = Array.isArray(record['children'])
        ? enrichCollectionNodesFromRaw(record['children'] as unknown[])
        : [];
      return {
        ...record,
        settings: enrichCollectionFolderSettings(record['settings']),
        children,
      };
    }

    if (kind === 'request') {
      return {
        ...record,
        settings: enrichCollectionRequestSettings(record['settings']),
      };
    }

    if (kind === 'websocket') {
      return {
        ...record,
        settings: enrichCollectionWebsocketSettings(record['settings']),
      };
    }

    return item;
  });
}

function migrateLegacyEnvironmentItems(items: unknown): EnvironmentDefinition[] {
  const parsed = z.array(environmentItemSchema).safeParse(items);
  if (!parsed.success) {
    return [];
  }
  return parsed.data.map((item) => ({
    id: item.id,
    name: item.label,
    order: item.order,
    nodes: [],
  }));
}

function resolveLegacyEnvironmentNodes(
  record: Record<string, unknown>,
  defaults: EnvironmentsFile,
): EnvironmentNode[] {
  if (Array.isArray(record['nodes'])) {
    return record['nodes'] as EnvironmentNode[];
  }
  return [];
}

function folderNodeToDefinition(folder: EnvironmentNode & { kind: 'folder' }): EnvironmentDefinition {
  return {
    id: folder.id,
    name: folder.label,
    description: folder.description,
    order: folder.order,
    nodes: folder.children as EnvironmentScopeNode[],
  };
}

function migrateLegacyNodesToEnvironments(
  nodes: readonly EnvironmentNode[],
  defaults: EnvironmentsFile,
): EnvironmentDefinition[] {
  const rootFolders = nodes.filter((node): node is EnvironmentNode & { kind: 'folder' } => node.kind === 'folder');
  const rootVariables = nodes.filter((node) => node.kind === 'variable');

  const environments: EnvironmentDefinition[] = rootFolders.map((folder) =>
    folderNodeToDefinition(folder),
  );

  if (rootVariables.length > 0) {
    environments.unshift({
      id: 'env-global',
      name: 'Global',
      order: -10,
      nodes: rootVariables as EnvironmentScopeNode[],
    });
  }

  return environments.length > 0 ? environments : defaults.environments;
}

function resolveEnvironmentDefinitions(
  record: Record<string, unknown>,
  defaults: EnvironmentsFile,
): EnvironmentDefinition[] {
  if (Array.isArray(record['environments'])) {
    const parsed = z.array(environmentDefinitionSchema).safeParse(record['environments']);
    if (parsed.success) {
      return parsed.data;
    }
  }

  const legacyNodes = resolveLegacyEnvironmentNodes(record, defaults);
  if (legacyNodes.length > 0) {
    return migrateLegacyNodesToEnvironments(legacyNodes, defaults);
  }

  if (Array.isArray(record['items'])) {
    const migrated = migrateLegacyEnvironmentItems(record['items']);
    return migrated.length > 0 ? migrated : defaults.environments;
  }

  return defaults.environments;
}

/**
 * Merges persisted environments with defaults then validates.
 */
export function migrateEnvironments(data: unknown): EnvironmentsFile {
  const defaults = createDefaultEnvironments();

  if (typeof data !== 'object' || data === null) {
    return defaults;
  }

  const record = data as Record<string, unknown>;
  if (record['schemaVersion'] !== 1) {
    throw new Error(`Unsupported environments schemaVersion: ${String(record['schemaVersion'])}`);
  }

  const environments = resolveEnvironmentDefinitions(record, defaults);

  return environmentsFileSchema.parse({
    ...defaults,
    ...record,
    meta:
      typeof record['meta'] === 'object' && record['meta'] !== null
        ? { ...defaults.meta, ...(record['meta'] as object) }
        : defaults.meta,
    environments,
  });
}
