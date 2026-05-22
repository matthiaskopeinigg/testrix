import { describe, expect, it } from 'vitest';

import { resolveTestSuiteTabUi, testSuiteTabUiSchema } from './test-suite-tab-ui.schema';

describe('testSuiteTabUiSchema', () => {
  it('parses defaults', () => {
    const ui = testSuiteTabUiSchema.parse({});
    expect(ui.selectedStepId).toBeNull();
    expect(ui.expandedStepFolderIds).toEqual([]);
    expect(ui.isResultsPanelHidden).toBe(false);
    expect(ui.activeFlowSection).toBe('steps');
  });

  it('migrates legacy editor section to steps', () => {
    const ui = testSuiteTabUiSchema.parse({ activeFlowSection: 'editor' });
    expect(ui.activeFlowSection).toBe('steps');
  });

  it('parses layout fields', () => {
    const ui = testSuiteTabUiSchema.parse({
      stepsPanelWidthPx: 320,
      resultsPanelHeightPx: 280,
      isResultsPanelHidden: true,
    });
    expect(ui.stepsPanelWidthPx).toBe(320);
    expect(ui.resultsPanelHeightPx).toBe(280);
    expect(ui.isResultsPanelHidden).toBe(true);
  });

  it('resolveTestSuiteTabUi returns defaults for missing id', () => {
    expect(resolveTestSuiteTabUi({}, 'missing').stepsPanelWidthPx).toBeUndefined();
  });
});
