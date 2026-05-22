import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

import type { RegressionFlowResult, RegressionRun } from '@shared/testing';
import { compareRegressionStepResults, type RegressionStepDiff } from '@shared/testing';

import { TxTagComponent } from '@app/shared/components/tx-tag/tx-tag.component';

@Component({
  selector: 'app-rg-flow-step-diff-panel',
  standalone: true,
  imports: [TxTagComponent],
  template: `
    <section class="rg-step-diff" aria-label="Step comparison">
      <header class="rg-step-diff__header">
        <h3 class="rg-step-diff__title">Step diffs · {{ flowName() }}</h3>
        <label class="rg-step-diff__toggle">
          <input type="checkbox" [checked]="changedOnly()" (change)="handleChangedOnlyToggle($event)" />
          Changed only
        </label>
      </header>

      @if (rows().length === 0) {
        <p class="rg-step-diff__empty">No step differences.</p>
      } @else {
        <ul class="rg-step-diff__list">
          @for (row of rows(); track row.stepId) {
            <li class="rg-step-diff__item" [class.is-changed]="row.changed">
              <div class="rg-step-diff__row-head">
                <span class="rg-step-diff__name">{{ row.stepName }}</span>
                <div class="rg-step-diff__statuses">
                  <tx-tag [variant]="statusVariant(row.statusA)" casing="normal">
                    A: {{ row.statusA ?? '—' }}
                  </tx-tag>
                  <tx-tag [variant]="statusVariant(row.statusB)" casing="normal">
                    B: {{ row.statusB ?? '—' }}
                  </tx-tag>
                </div>
              </div>
              @if (row.durationA !== null || row.durationB !== null) {
                <p class="rg-step-diff__meta">
                  Duration: {{ formatDuration(row.durationA) }} → {{ formatDuration(row.durationB) }}
                </p>
              }
              @if (expandedStepId() === row.stepId && (row.errorA || row.errorB)) {
                <div class="rg-step-diff__errors">
                  @if (row.errorA) {
                    <p><strong>A:</strong> {{ row.errorA }}</p>
                  }
                  @if (row.errorB) {
                    <p><strong>B:</strong> {{ row.errorB }}</p>
                  }
                </div>
              }
              @if (row.errorA || row.errorB) {
                <button type="button" class="rg-step-diff__expand" (click)="toggleExpand(row.stepId)">
                  {{ expandedStepId() === row.stepId ? 'Hide errors' : 'Show errors' }}
                </button>
              }
            </li>
          }
        </ul>
      }
    </section>
  `,
  styleUrl: './rg-flow-step-diff-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RgFlowStepDiffPanelComponent {
  readonly flowId = input.required<string>();
  readonly flowName = input('');
  readonly runA = input<RegressionRun | null>(null);
  readonly runB = input<RegressionRun | null>(null);

  protected readonly changedOnly = signal(true);
  protected readonly expandedStepId = signal<string | null>(null);

  protected readonly rows = computed((): readonly RegressionStepDiff[] => {
    const flowId = this.flowId();
    const resultA = this.findFlowResult(this.runA(), flowId);
    const resultB = this.findFlowResult(this.runB(), flowId);
    const diffs = compareRegressionStepResults(resultA, resultB);
    if (this.changedOnly()) {
      return diffs.filter((row) => row.changed);
    }
    return diffs;
  });

  protected handleChangedOnlyToggle(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.changedOnly.set(target.checked);
  }

  protected toggleExpand(stepId: string): void {
    this.expandedStepId.update((current) => (current === stepId ? null : stepId));
  }

  protected formatDuration(value: number | null): string {
    return value === null ? '—' : `${value} ms`;
  }

  protected statusVariant(
    status: RegressionStepDiff['statusA'],
  ): 'success' | 'warning' | 'error' | 'default' {
    if (status === 'passed') {
      return 'success';
    }
    if (status === 'failed') {
      return 'error';
    }
    if (status === 'skipped') {
      return 'warning';
    }
    return 'default';
  }

  private findFlowResult(
    run: RegressionRun | null,
    flowId: string,
  ): RegressionFlowResult | null {
    if (!run) {
      return null;
    }
    return run.flowResults.find((flow) => flow.flowId === flowId) ?? null;
  }
}
