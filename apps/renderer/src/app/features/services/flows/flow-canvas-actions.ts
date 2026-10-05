/**
 * Pure helpers for flow canvas context actions.
 * Empty canvas opens the Add node picker — never a context menu.
 */

export type FlowCanvasHit =
  | { readonly kind: 'node'; readonly id: string }
  | { readonly kind: 'edge'; readonly id: string }
  | { readonly kind: 'empty' };

export interface FlowCanvasClosestHost {
  closest(selectors: string): { readonly dataset: { readonly [key: string]: string | undefined } } | null;
}

export interface FlowEmptyCanvasPickerTarget {
  readonly at: { readonly x: number; readonly y: number };
}

/** Resolves whether a context event hit a node, edge, or empty canvas. */
export function hitTestFlowCanvasTarget(target: FlowCanvasClosestHost | EventTarget | null): FlowCanvasHit {
  const host = asClosestHost(target);
  if (!host)
    return { kind: 'empty' };

  const nodeEl = host.closest('[data-node-id]');
  const nodeId = nodeEl?.dataset['nodeId']?.trim();
  if (nodeId)
    return { kind: 'node', id: nodeId };

  const edgeEl = host.closest('[data-edge-id]');
  const edgeId = edgeEl?.dataset['edgeId']?.trim();
  if (edgeId)
    return { kind: 'edge', id: edgeId };

  return { kind: 'empty' };
}

/**
 * Maps an empty-canvas world point to the Add node picker target.
 * Replaces the former canvas context menu.
 */
export function pickerTargetFromEmptyCanvas(worldX: number, worldY: number): FlowEmptyCanvasPickerTarget {
  return { at: { x: worldX, y: worldY } };
}

/** Product policy: empty-canvas right-click must not open a context menu. */
export function opensCanvasContextMenuOnEmpty(): false {
  return false;
}

export const FLOW_EMPTY_CANVAS_HINT = 'Right-click between Start and End to open Add node.';

export const FLOW_CANVAS_STATUS_HINT =
  'Drag a port to connect. Right-click empty canvas to add a node. Ctrl+S saves. Middle-drag to pan.';

function asClosestHost(target: FlowCanvasClosestHost | EventTarget | null): FlowCanvasClosestHost | null {
  if (!target || typeof (target as FlowCanvasClosestHost).closest !== 'function')
    return null;
  return target as FlowCanvasClosestHost;
}
