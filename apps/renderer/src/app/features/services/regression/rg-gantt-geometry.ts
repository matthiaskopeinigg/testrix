import type { RegressionFlowTimelineEntry } from '@testrix/contracts';

/** Display label for a Gantt bar - prefer scenario when present. */
export function ganttBarLabel(entry: RegressionFlowTimelineEntry): string {
  const scenario = entry.scenarioName?.trim();
  if (scenario)
    return scenario;
  return entry.flowName;
}

/** Hover / aria title for a Gantt bar. */
export function ganttBarTitle(entry: RegressionFlowTimelineEntry, durationMs: number): string {
  const name = entry.scenarioName?.trim()
    ? `${entry.flowName} · ${entry.scenarioName}`
    : entry.flowName;
  return `${name} · ${entry.status} · ${Math.round(Math.max(0, durationMs))} ms`;
}

/**
 * Duration used for layout. Running bars with no recorded duration stretch to `nowMs`
 * so in-flight work fills the track instead of collapsing to a left-side speck.
 */
export function ganttEffectiveDurationMs(
  entry: Pick<RegressionFlowTimelineEntry, 'startedAtOffsetMs' | 'durationMs' | 'status'>,
  nowMs: number,
): number {
  if (entry.status === 'running' && entry.durationMs <= 0)
    return Math.max(0, nowMs - entry.startedAtOffsetMs);
  return Math.max(0, entry.durationMs);
}

/** Pure geometry for a Gantt bar as left/width percentages of the total run duration. */
export function ganttBarGeometry(
  startedAtOffsetMs: number,
  durationMs: number,
  totalMs: number,
): { readonly leftPercent: number; readonly widthPercent: number } {
  const total = Math.max(totalMs, 1);
  const leftPercent = Math.min((Math.max(0, startedAtOffsetMs) / total) * 100, 99);
  const widthPercent = Math.min(
    Math.max(2.5, (Math.max(0, durationMs) / total) * 100),
    100 - leftPercent,
  );
  return { leftPercent, widthPercent };
}

/** Latest end offset across timeline entries, stretching running bars to `nowMs`. */
export function ganttTimelineExtentMs(
  entries: readonly RegressionFlowTimelineEntry[],
  nowMs = 0,
): number {
  return entries.reduce((max, entry) => {
    const duration = ganttEffectiveDurationMs(entry, nowMs);
    return Math.max(max, entry.startedAtOffsetMs + duration);
  }, 0);
}
