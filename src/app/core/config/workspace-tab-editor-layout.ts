import type { SettingsFile } from '@shared/config';
import type { WorkspaceEditorLayoutId } from '@shared/config/workspace-editor-layout.schema';

export type WorkspaceEditorLayoutSection =
  | 'collections'
  | 'testSuite'
  | 'regression'
  | 'loadTest'
  | 'mockServer'
  | 'capture'
  | 'interceptor';

const DEFAULT_LAYOUT: WorkspaceEditorLayoutId = 'sidebar';

/**
 * Resolves the editor layout for a workspace tab type from persisted settings.
 */
export function resolveTabEditorLayout(
  settings: SettingsFile | null | undefined,
  section: WorkspaceEditorLayoutSection,
): WorkspaceEditorLayoutId {
  if (!settings) {
    return DEFAULT_LAYOUT;
  }

  switch (section) {
    case 'collections':
      return settings.collections.editorLayout ?? DEFAULT_LAYOUT;
    case 'testSuite':
      return settings.testSuite.editorLayout ?? DEFAULT_LAYOUT;
    case 'regression':
      return settings.regression.editorLayout ?? DEFAULT_LAYOUT;
    case 'loadTest':
      return settings.loadTest.editorLayout ?? DEFAULT_LAYOUT;
    case 'mockServer':
      return settings.mockServer.editorLayout ?? DEFAULT_LAYOUT;
    case 'capture':
      return settings.capture.editorLayout ?? DEFAULT_LAYOUT;
    case 'interceptor':
      return settings.interceptor.editorLayout ?? DEFAULT_LAYOUT;
    default:
      return DEFAULT_LAYOUT;
  }
}
