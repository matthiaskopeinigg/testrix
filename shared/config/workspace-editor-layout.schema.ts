import { z } from 'zod';

/** Section navigation for collection folder and request workspace tabs. */
export const WORKSPACE_EDITOR_LAYOUT_IDS = ['sidebar', 'titlebar'] as const;

export type WorkspaceEditorLayoutId = (typeof WORKSPACE_EDITOR_LAYOUT_IDS)[number];

export const workspaceEditorLayoutSchema = z.enum(WORKSPACE_EDITOR_LAYOUT_IDS);

/** @deprecated Use {@link WORKSPACE_EDITOR_LAYOUT_IDS}. */
export const REQUEST_TAB_LAYOUT_IDS = WORKSPACE_EDITOR_LAYOUT_IDS;

/** @deprecated Use {@link WorkspaceEditorLayoutId}. */
export type RequestTabLayoutId = WorkspaceEditorLayoutId;

/**
 * Coerces persisted layout values (including legacy `popup` dropdown layout).
 */
export function coerceWorkspaceEditorLayout(value: unknown): WorkspaceEditorLayoutId {
  if (value === 'titlebar') {
    return 'titlebar';
  }
  if (value === 'sidebar') {
    return 'sidebar';
  }
  // Legacy: section dropdown in the editor bar.
  return 'sidebar';
}
