import { describe, expect, it } from 'vitest';

import { buildEmptyFlowStepContextMenu, buildFlowStepContextMenu } from './test-suite-flow-context-menu';

describe('test-suite-flow-context-menu', () => {
  it('builds the empty-area create menu', () => {
    expect(buildEmptyFlowStepContextMenu().map((item) => item.id)).toEqual(['add-step']);
  });

  it('includes add step on a flow step row', () => {
    expect(buildFlowStepContextMenu().map((item) => item.id)).toEqual([
      'add-step',
      'clone',
      'delete',
    ]);
  });
});
