import { describe, expect, it } from 'vitest';

import {
  createDefaultSettings,
  settingsFileSchema,
  settingsPatchSchema,
} from '@shared/config';

describe('settingsFileSchema', () => {
  it('accepts default settings with logging and dataConfig', () => {
    const settings = createDefaultSettings();
    expect(settingsFileSchema.parse(settings)).toEqual(settings);
    expect(settings.logging.level).toBe('info');
    expect(settings.dataConfig.backupBeforeWrite).toBe(true);
    expect(settings.collections.foldersFirst).toBe(true);
    expect(settings.collections.animateExpand).toBe(true);
    expect(settings.collections.showDescriptions).toBe(true);
    expect(settings.collections.showTags).toBe(false);
    expect(settings.collections.folderClickBehavior).toBe('expandCollapseAndOpenTab');
    expect(settings.collections.editorLayout).toBe('sidebar');
    expect(settings.testSuite.editorLayout).toBe('sidebar');
    expect(settings.regression.editorLayout).toBe('sidebar');
    expect(settings.loadTest.editorLayout).toBe('sidebar');
    expect(settings.mockServer.editorLayout).toBe('sidebar');
    expect(settings.capture.editorLayout).toBe('sidebar');
    expect(settings.interceptor.editorLayout).toBe('sidebar');
    expect(settings.general.layoutOnboardingCompleted).toBe(false);
    expect(settings.keyboard.bindings).toEqual({});
    expect(settings.collections.displayHttpMethod).toBe('tree-and-tab');
    expect(settings.environments.animateMove).toBe(true);
    expect(settings.environments.animateExpand).toBe(true);
    expect(settings.environments.showDescriptions).toBe(true);
    expect(settings.environments.useFolderPathInKeys).toBe(false);
    expect(settings.http.request.timeoutMs).toBe(30_000);
    expect(settings.http.request.autoDetectContentTypeOnSend).toBe(true);
    expect(settings.http.headers.applyDefaultHeaders).toBe(true);
    expect(settings.http.headers.rows.length).toBeGreaterThanOrEqual(4);
    expect(settings.http.headers.rows[0]?.value).toMatch(/^Testrix\//);
    expect(settings.appearance.uiFont).toBe('inter');
    expect(settings.appearance.uiFontSize).toBe('medium');
    expect(settings.appearance.uiFontWeight).toBe('regular');
    expect(settings.appearance.uiLineHeight).toBe('normal');
    expect(settings.appearance.theme).toBe('github-light');
    expect(settings.editor.keyboard.shortcutsEnabled).toBe(true);
    expect(settings.editor.keyboard.autocompleteOnDot).toBe(true);
    expect(settings.editor.keyboard.autoCloseEnabled).toBe(true);
    expect(settings.editor.keyboard.smartEditingEnabled).toBe(false);
    expect(settings.editor.keyboard.markupSnippetAutocomplete).toBe(true);
    expect(settings.editor.keyboard.templateVariableAutocomplete).toBe(true);
    expect(settings.editor.keyboard.jsonClosingQuoteSuggest).toBe(true);
  });

  it('rejects invalid log level in patch', () => {
    expect(() =>
      settingsPatchSchema.parse({
        logging: { level: 'verbose' },
      }),
    ).toThrow();
  });

  it('merges partial logging patch', () => {
    const patch = settingsPatchSchema.parse({
      logging: { level: 'debug', maxFileSizeMb: 10 },
    });
    expect(patch.logging?.level).toBe('debug');
    expect(patch.logging?.maxFileSizeMb).toBe(10);
  });

  it('merges partial http patch', () => {
    const patch = settingsPatchSchema.parse({
      http: { request: { timeoutMs: 60_000 } },
    });
    expect(patch.http?.request?.timeoutMs).toBe(60_000);
  });
});
