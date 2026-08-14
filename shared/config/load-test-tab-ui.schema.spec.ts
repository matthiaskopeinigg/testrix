import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LOAD_TEST_TAB_SECTION,
  coerceLoadTestTabSectionId,
  loadTestTabUiSchema,
  resolveLoadTestTabUi,
} from '@shared/config/load-test-tab-ui.schema';

describe('load-test-tab-ui.schema', () => {
  it('returns defaults for unknown resource ids', () => {
    expect(resolveLoadTestTabUi({}, 'lt:missing')).toEqual(
      loadTestTabUiSchema.parse({ activeSection: DEFAULT_LOAD_TEST_TAB_SECTION }),
    );
  });

  it('restores saved section and results pane geometry', () => {
    const ui = resolveLoadTestTabUi(
      {
        'lt:a1': {
          activeSection: 'profile',
          resultsPanelHeightPx: 420,
          isResultsPanelHidden: true,
          selectedRunId: 'run-1',
          pinnedBaselineRunId: 'run-0',
          compareSelection: { a: 'run-0', b: 'run-1' },
          resultsView: 'compare',
        },
      },
      'lt:a1',
    );

    expect(ui.activeSection).toBe('profile');
    expect(ui.resultsPanelHeightPx).toBe(420);
    expect(ui.isResultsPanelHidden).toBe(true);
    expect(ui.selectedRunId).toBe('run-1');
    expect(ui.pinnedBaselineRunId).toBe('run-0');
    expect(ui.compareSelection).toEqual({ a: 'run-0', b: 'run-1' });
    expect(ui.resultsView).toBe('compare');
  });

  it('coerces invalid section ids to overview', () => {
    expect(coerceLoadTestTabSectionId('invalid')).toBe('overview');
  });
});
