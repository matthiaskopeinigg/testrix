import { z } from 'zod';

import { workspaceEditorLayoutSchema } from './workspace-editor-layout.schema';

export const workspaceTabEditorSettingsSchema = z.object({
  editorLayout: workspaceEditorLayoutSchema,
});

export type WorkspaceTabEditorSettings = z.infer<typeof workspaceTabEditorSettingsSchema>;

export function createDefaultWorkspaceTabEditorSettings(): WorkspaceTabEditorSettings {
  return { editorLayout: 'sidebar' };
}
