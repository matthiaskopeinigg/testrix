import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  REGRESSION_MAX_PARALLELISM,
  type RegressionProfile,
  type RegressionRunScope,
  type RegressionThresholds,
} from '@shared/testing';

import { TxBannerComponent } from '@app/shared/components/feedback/tx-banner/tx-banner.component';
import { TxDropdownComponent } from '@app/shared/components/forms/tx-dropdown/tx-dropdown.component';
import type { TxDropdownOption } from '@app/shared/components/forms/tx-dropdown/tx-dropdown.types';
import { TxFormFieldComponent } from '@app/shared/components/forms/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/forms/tx-input/tx-input.component';
import { TxSliderComponent } from '@app/shared/components/forms/tx-slider/tx-slider.component';
import { TxTagsInputComponent } from '@app/shared/components/forms/tx-tags-input/tx-tags-input.component';
import { TxTextareaComponent } from '@app/shared/components/forms/tx-textarea/tx-textarea.component';
import { TxToggleComponent } from '@app/shared/components/forms/tx-toggle/tx-toggle.component';

@Component({
  selector: 'app-rg-tab-settings-panel',
  standalone: true,
  imports: [
    FormsModule,
    TxBannerComponent,
    TxDropdownComponent,
    TxFormFieldComponent,
    TxInputComponent,
    TxSliderComponent,
    TxTagsInputComponent,
    TxTextareaComponent,
    TxToggleComponent,
  ],
  template: `
    <div class="request-panel">
      <h2 class="request-panel__title">General</h2>
      <p class="request-panel__hint">Title, release label, tags, and summary for this regression.</p>

      <tx-form-field label="Title" controlId="rg-title">
        <tx-input
          id="rg-title"
          [ngModel]="name()"
          (ngModelChange)="nameChange.emit($event)"
        />
      </tx-form-field>

      <tx-form-field label="Release" controlId="rg-release">
        <tx-input
          id="rg-release"
          placeholder="e.g. v2.4.0"
          [ngModel]="release()"
          (ngModelChange)="releaseChange.emit($event)"
        />
      </tx-form-field>

      <tx-form-field label="Tags" controlId="rg-tags">
        <tx-tags-input
          id="rg-tags"
          [compact]="true"
          [ngModel]="tags()"
          (ngModelChange)="tagsChange.emit($event)"
        />
      </tx-form-field>

      <tx-form-field label="Description" controlId="rg-settings-description">
        <tx-textarea
          id="rg-settings-description"
          [ngModel]="description()"
          (ngModelChange)="descriptionChange.emit($event)"
          placeholder="Short summary of this regression suite"
        />
      </tx-form-field>

      <h2 class="request-panel__title">Execution profile</h2>
      <p class="request-panel__hint">
        Controls how linked flows run: parallelism, environment, and failure handling.
      </p>

      <tx-form-field label="Default run scope" controlId="rg-run-scope">
        <tx-dropdown
          id="rg-run-scope"
          ariaLabel="Default run scope"
          [options]="runScopeOptions"
          [ngModel]="profile().runScope"
          (ngModelChange)="handleProfileChange({ runScope: $event })"
        />
      </tx-form-field>

      <tx-toggle
        label="Reuse E2E session"
        hint="Force sequential runs and keep one browser session across flows. Parallel workers never share partitions."
        [ngModel]="profile().reuseE2eSession === true"
        (ngModelChange)="handleReuseE2e($event)"
      />
      @if (profile().reuseE2eSession) {
        <tx-banner variant="info" title="Sequential E2E">
          Reuse E2E session keeps parallelism at 1 so later flows share cookies and login.
        </tx-banner>
      }
      <tx-form-field label="Bootstrap flow" controlId="rg-bootstrap-flow">
        <tx-dropdown
          id="rg-bootstrap-flow"
          ariaLabel="Bootstrap flow"
          [options]="bootstrapFlowOptions()"
          [ngModel]="profile().bootstrapFlowId ?? ''"
          (ngModelChange)="handleProfileChange({ bootstrapFlowId: $event || null })"
        />
      </tx-form-field>

      <tx-form-field label="Execution mode" controlId="rg-execution-mode">
        <tx-dropdown
          id="rg-execution-mode"
          ariaLabel="Execution mode"
          [options]="executionModeOptions"
          [ngModel]="profile().executionMode"
          (ngModelChange)="handleProfileChange({ executionMode: $event })"
        />
      </tx-form-field>

      @if (profile().executionMode === 'parallel' && !profile().reuseE2eSession) {
        <div class="rg-settings-stack">
          <tx-toggle
            label="All flows at once"
            [hint]="'Run every linked flow concurrently (up to ' + maxParallelism + ' workers).'"
            [ngModel]="profile().allFlowsAtOnce === true"
            (ngModelChange)="handleAllFlowsAtOnce($event)"
          />

          <tx-form-field label="Max parallelism" controlId="rg-max-parallelism">
            <tx-input
              id="rg-max-parallelism"
              type="number"
              [attr.min]="1"
              [attr.max]="maxParallelism"
              [disabled]="profile().allFlowsAtOnce === true"
              [ngModel]="profile().maxParallelism"
              (ngModelChange)="handleProfileChange({ maxParallelism: toParallelism($event, profile().maxParallelism) })"
            />
            <span class="request-panel__hint">
              @if (profile().allFlowsAtOnce) {
                Parallelism is automatic while All flows at once is on (up to {{ maxParallelism }} workers).
              } @else {
                Up to {{ maxParallelism }} concurrent flow workers.
              }
            </span>
          </tx-form-field>
        </div>
      }

      <tx-form-field label="Retries per failed flow" controlId="rg-retries">
        <tx-input
          id="rg-retries"
          type="number"
          [attr.min]="0"
          [attr.max]="3"
          [ngModel]="profile().retryFailedFlows"
          (ngModelChange)="handleProfileChange({ retryFailedFlows: toBoundedInt($event, profile().retryFailedFlows, 0, 3) })"
        />
        <span class="request-panel__hint">Extra attempts after the first failure (0–3).</span>
      </tx-form-field>

      <tx-toggle
        label="Stop on first failure"
        [ngModel]="profile().stopOnFirstFailure"
        (ngModelChange)="handleProfileChange({ stopOnFirstFailure: $event })"
      />

      <tx-form-field label="Delay between flows (ms)" controlId="rg-delay">
        <tx-input
          id="rg-delay"
          type="number"
          [attr.min]="0"
          [ngModel]="profile().delayBetweenFlowsMs"
          (ngModelChange)="handleProfileChange({ delayBetweenFlowsMs: toBoundedInt($event, profile().delayBetweenFlowsMs, 0, 86400000) })"
        />
      </tx-form-field>

      <tx-toggle
        label="Shuffle order"
        [ngModel]="profile().shuffleOrder"
        (ngModelChange)="handleProfileChange({ shuffleOrder: $event })"
      />

      <tx-toggle
        label="Update flow last-run status"
        [ngModel]="profile().updateFlowLastRunStatus"
        (ngModelChange)="handleProfileChange({ updateFlowLastRunStatus: $event })"
      />
      <p class="request-panel__hint">Write pass/fail back to linked test-suite flows after each run.</p>

      <tx-form-field label="Environment" controlId="rg-environment">
        <tx-dropdown
          id="rg-environment"
          ariaLabel="Environment"
          [options]="environmentOptions()"
          [ngModel]="profile().environmentId ?? ''"
          (ngModelChange)="handleProfileChange({ environmentId: $event || null })"
        />
      </tx-form-field>

      <h2 class="request-panel__title">Acceptance thresholds</h2>
      <p class="request-panel__hint">
        Minimum pass rate and optional SLO limits for a regression run to succeed.
      </p>

      <tx-form-field label="Acceptance %" controlId="rg-acceptance">
        <tx-slider
          id="rg-acceptance"
          [min]="0"
          [max]="100"
          [step]="1"
          [ngModel]="thresholds().acceptancePercent"
          (ngModelChange)="handleThresholdsChange({ acceptancePercent: toNumber($event, thresholds().acceptancePercent) })"
        />
        <span class="request-panel__hint">{{ thresholds().acceptancePercent }}% pass rate required</span>
      </tx-form-field>

      <tx-form-field label="Max failed flows" controlId="rg-max-failed">
        <tx-input
          id="rg-max-failed"
          type="number"
          [attr.min]="0"
          placeholder="Optional"
          [ngModel]="thresholds().maxFailedFlows ?? ''"
          (ngModelChange)="handleThresholdsChange({ maxFailedFlows: toOptionalInt($event) })"
        />
      </tx-form-field>

      <tx-form-field label="Max total duration (ms)" controlId="rg-max-duration">
        <tx-input
          id="rg-max-duration"
          type="number"
          [attr.min]="0"
          placeholder="Optional"
          [ngModel]="thresholds().maxTotalDurationMs ?? ''"
          (ngModelChange)="handleThresholdsChange({ maxTotalDurationMs: toOptionalInt($event) })"
        />
      </tx-form-field>

      <tx-form-field label="Max P95 flow duration (ms)" controlId="rg-max-p95">
        <tx-input
          id="rg-max-p95"
          type="number"
          [attr.min]="0"
          placeholder="Optional"
          [ngModel]="thresholds().maxP95FlowDurationMs ?? ''"
          (ngModelChange)="handleThresholdsChange({ maxP95FlowDurationMs: toOptionalInt($event) })"
        />
      </tx-form-field>

      <button
        type="button"
        class="rg-settings-advanced-toggle"
        [attr.aria-expanded]="advancedOpen()"
        (click)="advancedOpen.set(!advancedOpen())"
      >
        Advanced options
      </button>

      @if (advancedOpen()) {
        <div class="rg-settings-advanced">
          <tx-toggle
            label="Include step captures"
            [ngModel]="profile().includeStepCaptures"
            (ngModelChange)="handleProfileChange({ includeStepCaptures: $event })"
          />
          <tx-toggle
            label="Include step errors"
            [ngModel]="profile().includeStepErrors"
            (ngModelChange)="handleProfileChange({ includeStepErrors: $event })"
          />
        </div>
      }
    </div>
  `,
  styleUrl: './rg-tab-panels.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RgTabSettingsPanelComponent {
  protected readonly maxParallelism = REGRESSION_MAX_PARALLELISM;
  protected readonly advancedOpen = signal(false);

  readonly name = input('');
  readonly release = input('');
  readonly tags = input<readonly string[]>([]);
  readonly description = input('');
  readonly profile = input.required<RegressionProfile>();
  readonly thresholds = input.required<RegressionThresholds>();
  readonly environmentOptions = input<readonly TxDropdownOption[]>([]);
  readonly flowOptions = input<readonly TxDropdownOption[]>([]);

  readonly nameChange = output<string>();
  readonly releaseChange = output<string>();
  readonly tagsChange = output<readonly string[]>();
  readonly descriptionChange = output<string>();
  readonly profileChange = output<Partial<RegressionProfile>>();
  readonly thresholdsChange = output<Partial<RegressionThresholds>>();

  protected readonly executionModeOptions: readonly TxDropdownOption[] = [
    { value: 'sequential', label: 'Sequential' },
    { value: 'parallel', label: 'Parallel' },
  ];

  protected readonly runScopeOptions: readonly TxDropdownOption<RegressionRunScope>[] = [
    { value: 'all', label: 'All linked flows' },
    { value: 'selected', label: 'Selected flows only' },
    { value: 'failed-from-last', label: 'Failed from last run' },
  ];

  protected readonly bootstrapFlowOptions = computed((): readonly TxDropdownOption[] => [
    { value: '', label: 'None' },
    ...this.flowOptions(),
  ]);

  protected handleReuseE2e(enabled: boolean): void {
    this.profileChange.emit({
      reuseE2eSession: enabled,
      ...(enabled ? { executionMode: 'sequential' as const } : {}),
    });
  }

  /** Persists the all-at-once flag without tearing down sibling settings controls. */
  protected handleAllFlowsAtOnce(enabled: boolean): void {
    this.profileChange.emit({ allFlowsAtOnce: enabled === true });
  }

  protected handleProfileChange(patch: Partial<RegressionProfile>): void {
    this.profileChange.emit(patch);
  }

  protected handleThresholdsChange(patch: Partial<RegressionThresholds>): void {
    this.thresholdsChange.emit(patch);
  }

  protected toParallelism(value: unknown, fallback: number): number {
    return this.toBoundedInt(value, fallback, 1, REGRESSION_MAX_PARALLELISM);
  }

  protected toBoundedInt(value: unknown, fallback: number, min: number, max: number): number {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, parsed));
  }

  protected toOptionalInt(value: unknown): number | undefined {
    const raw = String(value ?? '').trim();
    if (!raw) {
      return undefined;
    }
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  }

  protected toNumber(value: unknown, fallback: number): number {
    const parsed = Number.parseFloat(String(value ?? ''));
    return Number.isFinite(parsed) ? parsed : fallback;
  }
}
