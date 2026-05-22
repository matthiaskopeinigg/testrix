import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';

import {
  buildFlowStepRunLogDetails,
  findFlowStepById,
  flattenEnabledFlowSteps,
  formatFlowRunDuration,
  resolveFlowStepRunError,
  truncateFlowRunErrorInline,
  type TestSuiteFlow,
  type TestSuiteStepStatus,
} from '@shared/testing';

import { TxBannerComponent } from '@app/shared/components/tx-banner/tx-banner.component';
import { TxCodeEditorComponent } from '@app/shared/components/tx-code-editor/tx-code-editor.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import type { TxIconName } from '@app/shared/icons';
import { TxTagComponent } from '@app/shared/components/tx-tag/tx-tag.component';

import { buildFlowRunProgress, buildFlowRunSummary } from '../flow-run-summary';
import {
  FLOW_STEP_ADD_ICONS,
  FLOW_STEP_GUIDED_TITLES,
  flowStepStatusTag,
} from '../flow-step-labels';
import { buildFlowStepRunOrderIndex } from '../flow-step-run-order';

export interface FlowRunTimelineRow {
  readonly id: string;
  readonly name: string;
  readonly subtitle: string;
  readonly status: TestSuiteStepStatus;
  readonly index: number | null;
  readonly icon: TxIconName;
  readonly durationLabel: string | null;
  readonly hasDetails: boolean;
  readonly errorLabel: string | null;
}

@Component({
  selector: 'app-ts-flow-run-panel',
  standalone: true,
  imports: [TxBannerComponent, TxCodeEditorComponent, TxIconComponent, TxTagComponent],
  templateUrl: './ts-flow-run-panel.component.html',
  styleUrl: './ts-flow-run-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TsFlowRunPanelComponent {
  readonly flow = input<TestSuiteFlow | null>(null);
  readonly running = input(false);
  readonly liveStepStatuses = input<Readonly<Record<string, TestSuiteStepStatus>>>({});
  readonly liveStepErrors = input<Readonly<Record<string, string>>>({});
  readonly lastRunMessage = input<string | null>(null);
  readonly selectedStepId = input<string | null>(null);

  readonly stepSelect = output<string>();

  private readonly liveStepDurations = signal<Readonly<Record<string, number>>>({});
  private readonly stepRunStartedAt = new Map<string, number>();

  protected readonly summary = computed(() => {
    const flow = this.flow();
    return flow ? buildFlowRunSummary(flow) : null;
  });

  protected readonly showIdleEmpty = computed(() => {
    const flow = this.flow();
    if (!flow || this.running()) {
      return false;
    }
    return !flow.lastRunAt && Object.keys(this.liveStepStatuses()).length === 0;
  });

  protected readonly progress = computed(() => {
    const flow = this.flow();
    if (!flow) {
      return null;
    }
    return buildFlowRunProgress(flow.nodes, this.liveStepStatuses());
  });

  protected readonly timelineRows = computed((): readonly FlowRunTimelineRow[] => {
    const flow = this.flow();
    if (!flow) {
      return [];
    }

    const live = this.liveStepStatuses();
    const liveErrors = this.liveStepErrors();
    const runMessage = this.lastRunMessage();
    const liveDurations = this.liveStepDurations();
    const orderIndex = buildFlowStepRunOrderIndex(flow.nodes);
    const steps = flattenEnabledFlowSteps(flow.nodes);
    return steps.map((step) => {
      const status = live[step.id] ?? step.lastRunStatus ?? 'never';
      const trimmed = step.name.trim();
      const durationMs = liveDurations[step.id] ?? step.lastRunDurationMs;
      const durationLabel =
        durationMs != null && durationMs >= 0 && ['passed', 'failed', 'skipped'].includes(status)
          ? formatFlowRunDuration(durationMs)
          : status === 'running'
            ? '…'
            : null;
      const error = resolveFlowStepRunError(step, status, {
        liveError: liveErrors[step.id],
        runMessage,
      });
      const details = buildFlowStepRunLogDetails(step, flow, status, durationMs, {
        liveError: liveErrors[step.id],
        runMessage,
      });
      const stepTypeLabel = FLOW_STEP_GUIDED_TITLES[step.stepType];
      return {
        id: step.id,
        name: trimmed.length > 0 ? trimmed : stepTypeLabel,
        subtitle:
          status === 'failed' && error
            ? truncateFlowRunErrorInline(error)
            : stepTypeLabel,
        status,
        index: orderIndex[step.id] ?? null,
        icon: FLOW_STEP_ADD_ICONS[step.stepType],
        durationLabel,
        hasDetails: details.hasContent,
        errorLabel: error,
      };
    });
  });

  protected readonly selectedStepDetails = computed(() => {
    const stepId = this.selectedStepId();
    const flow = this.flow();
    if (!stepId || !flow) {
      return null;
    }
    const step = findFlowStepById(flow.nodes, stepId);
    if (!step) {
      return null;
    }
    const status = this.liveStepStatuses()[stepId] ?? step.lastRunStatus ?? 'never';
    const durationMs = this.liveStepDurations()[stepId] ?? step.lastRunDurationMs;
    const details = buildFlowStepRunLogDetails(step, flow, status, durationMs, {
      liveError: this.liveStepErrors()[stepId],
      runMessage: this.lastRunMessage(),
    });
    return details.hasContent ? details : null;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    let prevRunning = false;

    effect(() => {
      const running = this.running();
      const live = this.liveStepStatuses();
      const now = Date.now();

      if (running && !prevRunning) {
        untracked(() => {
          this.stepRunStartedAt.clear();
          this.liveStepDurations.set({});
        });
      }
      prevRunning = running;

      if (!running && Object.keys(live).length === 0) {
        return;
      }

      untracked(() => {
        const durations = { ...this.liveStepDurations() };
        let changed = false;

        for (const [id, status] of Object.entries(live)) {
          if (status === 'running' && !this.stepRunStartedAt.has(id)) {
            this.stepRunStartedAt.set(id, now);
          }
          if (
            ['passed', 'failed', 'skipped'].includes(status) &&
            this.stepRunStartedAt.has(id) &&
            durations[id] == null
          ) {
            durations[id] = now - this.stepRunStartedAt.get(id)!;
            this.stepRunStartedAt.delete(id);
            changed = true;
          }
        }

        if (changed) {
          this.liveStepDurations.set(durations);
        }
      });
    });

    destroyRef.onDestroy(() => {
      this.stepRunStartedAt.clear();
    });
  }

  protected statusTag(status: TestSuiteStepStatus) {
    return flowStepStatusTag(status);
  }

  protected handleRowClick(stepId: string): void {
    this.stepSelect.emit(stepId);
  }
}
