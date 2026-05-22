import { describe, expect, it } from 'vitest';

import { flowStepCanDrop } from './test-suite-flow-tree.mutations';
import type { FlowStepTreeNode } from './test-suite-flow-tree.adapter';

describe('flowStepCanDrop', () => {
  const stepNode = (id: string): FlowStepTreeNode => ({
    id,
    label: id,
    kind: 'step',
    data: { kind: 'step' },
  });

  const nodes: FlowStepTreeNode[] = [stepNode('a'), stepNode('b')];

  it('allows reordering between siblings', () => {
    expect(
      flowStepCanDrop(nodes, {
        sourceId: 'a',
        targetId: 'b',
        position: 'before',
        source: stepNode('a'),
        target: stepNode('b'),
      }),
    ).toBe(true);
  });

  it('denies dropping inside another step', () => {
    expect(
      flowStepCanDrop(nodes, {
        sourceId: 'a',
        targetId: 'b',
        position: 'inside',
        source: stepNode('a'),
        target: stepNode('b'),
      }),
    ).toBe(false);
  });
});
