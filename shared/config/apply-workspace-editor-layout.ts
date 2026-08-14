import type { SettingsPatch } from './settings.schema';
import type { AppearanceThemeId } from '../theme/theme-catalog';
import type { WorkspaceEditorLayoutId } from './workspace-editor-layout.schema';
import { createDefaultWorkspaceTabEditorSettings } from './workspace-tab-editor-settings.schema';

/** Settings sections that expose `editorLayout`. */
export const WORKSPACE_EDITOR_LAYOUT_SECTIONS = [
  'collections',
  'testSuite',
  'regression',
  'loadTest',
  'mockServer',
  'capture',
  'interceptor',
] as const;

export type WorkspaceEditorLayoutSection = (typeof WORKSPACE_EDITOR_LAYOUT_SECTIONS)[number];

/**
 * Builds a settings patch that applies the same editor layout to every workspace tab type.
 */
export function buildGlobalEditorLayoutPatch(
  layout: WorkspaceEditorLayoutId,
  markOnboardingComplete = true,
): SettingsPatch {
  const tabEditor = { editorLayout: layout };
  return {
    collections: tabEditor,
    testSuite: tabEditor,
    regression: tabEditor,
    loadTest: tabEditor,
    mockServer: tabEditor,
    capture: tabEditor,
    interceptor: tabEditor,
    ...(markOnboardingComplete ? { general: { layoutOnboardingCompleted: true } } : {}),
  };
}

/** First-run onboarding: theme + global editor layout + completion flag. */
export function buildOnboardingCompletePatch(options: {
  readonly theme: AppearanceThemeId;
  readonly layout: WorkspaceEditorLayoutId;
}): SettingsPatch {
  return {
    ...buildGlobalEditorLayoutPatch(options.layout),
    appearance: { theme: options.theme },
  };
}

/** Default editor-layout slice for a workspace tab settings section. */
export function defaultTabEditorLayoutSettings(): { editorLayout: WorkspaceEditorLayoutId } {
  return createDefaultWorkspaceTabEditorSettings();
}
