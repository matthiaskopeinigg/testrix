import { describe, expect, it } from 'vitest';

import { createDefaultSession, migrateSession } from '@shared/config';
import {
  createDefaultWorkspaceEditor,
  workspaceEditorStateSchema,
} from './workspace-editor.schema';

describe('workspaceEditorStateSchema', () => {
  it('parses default editor state', () => {
    const editor = createDefaultWorkspaceEditor();
    expect(workspaceEditorStateSchema.parse(editor)).toEqual(editor);
  });
});

describe('migrateSession editor', () => {
  it('adds default editor when missing', () => {
    const session = createDefaultSession();
    const { editor: _removed, ...workspaceWithoutEditor } = session.workspace;
    const legacy = {
      ...session,
      workspace: workspaceWithoutEditor,
    };

    const migrated = migrateSession(legacy);
    expect(migrated.workspace.editor.focusedGroupId).toBe('main');
    expect(migrated.workspace.editor.groups['main']?.tabs).toEqual([]);
  });

  it('migrates legacy recentIds into recentResourceIds', () => {
    const session = createDefaultSession();
    const legacy = {
      ...session,
      workspace: {
        ...session.workspace,
        recentIds: ['req-a', 'req-b'],
        editor: undefined,
      },
    };

    const migrated = migrateSession(legacy);
    expect(migrated.workspace.editor.recentResourceIds).toEqual(['req-a', 'req-b']);
  });
});
