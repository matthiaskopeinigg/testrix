import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  flowDetailHasExchange,
  flowNodeDescriptor,
  flowNodeLabel,
  flowNodeSubtitle,
  isFlowContainerKind,
  isFlowFrameKind,
  isFlowTerminalKind,
  type FlowGraphNode,
  type FlowRunEventDetail,
} from '@testrix/contracts';
import { TxHintComponent } from '@testrix/ui';

import type { FlowLayoutNode } from './flow-graph-layout';

export type FlowNodeStatus = 'waiting' | 'running' | 'ok' | 'error' | 'skipped' | 'cancelled';

export type FlowFrameResizeCorner = 'se';

export interface FlowFrameResizeStart {
  readonly id: string;
  readonly corner: FlowFrameResizeCorner;
  readonly width: number;
  readonly height: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly pointerId: number;
}

@Component({
  selector: 'tx-flow-node-card',
  standalone: true,
  imports: [TxHintComponent],
  templateUrl: './flow-node-card.component.html',
  styleUrl: './flow-node-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlowNodeCardComponent {
  readonly node = input.required<FlowGraphNode>();
  readonly placement = input.required<FlowLayoutNode>();
  readonly selected = input(false);
  /** Roving tabindex target among node cards. */
  readonly active = input(false);
  readonly tabIndex = computed(() => (this.active() ? 0 : -1));
  readonly order = input(0);
  readonly status = input<FlowNodeStatus | null>(null);
  readonly errorMessage = input('');
  readonly statusMessage = input('');
  readonly pulse = input(0);
  readonly exchange = input<FlowRunEventDetail | null>(null);

  readonly resizeStart = output<FlowFrameResizeStart>();
  readonly viewExchange = output<string>();

  readonly descriptor = computed(() => flowNodeDescriptor(this.node().kind));
  readonly label = computed(() => flowNodeLabel(this.node()));
  readonly subtitle = computed(() => flowNodeSubtitle(this.node()));
  readonly isContainer = computed(() => isFlowContainerKind(this.node().kind));
  readonly isFrame = computed(() => isFlowFrameKind(this.node().kind));
  readonly isNote = computed(() => this.node().kind === 'note');
  readonly isTerminal = computed(() => isFlowTerminalKind(this.node().kind));
  readonly isStart = computed(() => this.node().kind === 'start');
  readonly isEnd = computed(() => this.node().kind === 'end');
  readonly hasExchange = computed(() => flowDetailHasExchange(this.exchange()));

  readonly statusLabel = computed(() => {
    switch (this.status()) {
      case 'waiting':
        return 'Waiting';
      case 'running':
        return this.statusMessage().trim() || 'Running';
      case 'ok':
        return 'Passed';
      case 'error':
        return 'Failed';
      case 'skipped':
        return 'Skipped';
      case 'cancelled':
        return 'Cancelled';
      default:
        return null;
    }
  });

  handleResizePointerDown(event: PointerEvent, corner: FlowFrameResizeCorner): void {
    event.preventDefault();
    event.stopPropagation();
    this.resizeStart.emit({
      id: this.node().id,
      corner,
      width: this.placement().width,
      height: this.placement().height,
      clientX: event.clientX,
      clientY: event.clientY,
      pointerId: event.pointerId,
    });
  }

  handleViewExchange(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.viewExchange.emit(this.node().id);
  }
}
