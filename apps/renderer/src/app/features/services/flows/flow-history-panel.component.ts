import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import {
  flowDetailHasExchange,
  flowNodeLabel,
  type FlowGraphNode,
  type FlowRunEventDetail,
  type SessionFlowLastRun,
} from '@testrix/contracts';
import { TxEmptyStateComponent, TxHintComponent } from '@testrix/ui';

import { formatHistoryDateTime } from '../../history/history-display';

export interface FlowHistoryExchangeRequest {
  readonly stepId: string;
  readonly title: string;
  readonly detail: FlowRunEventDetail;
}

@Component({
  selector: 'tx-flow-history-panel',
  standalone: true,
  imports: [TxEmptyStateComponent, TxHintComponent],
  templateUrl: './flow-history-panel.component.html',
  styleUrl: './flow-history-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlowHistoryPanelComponent {
  readonly runs = input.required<readonly SessionFlowLastRun[]>();
  readonly nodes = input<readonly FlowGraphNode[]>([]);
  readonly scenarioName = input('');
  readonly running = input(false);
  readonly apply = output<SessionFlowLastRun>();
  readonly clear = output<void>();
  readonly openExchange = output<FlowHistoryExchangeRequest>();

  readonly expandedId = signal<string | null>(null);

  readonly hasRuns = computed(() => this.runs().length > 0);

  private readonly labelById = computed(() => {
    const map = new Map<string, string>();
    for (const node of this.nodes())
      map.set(node.id, flowNodeLabel(node));
    return map;
  });

  formatWhen(at: string): string {
    return formatHistoryDateTime(at);
  }

  tone(run: SessionFlowLastRun): 'ok' | 'err' | 'muted' {
    if (this.countStatus(run, 'error') > 0 || run.failed > 0)
      return 'err';
    if (this.countStatus(run, 'ok') > 0 || run.passed > 0)
      return 'ok';
    return 'muted';
  }

  summary(run: SessionFlowLastRun): string {
    const passed = run.passed || this.countStatus(run, 'ok');
    const failed = run.failed || this.countStatus(run, 'error');
    const skipped = run.skipped || this.countStatus(run, 'skipped');
    const cancelled = run.cancelled || this.countStatus(run, 'cancelled');
    const parts: string[] = [];
    if (passed)
      parts.push(`${passed} passed`);
    if (failed)
      parts.push(`${failed} failed`);
    if (skipped)
      parts.push(`${skipped} skipped`);
    if (cancelled)
      parts.push(`${cancelled} cancelled`);
    return parts.join(' · ') || 'No steps recorded';
  }

  stepEntries(
    run: SessionFlowLastRun,
  ): readonly {
    readonly id: string;
    readonly label: string;
    readonly status: string;
    readonly message: string;
    readonly hasExchange: boolean;
  }[] {
    const labels = this.labelById();
    const order = new Map(this.nodes().map((node, index) => [node.id, index]));
    return Object.entries(run.statuses ?? {})
      .map(([id, status]) => ({
        id,
        label: labels.get(id) ?? id,
        status,
        message: run.messages?.[id] ?? '',
        hasExchange: flowDetailHasExchange(run.exchanges?.[id] as FlowRunEventDetail | undefined),
      }))
      .sort((a, b) => {
        const ai = order.get(a.id);
        const bi = order.get(b.id);
        if (ai !== undefined && bi !== undefined)
          return ai - bi;
        if (ai !== undefined)
          return -1;
        if (bi !== undefined)
          return 1;
        return a.label.localeCompare(b.label);
      });
  }

  handleToggle(run: SessionFlowLastRun): void {
    this.expandedId.update((id) => (id === run.id ? null : run.id));
  }

  handleApply(run: SessionFlowLastRun): void {
    this.apply.emit(run);
  }

  handleOpenExchange(event: Event, run: SessionFlowLastRun, stepId: string, label: string): void {
    event.preventDefault();
    event.stopPropagation();
    const detail = run.exchanges?.[stepId] as FlowRunEventDetail | undefined;
    if (!detail || !flowDetailHasExchange(detail))
      return;
    this.openExchange.emit({
      stepId,
      title: `${label} · exchange`,
      detail,
    });
  }

  handleClear(): void {
    this.clear.emit();
  }

  private countStatus(run: SessionFlowLastRun, status: string): number {
    return Object.values(run.statuses ?? {}).filter((value) => value === status).length;
  }
}
