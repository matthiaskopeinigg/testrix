import { describe, expect, it } from 'vitest';

import { createFlowStep } from '@shared/testing';

import { FLOW_DIAGRAM_ROW_COLUMNS, layoutFlowStepDiagram } from './flow-step-diagram.layout';

describe('layoutFlowStepDiagram', () => {
  it('lays out IF as a diamond with Then/Else lanes side by side', () => {
    const iff = createFlowStep('IF', 'Branch', null, 'if-1');
    const layout = layoutFlowStepDiagram([iff]);
    const diamond = layout.nodes.find((node) => node.id === 'if-1');
    expect(diamond?.shape).toBe('diamond');
    expect(layout.nodes.some((node) => node.shape === 'lane')).toBe(true);
    expect(layout.edges.some((edge) => edge.label === 'Then')).toBe(true);
    const thenLane = layout.nodes.find((node) => node.label === 'Then');
    const elseLane = layout.nodes.find((node) => node.label === 'Else');
    expect(thenLane && elseLane && elseLane.x).toBeGreaterThan(thenLane?.x ?? 0);
  });

  it('wraps sequential leaf steps onto a second row', () => {
    const steps = Array.from({ length: FLOW_DIAGRAM_ROW_COLUMNS + 1 }, (_, index) =>
      createFlowStep('WAIT', `Step ${index + 1}`, null, `s${index + 1}`),
    );
    const layout = layoutFlowStepDiagram(steps);
    const first = layout.nodes.find((node) => node.id === 's1');
    const lastInRow = layout.nodes.find((node) => node.id === `s${FLOW_DIAGRAM_ROW_COLUMNS}`);
    const wrapped = layout.nodes.find((node) => node.id === `s${FLOW_DIAGRAM_ROW_COLUMNS + 1}`);
    expect(first?.y).toBe(lastInRow?.y);
    expect(wrapped?.y ?? 0).toBeGreaterThan(first?.y ?? 0);
    expect(wrapped?.x).toBe(first?.x);
  });
});
