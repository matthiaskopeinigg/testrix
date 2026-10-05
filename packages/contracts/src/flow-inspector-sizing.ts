/** Flow node inspector panel width (session-persisted). */

export const FLOW_INSPECTOR_DEFAULT_WIDTH = 300;
export const FLOW_INSPECTOR_WIDE_DEFAULT_WIDTH = 460;
export const FLOW_INSPECTOR_MIN_WIDTH = 260;
export const FLOW_INSPECTOR_MAX_WIDTH = 720;

export function clampFlowInspectorWidth(width: number): number {
  if (!Number.isFinite(width))
    return FLOW_INSPECTOR_DEFAULT_WIDTH;
  return Math.round(Math.min(FLOW_INSPECTOR_MAX_WIDTH, Math.max(FLOW_INSPECTOR_MIN_WIDTH, width)));
}
