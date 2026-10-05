import { describe, expect, it } from 'vitest';

import { DEFAULT_SESSION_FILE, sanitizeSessionForWorkspace } from './session';
import {
  canDeleteWorkspace,
  createDefaultWorkspacesFile,
  duplicateWorkspaceName,
  nextWorkspaceFolder,
  nextWorkspaceId,
  parseWorkspacesFile,
  removeWorkspaceFromCatalog,
  shouldMigrateLegacyLayout,
  TESTING_WORKSPACE_ID,
  withTestingWorkspace,
} from './workspace';

describe('parseWorkspacesFile', () => {
  it('seeds a Default workspace when empty', () => {
    const parsed = parseWorkspacesFile(null);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]?.name).toBe('Default');
    expect(parsed.items[0]?.folder).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(parsed.activeId).toBe(parsed.items[0]?.id);
  });

  it('keeps catalog order and activeId', () => {
    const parsed = parseWorkspacesFile({
      items: [
        { id: 'ws_2', name: 'Client', folder: 'workspace-2', modifiedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'ws_1', name: 'Personal', folder: 'workspace-1', modifiedAt: '2026-01-01T00:00:00.000Z' },
      ],
      orderIds: ['ws_1', 'ws_2'],
      activeId: 'ws_2',
    });
    expect(parsed.items.map((item) => item.id)).toEqual(['ws_1', 'ws_2']);
    expect(parsed.items[0]?.name).toBe('Default');
    expect(parsed.activeId).toBe('ws_2');
  });

  it('keeps a custom name on the default workspace', () => {
    const parsed = parseWorkspacesFile({
      items: [
        { id: 'ws_1', name: 'Studio', folder: 'workspace-1', modifiedAt: '2026-01-01T00:00:00.000Z' },
      ],
      orderIds: ['ws_1'],
      activeId: 'ws_1',
    });
    expect(parsed.items[0]?.name).toBe('Studio');
  });
});

describe('workspace helpers', () => {
  it('allocates unique UUID folder and catalog ids', () => {
    const folder = nextWorkspaceFolder(['workspace-1']);
    expect(folder).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(folder).not.toBe('workspace-1');
    const id = nextWorkspaceId(['ws_1', 'ws_2']);
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(nextWorkspaceId()).not.toBe(id);
  });

  it('adds the Testing workspace once', () => {
    const seeded = withTestingWorkspace(createDefaultWorkspacesFile());
    expect(seeded.items.some((item) => item.id === TESTING_WORKSPACE_ID)).toBe(true);
    expect(withTestingWorkspace(seeded)).toBe(seeded);
  });

  it('does not migrate when configs/settings.json already exists', () => {
    expect(
      shouldMigrateLegacyLayout({
        configsSettingsExists: true,
        rootSettingsExists: true,
        rootSessionExists: true,
        rootEnvironmentsExists: true,
        rootCollectionsExists: false,
      }),
    ).toBe(false);
  });

  it('migrates a flat root layout', () => {
    expect(
      shouldMigrateLegacyLayout({
        configsSettingsExists: false,
        rootSettingsExists: true,
        rootSessionExists: false,
        rootEnvironmentsExists: true,
        rootCollectionsExists: false,
      }),
    ).toBe(true);
  });

  it('refuses deleting the last workspace', () => {
    const file = createDefaultWorkspacesFile();
    expect(canDeleteWorkspace(file.items)).toBe(false);
    expect(removeWorkspaceFromCatalog(file, file.items[0]!.id)).toBeNull();
  });

  it('removes a workspace and moves activeId', () => {
    const file = parseWorkspacesFile({
      items: [
        { id: 'ws_1', name: 'A', folder: 'workspace-1', modifiedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'ws_2', name: 'B', folder: 'workspace-2', modifiedAt: '2026-01-01T00:00:00.000Z' },
      ],
      activeId: 'ws_1',
      orderIds: ['ws_1', 'ws_2'],
    });
    const next = removeWorkspaceFromCatalog(file, 'ws_1');
    expect(next?.items.map((item) => item.id)).toEqual(['ws_2']);
    expect(next?.activeId).toBe('ws_2');
  });

  it('picks a unique duplicate name', () => {
    expect(duplicateWorkspaceName('Personal', ['Personal'])).toBe('Personal copy');
    expect(duplicateWorkspaceName('Personal', ['Personal', 'Personal copy'])).toBe('Personal copy 2');
  });
});

