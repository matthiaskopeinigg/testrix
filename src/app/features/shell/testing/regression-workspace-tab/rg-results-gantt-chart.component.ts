import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { RegressionFlowTimelineEntry } from '@shared/testing';

interface GanttBar {
  readonly entry: RegressionFlowTimelineEntry;
  readonly leftPercent: number;
  readonly widthPercent: number;
  readonly lane: number;
  readonly isGhost: boolean;
}

@Component({
  selector: 'app-rg-results-gantt-chart',
  standalone: true,
  template: `
    <section class="rg-gantt" aria-label="Flow execution timeline">
      <h3 class="rg-gantt__title">Flow timeline</h3>
      @if (bars().length === 0) {
        <p class="rg-gantt__empty">No timeline data for this run.</p>
      } @else {
        <div class="rg-gantt__lanes" [style.--rg-lane-count]="laneCount()">
          @for (lane of laneIndices(); track lane) {
            <div class="rg-gantt__lane" [attr.data-lane]="lane">
              <span class="rg-gantt__lane-label">Slot {{ lane + 1 }}</span>
              <div class="rg-gantt__track">
                @for (bar of barsForLane(lane); track bar.entry.flowId + (bar.isGhost ? '-ghost' : '')) {
                  <button
                    type="button"
                    class="rg-gantt__bar"
                    [class.is-ghost]="bar.isGhost"
                    [class.is-selected]="!bar.isGhost && selectedFlowId() === bar.entry.flowId"
                    [attr.data-status]="bar.entry.status"
                    [style.left.%]="bar.leftPercent"
                    [style.width.%]="bar.widthPercent"
                    [title]="barTitle(bar.entry)"
                    (click)="handleBarClick(bar)"
                  >
                    <span class="rg-gantt__bar-label">{{ bar.entry.flowName }}</span>
                  </button>
                }
              </div>
            </div>
          }
        </div>
      }
    </section>
  `,
  styleUrl: './rg-results-gantt-chart.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RgResultsGanttChartComponent {
  readonly timeline = input<readonly RegressionFlowTimelineEntry[]>([]);
  readonly compareTimeline = input<readonly RegressionFlowTimelineEntry[]>([]);
  readonly totalDurationMs = input(1);
  readonly selectedFlowId = input<string | null>(null);

  readonly flowSelected = output<string>();

  protected readonly laneCount = computed(() => {
    const entries = [...this.timeline(), ...this.compareTimeline()];
    if (entries.length === 0) {
      return 1;
    }
    return Math.max(...entries.map((e) => e.workerSlot), 0) + 1;
  });

  protected readonly laneIndices = computed(() =>
    Array.from({ length: this.laneCount() }, (_, index) => index),
  );

  protected readonly bars = computed((): readonly GanttBar[] => {
    const total = Math.max(this.totalDurationMs(), 1);
    const primary = this.timeline().map((entry) => toBar(entry, total, false));
    const ghost = this.compareTimeline().map((entry) => toBar(entry, total, true));
    return [...ghost, ...primary];
  });

  protected barsForLane(lane: number): readonly GanttBar[] {
    return this.bars().filter((bar) => bar.lane === lane);
  }

  protected barTitle(entry: RegressionFlowTimelineEntry): string {
    return `${entry.flowName} · ${entry.status} · ${entry.durationMs} ms`;
  }

  protected handleBarClick(bar: GanttBar): void {
    if (bar.isGhost) {
      return;
    }
    this.flowSelected.emit(bar.entry.flowId);
  }
}

function toBar(
  entry: RegressionFlowTimelineEntry,
  totalMs: number,
  isGhost: boolean,
): GanttBar {
  const leftPercent = (entry.startedAtOffsetMs / totalMs) * 100;
  const widthPercent = Math.max(1.5, (entry.durationMs / totalMs) * 100);
  return {
    entry,
    leftPercent: Math.min(leftPercent, 99),
    widthPercent: Math.min(widthPercent, 100 - leftPercent),
    lane: entry.workerSlot,
    isGhost,
  };
}
