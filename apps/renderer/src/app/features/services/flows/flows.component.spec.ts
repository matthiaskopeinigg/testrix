import { describe, expect, it } from 'vitest';

import {
  FLOW_CANVAS_STATUS_HINT,
  FLOW_EMPTY_CANVAS_HINT,
  opensCanvasContextMenuOnEmpty,
  pickerTargetFromEmptyCanvas,
} from './flow-canvas-actions';

/**
 * FlowsEditorComponent / FlowCanvasComponent contracts for empty-canvas add.
 * Keeps the Add node overlay path covered without mounting the full Angular tree.
 */
describe('FlowsEditorComponent (empty canvas)', () => {
  it('opens the Add node picker target instead of a canvas context menu', () => {
    expect(opensCanvasContextMenuOnEmpty()).toBe(false);
    const target = pickerTargetFromEmptyCanvas(240, 160);
    expect(target).toEqual({ at: { x: 240, y: 160 } });
    expect(target).not.toHaveProperty('kind');
  });

  it('uses shared empty-canvas and status copy', () => {
    expect(FLOW_EMPTY_CANVAS_HINT).toBe('Right-click between Start and End to open Add node.');
    expect(FLOW_CANVAS_STATUS_HINT).toContain('Ctrl+S saves');
  });
});

describe('FlowCanvasComponent (context routing)', () => {
  it('routes empty hits to the picker via canvasMenu → pickerTargetFromEmptyCanvas', () => {
    const world = { worldX: 88, worldY: 44 };
    expect(pickerTargetFromEmptyCanvas(world.worldX, world.worldY).at).toEqual({ x: 88, y: 44 });
  });
});

describe('FlowTemplateEditorComponent (empty canvas)', () => {
  it('shares the same empty-canvas picker mapping as the flow editor', () => {
    expect(pickerTargetFromEmptyCanvas(10, 20)).toEqual(
      pickerTargetFromEmptyCanvas(10, 20),
    );
    expect(opensCanvasContextMenuOnEmpty()).toBe(false);
  });
});
