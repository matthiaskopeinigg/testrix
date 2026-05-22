import { describe, expect, it } from 'vitest';

import { createDefaultSession, migrateSession } from '@shared/config';

describe('migrateSession', () => {
  it('merges missing workspace.collections with defaults', () => {
    const legacy = {
      schemaVersion: 1,
      meta: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      window: createDefaultSession().window,
      navigation: createDefaultSession().navigation,
      workspace: {
        activeSidebarPanelId: null,
      },
    };

    const migrated = migrateSession(legacy);
    expect(migrated.workspace.collections.expandedFolderIds).toEqual([]);
    expect(migrated.workspace.collections.folderTabsById).toEqual({});
    expect(migrated.workspace.activeSidebarPanelId).toBeNull();
    expect(migrated.workspace.sidebarPanelOpen).toBe(false);
    expect(migrated.workspace.environments.expandedFolderIds).toEqual([]);
    expect(migrated.workspace.designSystem.activePillar).toBe('style-guide');
    expect(migrated.workspace.designSystem.expandedPillars.length).toBe(5);
  });

  it('preserves environments expandedFolderIds when present', () => {
    const session = createDefaultSession();
    const withExpanded = {
      ...session,
      workspace: {
        ...session.workspace,
        environments: { expandedFolderIds: ['folder-local'] },
      },
    };

    const migrated = migrateSession(withExpanded);
    expect(migrated.workspace.environments.expandedFolderIds).toEqual(['folder-local']);
    expect(migrated.workspace.environments.sidebarFilter).toBe('all');
    expect(migrated.workspace.environments.sidebarSortBy).toBe('order');
    expect(migrated.workspace.environments.listSidebarFilter).toBe('all');
    expect(migrated.workspace.environments.listSidebarSortBy).toBe('order');
  });

  it('preserves expandedFolderIds when present', () => {
    const session = createDefaultSession();
    const withExpanded = {
      ...session,
      workspace: {
        ...session.workspace,
        collections: { expandedFolderIds: ['folder-auth', 'folder-users'] },
      },
    };

    const migrated = migrateSession(withExpanded);
    expect(migrated.workspace.collections.expandedFolderIds).toEqual([
      'folder-auth',
      'folder-users',
    ]);
    expect(migrated.workspace.editor.groups['main']).toBeDefined();
  });
});
