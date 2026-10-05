import { describe, expect, it } from 'vitest';

import {
  FLOW_CANVAS_STATUS_HINT,
  FLOW_EMPTY_CANVAS_HINT,
  hitTestFlowCanvasTarget,
  opensCanvasContextMenuOnEmpty,
  pickerTargetFromEmptyCanvas,
  type FlowCanvasClosestHost,
} from './flow-canvas-actions';

function host(dataset: Record<string, string>, selector: string): FlowCanvasClosestHost {
  return {
    closest(query: string) {
      if (query !== selector)
        return null;
      return { dataset };
    },
  };
}

describe('hitTestFlowCanvasTarget', () => {
  it('returns empty when the target has no closest host', () => {
    expect(hitTestFlowCanvasTarget(null)).toEqual({ kind: 'empty' });
    expect(hitTestFlowCanvasTarget({} as EventTarget)).toEqual({ kind: 'empty' });
  });

  it('prefers a node hit over empty canvas', () => {
    expect(hitTestFlowCanvasTarget(host({ nodeId: 'n1' }, '[data-node-id]'))).toEqual({
      kind: 'node',
      id: 'n1',
    });
  });

  it('resolves an edge hit when no node is under the pointer', () => {
    expect(hitTestFlowCanvasTarget(host({ edgeId: 'e1' }, '[data-edge-id]'))).toEqual({
      kind: 'edge',
      id: 'e1',
    });
  });

  it('ignores blank node or edge ids', () => {
    expect(hitTestFlowCanvasTarget(host({ nodeId: '  ' }, '[data-node-id]'))).toEqual({ kind: 'empty' });
    expect(hitTestFlowCanvasTarget(host({ edgeId: '' }, '[data-edge-id]'))).toEqual({ kind: 'empty' });
  });

  it('returns empty when closest finds neither node nor edge', () => {
    const blank: FlowCanvasClosestHost = {
      closest: () => null,
    };
    expect(hitTestFlowCanvasTarget(blank)).toEqual({ kind: 'empty' });
  });
});

describe('pickerTargetFromEmptyCanvas', () => {
  it('maps world coordinates to the Add node picker target', () => {
    expect(pickerTargetFromEmptyCanvas(120.5, 80)).toEqual({ at: { x: 120.5, y: 80 } });
    expect(pickerTargetFromEmptyCanvas(0, 0)).toEqual({ at: { x: 0, y: 0 } });
  });
});

describe('empty-canvas menu policy', () => {
  it('never opens a context menu on empty canvas', () => {
    expect(opensCanvasContextMenuOnEmpty()).toBe(false);
  });

  it('ships empty-state and status hints that mention Add node', () => {
    expect(FLOW_EMPTY_CANVAS_HINT).toContain('Add node');
    expect(FLOW_CANVAS_STATUS_HINT).toContain('Right-click empty canvas');
  });
});
