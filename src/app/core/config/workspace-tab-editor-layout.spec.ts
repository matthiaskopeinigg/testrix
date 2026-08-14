import { describe, expect, it } from 'vitest';

import { createDefaultSettings } from '@shared/config';
import { buildGlobalEditorLayoutPatch } from '@shared/config/apply-workspace-editor-layout';

import { resolveTabEditorLayout } from './workspace-tab-editor-layout';

describe('resolveTabEditorLayout', () => {
  it('returns sidebar by default when settings are missing', () => {
    expect(resolveTabEditorLayout(null, 'regression')).toBe('sidebar');
  });

  it('reads per-section editorLayout from settings', () => {
    const settings = createDefaultSettings();
    settings.regression.editorLayout = 'titlebar';
    settings.testSuite.editorLayout = 'sidebar';
    expect(resolveTabEditorLayout(settings, 'regression')).toBe('titlebar');
    expect(resolveTabEditorLayout(settings, 'testSuite')).toBe('sidebar');
    expect(resolveTabEditorLayout(settings, 'collections')).toBe('sidebar');
  });
});

describe('buildGlobalEditorLayoutPatch', () => {
  it('sets all workspace tab editor layouts and completes onboarding', () => {
    const patch = buildGlobalEditorLayoutPatch('titlebar');
    expect(patch.collections?.editorLayout).toBe('titlebar');
    expect(patch.testSuite?.editorLayout).toBe('titlebar');
    expect(patch.regression?.editorLayout).toBe('titlebar');
    expect(patch.general?.layoutOnboardingCompleted).toBe(true);
  });
});
