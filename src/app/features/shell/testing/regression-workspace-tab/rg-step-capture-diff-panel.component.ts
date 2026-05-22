import { ChangeDetectionStrategy, Component, computed, effect, input, output, untracked } from '@angular/core';

import type { RegressionFlowResult, RegressionRun } from '@shared/testing';
import {
  buildRegressionCaptureTextDiff,
  summarizeCaptureDiff,
} from '@shared/testing';

import { TxDiffViewComponent } from '@app/shared/components/tx-diff-view/tx-diff-view.component';
import { TxTagComponent } from '@app/shared/components/tx-tag/tx-tag.component';

@Component({
  selector: 'app-rg-step-capture-diff-panel',
  standalone: true,
  imports: [TxDiffViewComponent, TxTagComponent],
  template: `
    <section class="rg-capture-diff" aria-label="Capture comparison">
      <header class="rg-capture-diff__header">
        <h3 class="rg-capture-diff__title">Capture diff</h3>
        @if (summary(); as s) {
          <tx-tag [variant]="s.changed ? 'warning' : 'success'" casing="normal">
            {{ s.changed ? 'Changed' : 'Unchanged' }}
          </tx-tag>
        }
      </header>

      @if (stepOptions().length === 0) {
        <p class="rg-capture-diff__empty">No step captures available for comparison.</p>
      } @else {
        <label class="rg-capture-diff__picker">
          Step
          <select [value]="selectedStepId()" (change)="handleStepChange($event)">
            @for (option of stepOptions(); track option.stepId) {
              <option [value]="option.stepId">{{ option.stepName }}</option>
            }
          </select>
        </label>

        <label class="rg-capture-diff__toggle">
          <input
            type="checkbox"
            [checked]="normalizeJson()"
            (change)="handleNormalizeJsonToggle($event)"
          />
          Normalize JSON
        </label>

        @if (summary(); as s) {
          <ul class="rg-capture-diff__summary">
            @for (line of s.summaryLines; track line) {
              <li>{{ line }}</li>
            }
          </ul>
        }

        <tx-diff-view class="rg-capture-diff__body" [diff]="diff()" [workbenchLayout]="true" />
      }
    </section>
  `,
  styleUrl: './rg-step-capture-diff-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RgStepCaptureDiffPanelComponent {
  readonly flowId = input.required<string>();
  readonly runA = input<RegressionRun | null>(null);
  readonly runB = input<RegressionRun | null>(null);
  readonly selectedStepId = input<string | null>(null);
  readonly normalizeJson = input(true);

  readonly selectedStepIdChange = output<string | null>();
  readonly normalizeJsonChange = output<boolean>();

  constructor() {
    effect(() => {
      const options = this.stepOptions();
      const current = this.selectedStepId();
      if (current && options.some((option) => option.stepId === current)) {
        return;
      }
      const fallback = options[0]?.stepId ?? null;
      if (fallback !== current) {
        untracked(() => this.selectedStepIdChange.emit(fallback));
      }
    });
  }

  protected readonly stepOptions = computed(() => {
    const flowId = this.flowId();
    const resultA = this.findFlowResult(this.runA(), flowId);
    const resultB = this.findFlowResult(this.runB(), flowId);
    const stepIds = new Set([
      ...Object.keys(resultA?.stepCaptures ?? {}),
      ...Object.keys(resultB?.stepCaptures ?? {}),
    ]);
    return [...stepIds].map((stepId) => ({
      stepId,
      stepName: stepId,
    }));
  });

  protected readonly capturePair = computed(() => {
    const stepId = this.selectedStepId() || this.stepOptions()[0]?.stepId;
    if (!stepId) {
      return { a: undefined, b: undefined };
    }
    const flowId = this.flowId();
    const resultA = this.findFlowResult(this.runA(), flowId);
    const resultB = this.findFlowResult(this.runB(), flowId);
    return {
      a: resultA?.stepCaptures?.[stepId],
      b: resultB?.stepCaptures?.[stepId],
    };
  });

  protected readonly summary = computed(() =>
    summarizeCaptureDiff(this.capturePair().a, this.capturePair().b),
  );

  protected readonly diff = computed(() =>
    buildRegressionCaptureTextDiff(this.capturePair().a, this.capturePair().b, {
      normalizeJson: this.normalizeJson(),
    }),
  );

  protected handleStepChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.selectedStepIdChange.emit(target.value || null);
  }

  protected handleNormalizeJsonToggle(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.normalizeJsonChange.emit(target.checked);
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
