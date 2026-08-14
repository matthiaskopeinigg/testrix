import { describe, expect, it } from 'vitest';

import { buildGlobalEditorLayoutPatch, buildOnboardingCompletePatch, WORKSPACE_EDITOR_LAYOUT_SECTIONS } from './apply-workspace-editor-layout';

describe('buildGlobalEditorLayoutPatch', () => {
  it('sets editorLayout on every workspace section', () => {
    const patch = buildGlobalEditorLayoutPatch('titlebar');

    for (const section of WORKSPACE_EDITOR_LAYOUT_SECTIONS) {
      expect(patch[section]).toEqual({ editorLayout: 'titlebar' });
    }
  });

  it('marks onboarding complete by default', () => {
    const patch = buildGlobalEditorLayoutPatch('sidebar');
    expect(patch.general).toEqual({ layoutOnboardingCompleted: true });
  });

  it('can skip marking onboarding complete', () => {
    const patch = buildGlobalEditorLayoutPatch('sidebar', false);
    expect(patch.general).toBeUndefined();
  });
});

describe('buildOnboardingCompletePatch', () => {
  it('includes theme, layout, and completion flag', () => {
    const patch = buildOnboardingCompletePatch({ theme: 'dracula', layout: 'titlebar' });
    expect(patch.appearance).toEqual({ theme: 'dracula' });
    expect(patch.collections).toEqual({ editorLayout: 'titlebar' });
    expect(patch.general).toEqual({ layoutOnboardingCompleted: true });
  });
});