describe('sanitizeSessionForWorkspace', () => {
  it('drops stale tabs and selections', () => {
    const session = {
      ...DEFAULT_SESSION_FILE,
      focusedGroupId: 'g1',
      groups: [
        {
          id: 'g1',
          activeTabId: 't-old',
          selectedTabIds: ['t-old', 't-keep'],
          tabAnchorId: 't-old',
          tabs: [
            {
              id: 't-old',
              nodeId: 'http-gone',
              kind: 'http' as const,
              title: 'Gone',
              url: '',
              status: null,
            },
            {
              id: 't-keep',
              nodeId: 'http-login',
              kind: 'http' as const,
              title: 'Login',
              url: '',
              status: null,
            },
            {
              id: 't-env',
              nodeId: 'env-other',
              kind: 'environment' as const,
              title: 'Other',
              url: '',
              status: null,
            },
          ],
        },
      ],
      requestViewsByNodeId: {
        'http-login': { section: 'auth' },
        'http-gone': { section: 'body' },
      },
      selection: {
        collections: { ids: ['http-login', 'http-gone'], anchorId: 'http-gone' },
        environments: { ids: ['env-local', 'env-other'], anchorId: 'env-other' },
        environmentNodes: {
          'env-local': { ids: ['a'], anchorId: 'a', paneId: 'a' },
          'env-other': { ids: ['b'], anchorId: 'b', paneId: 'b' },
        },
      },
    };
    const next = sanitizeSessionForWorkspace(session, new Set(['http-login']), new Set(['env-local']));
    expect(next.groups[0]?.tabs.map((tab) => tab.id)).toEqual(['t-keep']);
    expect(next.groups[0]?.activeTabId).toBe('t-keep');
    expect(next.selection.collections.ids).toEqual(['http-login']);
    expect(next.selection.environments.ids).toEqual(['env-local']);
    expect(next.selection.environmentNodes['env-other']).toBeUndefined();
    expect(next.selection.environmentNodes['env-local']?.paneId).toBe('a');
    expect(next.requestViewsByNodeId).toEqual({ 'http-login': { section: 'auth' } });
  });

  it('keeps tool tabs across workspace switches', () => {
    const session = {
      ...DEFAULT_SESSION_FILE,
      groups: [
        {
          id: 'g1',
          activeTabId: 't-uuid',
          selectedTabIds: ['t-uuid'],
          tabAnchorId: 't-uuid',
          tabs: [
            {
              id: 't-uuid',
              nodeId: 'uuid-generator',
              kind: 'tool' as const,
              title: 'UUID Generator',
              url: '',
              status: null,
            },
          ],
        },
      ],
    };
    const next = sanitizeSessionForWorkspace(session, new Set(), new Set());
    expect(next.groups[0]?.tabs.map((tab) => tab.nodeId)).toEqual(['uuid-generator']);
  });

  it('keeps catalog service tabs', () => {
    const session = {
      ...DEFAULT_SESSION_FILE,
      groups: [
        {
          id: 'g1',
          activeTabId: 't-flows',
          selectedTabIds: ['t-flows'],
          tabAnchorId: 't-flows',
          tabs: [
            {
              id: 't-flows',
              nodeId: 'flows',
              kind: 'service' as const,
              title: 'Flows',
              url: '',
              status: null,
            },
          ],
        },
      ],
    };
    const next = sanitizeSessionForWorkspace(session, new Set(), new Set());
    expect(next.groups[0]?.tabs.map((tab) => tab.nodeId)).toEqual(['flows']);
  });

  it('drops stale service artifact tabs', () => {
    const session = {
      ...DEFAULT_SESSION_FILE,
      groups: [
        {
          id: 'g1',
          activeTabId: 't-flow',
          selectedTabIds: ['t-flow'],
          tabAnchorId: 't-flow',
          tabs: [
            {
              id: 't-flow',
              nodeId: 'flow-gone',
              kind: 'flow' as const,
              title: 'Gone flow',
              url: '',
              status: null,
            },
            {
              id: 't-keep',
              nodeId: 'flow-keep',
              kind: 'flow' as const,
              title: 'Keep flow',
              url: '',
              status: null,
            },
          ],
        },
      ],
    };
    const next = sanitizeSessionForWorkspace(
      session,
      new Set(),
      new Set(),
      new Set(),
      new Set(),
      new Set(),
      new Set(),
      { flow: new Set(['flow-keep']) },
    );
    expect(next.groups[0]?.tabs.map((tab) => tab.nodeId)).toEqual(['flow-keep']);
  });

  it('keeps plantuml tabs that still exist and drops stale tool plantuml tabs', () => {
    const session = {
      ...DEFAULT_SESSION_FILE,
      groups: [
        {
          id: 'g1',
          activeTabId: 't1',
          selectedTabIds: ['t1'],
          tabAnchorId: 't1',
          tabs: [
            {
              id: 't1',
              nodeId: 'diagram-1',
              kind: 'plantuml' as const,
              title: 'Diagram',
              url: '',
              status: null,
            },
            {
              id: 't2',
              nodeId: 'plantuml',
              kind: 'tool' as const,
              title: 'PlantUML',
              url: '',
              status: null,
            },
            {
              id: 't3',
              nodeId: 'gone',
              kind: 'plantuml' as const,
              title: 'Gone',
              url: '',
              status: null,
            },
          ],
        },
      ],
    };
    const next = sanitizeSessionForWorkspace(
      session,
      new Set(),
      new Set(),
      new Set(),
      new Set(),
      new Set(),
      new Set(),
      {},
      new Set(['diagram-1']),
    );
    expect(next.groups[0]?.tabs.map((tab) => tab.nodeId)).toEqual(['diagram-1']);
  });

  it('keeps listener Network UI for living listeners and drops stale ids', () => {
    const session = {
      ...DEFAULT_SESSION_FILE,
      listenerUiById: {
        'ls-keep': { search: 'api', sort: 'status' as const },
        'ls-gone': { search: 'x', sort: 'url' as const },
      },
    };
    const next = sanitizeSessionForWorkspace(
      session,
      new Set(),
      new Set(),
      new Set(),
      new Set(),
      new Set(),
      new Set(),
      { 'listener-session': new Set(['ls-keep']) },
    );
    expect(next.listenerUiById).toEqual({ 'ls-keep': { search: 'api', sort: 'status' } });
  });
});
