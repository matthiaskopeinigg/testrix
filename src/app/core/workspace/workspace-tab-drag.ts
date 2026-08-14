import type { SplitDirection, SplitPanePlacement } from '@shared/config';

/** MIME type for tab drag payloads between tab bars and editor drop targets. */
export const WORKSPACE_TAB_DRAG_MIME = 'application/x-testrix-tab';

/** Payload stored on {@link DataTransfer} when dragging an editor tab. */
export interface WorkspaceTabDragPayload {
  readonly tabId: string;
  readonly fromGroupId: string;
  readonly fromIndex: number;
}

/** Cardinal edge used to split a pane (drag overlay or context menu). */
export type WorkspaceEditorSplitZone = 'left' | 'right' | 'top' | 'bottom';

/** @deprecated Use {@link WorkspaceEditorSplitZone}. */
export type WorkspaceEditorDropZone = WorkspaceEditorSplitZone;

const EDGE_RATIO = 0.25;

/**
 * Serializes a tab drag payload for {@link DataTransfer}.
 */
export function serializeWorkspaceTabDragPayload(payload: WorkspaceTabDragPayload): string {
  return JSON.stringify(payload);
}

/**
 * Parses a tab drag payload from drag data.
 */
export function parseWorkspaceTabDragPayload(raw: string): WorkspaceTabDragPayload | null {
  try {
    const parsed = JSON.parse(raw) as WorkspaceTabDragPayload;
    if (
      typeof parsed.tabId !== 'string' ||
      typeof parsed.fromGroupId !== 'string' ||
      typeof parsed.fromIndex !== 'number'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Reads tab drag payload from a {@link DataTransfer} (works on `drop`, not `dragover`).
 */
export function readWorkspaceTabDragPayload(
  dataTransfer: DataTransfer | null | undefined,
): WorkspaceTabDragPayload | null {
  const raw = dataTransfer?.getData(WORKSPACE_TAB_DRAG_MIME);
  if (!raw) {
    return null;
  }
  return parseWorkspaceTabDragPayload(raw);
}

/**
 * Returns true when the drag event likely carries a workspace tab.
 */
export function isWorkspaceTabDragEvent(
  dataTransfer: DataTransfer | null | undefined,
): boolean {
  if (!dataTransfer) {
    return false;
  }
  return Array.from(dataTransfer.types).includes(WORKSPACE_TAB_DRAG_MIME);
}

/**
 * Resolves a cardinal split zone from pointer position, or `null` in the pane interior.
 */
export function resolveWorkspaceEditorSplitZone(
  rect: DOMRect,
  clientX: number,
  clientY: number,
  edgeRatio = EDGE_RATIO,
): WorkspaceEditorSplitZone | null {
  const relX = (clientX - rect.left) / Math.max(rect.width, 1);
  const relY = (clientY - rect.top) / Math.max(rect.height, 1);

  const fromLeft = relX;
  const fromRight = 1 - relX;
  const fromTop = relY;
  const fromBottom = 1 - relY;

  const inLeft = fromLeft < edgeRatio;
  const inRight = fromRight < edgeRatio;
  const inTop = fromTop < edgeRatio;
  const inBottom = fromBottom < edgeRatio;

  if (!inLeft && !inRight && !inTop && !inBottom) {
    return null;
  }

  const candidates: { readonly zone: WorkspaceEditorSplitZone; readonly dist: number }[] = [];
  if (inLeft) {
    candidates.push({ zone: 'left', dist: fromLeft });
  }
  if (inRight) {
    candidates.push({ zone: 'right', dist: fromRight });
  }
  if (inTop) {
    candidates.push({ zone: 'top', dist: fromTop });
  }
  if (inBottom) {
    candidates.push({ zone: 'bottom', dist: fromBottom });
  }

  candidates.sort((a, b) => a.dist - b.dist);
  return candidates[0]?.zone ?? null;
}

/** @deprecated Use {@link resolveWorkspaceEditorSplitZone}. */
export const resolveWorkspaceEditorDropZone = resolveWorkspaceEditorSplitZone;

/**
 * Maps a cardinal split zone to layout direction and pane placement.
 */
export function mapSplitZoneToLayout(zone: WorkspaceEditorSplitZone): {
  readonly direction: SplitDirection;
  readonly placement: SplitPanePlacement;
} {
  switch (zone) {
    case 'left':
      return { direction: 'horizontal', placement: 'before' };
    case 'right':
      return { direction: 'horizontal', placement: 'after' };
    case 'top':
      return { direction: 'vertical', placement: 'before' };
    case 'bottom':
      return { direction: 'vertical', placement: 'after' };
  }
}

/** @deprecated Use {@link mapSplitZoneToLayout}. */
export const mapDropZoneToSplit = mapSplitZoneToLayout;
