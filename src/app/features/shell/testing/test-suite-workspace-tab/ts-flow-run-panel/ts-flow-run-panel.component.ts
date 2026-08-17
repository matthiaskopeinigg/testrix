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
  findFlowRunChildByLogId,
  firstFailedFlowRunChildLogId,
  flattenEnabledFlowSteps,
  flowRunChildTreeHasFailed,
  formatFlowRunDuration,
  resolveFlowStepRunError,
  truncateFlowRunErrorInline,
  type FlowRunChildLog,
  type FlowRunNestedChildren,
  type TestSuiteFlow,
  type TestSuiteFlowStep,
  type TestSuiteStepStatus,
} from '@shared/testing';

import { TxBannerComponent } from '@app/shared/components/feedback/tx-banner/tx-banner.component';
import { TxCodeEditorComponent } from '@app/shared/components/editors/tx-code-editor/tx-code-editor.component';
import { TxIconComponent } from '@app/shared/components/forms/tx-icon/tx-icon.component';
import type { TxIconName } from '@app/shared/icons';
import { TxTagComponent } from '@app/shared/components/forms/tx-tag/tx-tag.component';

import { buildFlowRunProgress, buildFlowRunSummary } from '../flow-run-summary';
import {
  flattenVisibleFlowRunChildren,
  isFlowRunLogNodeExpanded,
} from '../flow-run-timeline';
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
  readonly depth: number;
  readonly hasChildren: boolean;
  readonly expanded: boolean;
  readonly isRootStep: boolean;
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
  readonly liveNestedChildren = input<FlowRunNestedChildren>({});
  readonly lastRunMessage = input<string | null>(null);
  readonly selectedStepId = input<string | null>(null);

  readonly stepSelect = output<string>();

  private readonly liveStepDurations = signal<Readonly<Record<string, number>>>({});
  private readonly stepRunStartedAt = new Map<string, number>();
  protected readonly detailsLogId = signal<string | null>(null);
  private readonly expandedLogIds = signal<ReadonlySet<string>>(new Set());
  private readonly collapsedLogIds = signal<ReadonlySet<string>>(new Set());

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
    const expandedIds = this.expandedLogIds();
    const collapsedIds = this.collapsedLogIds();
    const orderIndex = buildFlowStepRunOrderIndex(flow.nodes);
    const steps = flattenEnabledFlowSteps(flow.nodes);
    const rows: FlowRunTimelineRow[] = [];

    for (const step of steps) {
      const children = this.childrenForStep(step);
      const hasChildren = children.length > 0;
      const status = live[step.id] ?? step.lastRunStatus ?? 'never';
      const expanded =
        hasChildren &&
        isFlowRunLogNodeExpanded(
          step.id,
          status === 'running' || children.some(flowRunChildTreeHasFailed),
          expandedIds,
          collapsedIds,
        );
      rows.push(
        this.toRootTimelineRow(step, flow, status, liveErrors, runMessage, liveDurations, {
          index: orderIndex[step.id] ?? null,
          hasChildren,
          expanded,
        }),
      );
      if (expanded) {
        for (const child of flattenVisibleFlowRunChildren(
          children,
          step.id,
          1,
          expandedIds,
          collapsedIds,
        )) {
          rows.push(this.toNestedTimelineRow(child.log, child.logId, child.depth, child));
        }
      }
    }
    return rows;
  });

  protected readonly selectedStepDetails = computed(() => {
    const logId = this.detailsLogId() ?? this.selectedStepId();
    const flow = this.flow();
    if (!logId || !flow) {
      return null;
    }
    const rootStep = findFlowStepById(flow.nodes, logId);
    if (rootStep) {
      const status = this.liveStepStatuses()[logId] ?? rootStep.lastRunStatus ?? 'never';
      const durationMs = this.liveStepDurations()[logId] ?? rootStep.lastRunDurationMs;
      const details = buildFlowStepRunLogDetails(rootStep, flow, status, durationMs, {
        liveError: this.liveStepErrors()[logId],
        runMessage: this.lastRunMessage(),
      });
      return details.hasContent ? details : null;
    }

    const nested = this.findNestedLog(flow, logId);
    if (!nested) {
      return null;
    }
    const synthetic = childLogToStep(nested);
    const details = buildFlowStepRunLogDetails(synthetic, flow, nested.status, nested.durationMs, {
      liveError: nested.error,
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
          this.expandedLogIds.set(new Set());
          this.collapsedLogIds.set(new Set());
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

    effect(() => {
      const selected = this.selectedStepId();
      const running = this.running();
      untracked(() => {
        const flow = this.flow();
        if (!selected || !flow) {
          this.detailsLogId.set(selected);
          return;
        }
        if (running) {
          this.detailsLogId.set(selected);
          return;
        }
        const step = findFlowStepById(flow.nodes, selected);
        const children = this.liveNestedChildren()[selected] ?? step?.lastRunChildren ?? [];
        this.detailsLogId.set(firstFailedFlowRunChildLogId(children, selected) ?? selected);
      });
    });

    destroyRef.onDestroy(() => {
      this.stepRunStartedAt.clear();
    });
  }

  protected statusTag(status: TestSuiteStepStatus) {
    return flowStepStatusTag(status);
  }

  protected isRowSelected(rowId: string): boolean {
    return (this.detailsLogId() ?? this.selectedStepId()) === rowId;
  }

  protected handleRowClick(row: FlowRunTimelineRow): void {
    this.detailsLogId.set(row.id);
    if (row.isRootStep) {
      this.stepSelect.emit(row.id);
    }
  }

  protected handleToggleExpand(row: FlowRunTimelineRow, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (!row.hasChildren) {
      return;
    }
    const expanded = new Set(this.expandedLogIds());
    const collapsed = new Set(this.collapsedLogIds());
    if (row.expanded) {
      expanded.delete(row.id);
      collapsed.add(row.id);
    } else {
      collapsed.delete(row.id);
      expanded.add(row.id);
    }
    this.expandedLogIds.set(expanded);
    this.collapsedLogIds.set(collapsed);
  }

  private childrenForStep(step: TestSuiteFlowStep): readonly FlowRunChildLog[] {
    return this.liveNestedChildren()[step.id] ?? step.lastRunChildren ?? [];
  }

  private findNestedLog(flow: TestSuiteFlow, logId: string): FlowRunChildLog | null {
    for (const step of flattenEnabledFlowSteps(flow.nodes)) {
      const children = this.childrenForStep(step);
      const found = findFlowRunChildByLogId(children, logId, step.id);
      if (found) {
        return found;
      }
    }
    return null;
  }

  private toRootTimelineRow(
    step: TestSuiteFlowStep,
    flow: TestSuiteFlow,
    status: TestSuiteStepStatus,
    liveErrors: Readonly<Record<string, string>>,
    runMessage: string | null,
    liveDurations: Readonly<Record<string, number>>,
    options: { readonly index: number | null; readonly hasChildren: boolean; readonly expanded: boolean },
  ): FlowRunTimelineRow {
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
      subtitle: status === 'failed' && error ? truncateFlowRunErrorInline(error) : stepTypeLabel,
      status,
      index: options.index,
      icon: FLOW_STEP_ADD_ICONS[step.stepType],
      durationLabel,
      hasDetails: details.hasContent || options.hasChildren,
      errorLabel: error,
      depth: 0,
      hasChildren: options.hasChildren,
      expanded: options.expanded,
      isRootStep: true,
    };
  }

  private toNestedTimelineRow(
    child: FlowRunChildLog,
    logId: string,
    depth: number,
    visible: { readonly expanded: boolean; readonly hasChildren: boolean; readonly index: number },
  ): FlowRunTimelineRow {
    const stepTypeLabel =
      child.kind === 'flow'
        ? 'Triggered flow'
        : FLOW_STEP_GUIDED_TITLES[child.stepType ?? 'TRIGGER'];
    const error = child.status === 'failed' ? child.error?.trim() || null : null;
    const durationLabel =
      child.durationMs != null && child.durationMs >= 0 && ['passed', 'failed', 'skipped'].includes(child.status)
        ? formatFlowRunDuration(child.durationMs)
        : child.status === 'running'
          ? '…'
          : null;
    return {
      id: logId,
      name: child.name.trim() || stepTypeLabel,
      subtitle: child.status === 'failed' && error ? truncateFlowRunErrorInline(error) : stepTypeLabel,
      status: child.status,
      index: visible.index,
      icon: child.kind === 'flow' ? 'layers' : FLOW_STEP_ADD_ICONS[child.stepType ?? 'TRIGGER'],
      durationLabel,
      hasDetails: Boolean(error || child.lastRunCapture || durationLabel),
      errorLabel: error,
      depth,
      hasChildren: visible.hasChildren,
      expanded: visible.expanded,
      isRootStep: false,
    };
  }
}

/** Builds a synthetic step so nested run-log details can reuse the root formatter. */
function childLogToStep(child: FlowRunChildLog): TestSuiteFlowStep {
  return {
    id: child.id,
    type: 'step',
    name: child.name,
    parentId: null,
    stepType: child.stepType ?? 'TRIGGER',
    config: {},
    enabled: true,
    lastRunStatus: child.status,
    lastRunDurationMs: child.durationMs,
    lastRunCapture: child.lastRunCapture ?? null,
    error: child.error,
  };
}
