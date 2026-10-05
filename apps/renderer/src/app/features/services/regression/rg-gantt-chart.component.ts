import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { RegressionFlowTimelineEntry } from '@testrix/contracts';
import { TxHintComponent } from '@testrix/ui';

import {
  ganttBarGeometry,
  ganttBarLabel,
  ganttBarTitle,
  ganttEffectiveDurationMs,
} from './rg-gantt-geometry';

export {
  ganttBarGeometry,
  ganttBarLabel,
  ganttBarTitle,
  ganttEffectiveDurationMs,
  ganttTimelineExtentMs,
} from './rg-gantt-geometry';

interface GanttBar {
  readonly entry: RegressionFlowTimelineEntry;
  readonly key: string;
  readonly label: string;
  readonly title: string;
  readonly leftPercent: number;
  readonly widthPercent: number;
  readonly lane: number;
  readonly isGhost: boolean;
}

/**
 * Gantt-style timeline of a regression run's flow/scenario entries.
 * Renders one lane per worker slot, with an optional ghost overlay for compare mode.
 */
@Component({
  selector: 'tx-rg-gantt-chart',
  standalone: true,
  imports: [TxHintComponent],
  templateUrl: './rg-gantt-chart.component.html',
  styleUrl: './rg-gantt-chart.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RgGanttChartComponent {
  readonly timeline = input<readonly RegressionFlowTimelineEntry[]>([]);
  readonly compareTimeline = input<readonly RegressionFlowTimelineEntry[]>([]);
  readonly totalDurationMs = input(1);
  readonly selectedFlowId = input<string | null>(null);

  readonly flowSelected = output<string>();

  readonly laneCount = computed(() => {
    const entries = [...this.timeline(), ...this.compareTimeline()];
    if (entries.length === 0)
      return 1;
    return Math.max(...entries.map((entry) => entry.workerSlot), 0) + 1;
  });

  readonly laneIndices = computed(() =>
    Array.from({ length: this.laneCount() }, (_, index) => index),
  );

  readonly bars = computed((): readonly GanttBar[] => {
    const total = Math.max(this.totalDurationMs(), 1);
    const ghost = this.compareTimeline().map((entry, index) => toBar(entry, total, true, index));
    const primary = this.timeline().map((entry, index) => toBar(entry, total, false, index));
    return [...ghost, ...primary];
  });

  barsForLane(lane: number): readonly GanttBar[] {
    return this.bars().filter((bar) => bar.lane === lane);
  }

  handleBarClick(bar: GanttBar): void {
    if (bar.isGhost)
      return;
    this.flowSelected.emit(bar.entry.flowId);
  }
}

function toBar(
  entry: RegressionFlowTimelineEntry,
  totalMs: number,
  isGhost: boolean,
  index: number,
): GanttBar {
  const durationMs = ganttEffectiveDurationMs(entry, totalMs);
  const geometry = ganttBarGeometry(entry.startedAtOffsetMs, durationMs, totalMs);
  return {
    entry,
    key: `${isGhost ? 'ghost' : 'live'}-${entry.flowId}-${index}`,
    label: ganttBarLabel(entry),
    title: ganttBarTitle(entry, durationMs),
    leftPercent: geometry.leftPercent,
    widthPercent: geometry.widthPercent,
    lane: entry.workerSlot,
    isGhost,
  };
}
