import { DEFAULT_APPEARANCE_THEME_ID } from '../theme/theme-catalog';
import { DEFAULT_UI_FONT_ID } from '../theme/ui-font-catalog';
import {
  DEFAULT_UI_FONT_SIZE_ID,
  DEFAULT_UI_FONT_WEIGHT_ID,
  DEFAULT_UI_LINE_HEIGHT_ID,
} from '../theme/ui-typography-catalog';
import type { CollectionsFile } from './collections.schema';
import type { EnvironmentDefinition, EnvironmentScopeNode, EnvironmentsFile } from './environments.schema';
import { DEFAULT_COLLECTION_FOLDER_CLICK_BEHAVIOR } from './collection-folder-click-behavior';
import { createDefaultEditorSettings } from './editor-settings.schema';
import { createDefaultHttpSettings } from './http-settings.schema';
import type { HistoryFile, HistoryItem } from './history.schema';
import type { ProfileEntry, ProfilesManifest } from './profiles.schema';
import { createPathsAnchorV2 } from './migrate-paths-anchor';
import { createDefaultWorkspaceDesignSystem } from './design-system-session.schema';
import { createDefaultWorkspaceDevelopment } from './development-session.schema';
import { createDefaultWorkspaceTesting } from './testing-session.schema';
import type { SessionFile } from './session.schema';
import type { SettingsFile } from './settings.schema';
import { createDefaultWorkspaceEditor } from './workspace-editor.schema';

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createDefaultSettings(): SettingsFile {
  const ts = nowIso();
  return {
    schemaVersion: 1,
    meta: {
      createdAt: ts,
      updatedAt: ts,
    },
    general: {
      configFolderPath: null,
      language: 'en',
      openLastProjectOnStartup: true,
    },
    appearance: {
      theme: DEFAULT_APPEARANCE_THEME_ID,
      density: 'comfortable',
      uiFont: DEFAULT_UI_FONT_ID,
      uiFontSize: DEFAULT_UI_FONT_SIZE_ID,
      uiFontWeight: DEFAULT_UI_FONT_WEIGHT_ID,
      uiLineHeight: DEFAULT_UI_LINE_HEIGHT_ID,
    },
    privacy: {
      telemetryEnabled: false,
    },
    updates: {
      checkOnStartup: true,
      channel: 'stable',
      ignoredOfferVersion: null,
    },
    ui: {
      closeSidebarPanelOnOutsideClick: true,
      animationSpeed: 'normal',
      showIconTooltips: true,
      useTranslucentChrome: true,
      restoreLastSidebarPanel: false,
    },
    logging: {
      enabled: true,
      level: 'info',
      writeToFile: true,
      writeToConsole: true,
      includeTimestamps: true,
      redactSecrets: true,
      logIpcInDev: true,
      maxFileSizeMb: 5,
      retainedFiles: 3,
    },
    dataConfig: {
      validateOnStartup: true,
      prettyPrintJson: true,
      backupBeforeWrite: true,
      autoReloadOnExternalChange: true,
    },
    collections: {
      expandFolderOnDrag: true,
      animateMove: true,
      animateExpand: true,
      siblingSort: 'orderThenPriority',
      foldersFirst: true,
      showDescriptions: true,
      showTags: false,
      folderClickBehavior: DEFAULT_COLLECTION_FOLDER_CLICK_BEHAVIOR,
      editorLayout: 'sidebar',
      displayHttpMethod: 'tree-and-tab',
    },
    environments: {
      expandFolderOnDrag: true,
      animateMove: true,
      animateExpand: true,
      siblingSort: 'orderThenPriority',
      foldersFirst: true,
      showDescriptions: true,
    },
    editor: createDefaultEditorSettings(),
    http: createDefaultHttpSettings(),
  };
}

export function createDefaultCollectionNodes(): CollectionsFile['nodes'] {
  return [];
}

export function createDefaultCollections(): CollectionsFile {
  const ts = nowIso();
  return {
    schemaVersion: 1,
    meta: {
      createdAt: ts,
      updatedAt: ts,
    },
    nodes: createDefaultCollectionNodes(),
  };
}

/** Default environment definitions (sidebar list + per-environment scope trees). */
export function createDefaultEnvironmentDefinitions(): EnvironmentDefinition[] {
  return [];
}

/** Empty scope tree (fresh installs). Tests use local fixtures when sample nodes are needed. */
export function createDefaultEnvironmentNodes(): EnvironmentScopeNode[] {
  return [];
}

export function createDefaultEnvironments(): EnvironmentsFile {
  const ts = nowIso();
  return {
    schemaVersion: 1,
    meta: {
      createdAt: ts,
      updatedAt: ts,
    },
    environments: createDefaultEnvironmentDefinitions(),
  };
}

export function createDefaultHistoryItems(): HistoryItem[] {
  return [];
}

export function createDefaultHistory(): HistoryFile {
  const ts = nowIso();
  return {
    schemaVersion: 1,
    meta: {
      createdAt: ts,
      updatedAt: ts,
    },
    items: createDefaultHistoryItems(),
  };
}

/** Builds a new v2 paths anchor for the given user data directory and active profile id. */
export function createDefaultPathsAnchor(userData: string, activeProfileId: string) {
  return createPathsAnchorV2(userData, activeProfileId);
}

/** Default profile manifest with a single entry. */
export function createDefaultProfilesManifest(profileId: string, name = 'Default'): ProfilesManifest {
  const ts = nowIso();
  return {
    schemaVersion: 1,
    meta: {
      createdAt: ts,
      updatedAt: ts,
    },
    profiles: [createProfileEntry(profileId, name, ts)],
  };
}

/** Creates a manifest entry for a new profile. */
export function createProfileEntry(id: string, name: string, createdAt?: string): ProfileEntry {
  return {
    id,
    name,
    createdAt: createdAt ?? nowIso(),
  };
}

export function createDefaultSession(): SessionFile {
  const ts = nowIso();
  return {
    schemaVersion: 1,
    meta: {
      createdAt: ts,
      updatedAt: ts,
      sessionId: newId(),
      startedAt: ts,
    },
    window: {
      width: 1280,
      height: 800,
      x: null,
      y: null,
      maximized: false,
    },
    navigation: {
      lastRoute: '/home',
    },
    workspace: {
      activeId: null,
      recentIds: [],
      collections: {
        expandedFolderIds: [],
        folderTabsById: {},
        requestTabsById: {},
        requestRunsById: {},
        folderRunsById: {},
      },
      environments: {
        expandedFolderIds: [],
        sidebarFilter: 'all',
        sidebarSortBy: 'order',
        listSidebarFilter: 'all',
        listSidebarSortBy: 'order',
      },
      editor: createDefaultWorkspaceEditor(),
      designSystem: createDefaultWorkspaceDesignSystem(),
      development: createDefaultWorkspaceDevelopment(),
      testing: createDefaultWorkspaceTesting(),
    },
  };
}
