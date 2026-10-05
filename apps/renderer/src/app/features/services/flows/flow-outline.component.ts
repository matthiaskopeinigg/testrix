import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  buildFlowRunPlan,
  flowNodeDescriptor,
  flowNodeLabel,
  flowNodeSubtitle,
  isFlowContainerKind,
  type FlowGraphNode,
  type FlowScenario,
} from '@testrix/contracts';
import { TxHintComponent } from '@testrix/ui';

import type { FlowNodeStatus } from './flow-node-card.component';

interface OutlineRow {
  readonly node: FlowGraphNode;
  readonly depth: number;
  readonly order: number;
  readonly chip: string;
  readonly label: string;
  readonly subtitle: string;
  /** More than one node in the same wave means these run at the same time. */
  readonly parallel: boolean;
}

/**
 * Keyboard-reachable list of the graph in run order.
 * The canvas is pointer-first, so this stays the accessible path.
 */
@Component({
  selector: 'tx-flow-outline',
  standalone: true,
  imports: [TxHintComponent],
  templateUrl: './flow-outline.component.html',
  styleUrl: './flow-outline.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlowOutlineComponent {
  readonly scenario = input.required<Pick<FlowScenario, 'nodes' | 'edges'>>();
  readonly selectedIds = input<readonly string[]>([]);
  readonly statuses = input<Readonly<Record<string, FlowNodeStatus>>>({});

  readonly selected = output<string>();
  readonly menu = output<{ readonly id: string; readonly x: number; readonly y: number }>();

  readonly rows = computed(() => {
    const scenario = this.scenario();
    const out: OutlineRow[] = [];
    let counter = 1;

    const walk = (scopeId: string | null, depth: number): void => {
      const plan = buildFlowRunPlan(scenario, scopeId);
      const waveSize = new Map<number, number>();
      for (const step of plan.steps)
        waveSize.set(step.wave, (waveSize.get(step.wave) ?? 0) + 1);

      for (const step of plan.steps) {
        const node = scenario.nodes.find((item) => item.id === step.nodeId);
        if (!node)
          continue;
        out.push({
          node,
          depth,
          order: counter,
          chip: flowNodeDescriptor(node.kind).chip,
          label: flowNodeLabel(node),
          subtitle: flowNodeSubtitle(node),
          parallel: (waveSize.get(step.wave) ?? 0) > 1,
        });
        counter += 1;
        if (isFlowContainerKind(node.kind))
          walk(node.id, depth + 1);
      }

      for (const id of plan.blocked) {
        const node = scenario.nodes.find((item) => item.id === id);
        if (node)
          out.push({
            node,
            depth,
            order: 0,
            chip: flowNodeDescriptor(node.kind).chip,
            label: flowNodeLabel(node),
            subtitle: 'In a loop, never runs',
            parallel: false,
          });
      }
    };

    walk(null, 0);

    const listed = new Set(out.map((row) => row.node.id));
    for (const node of scenario.nodes) {
      if (listed.has(node.id))
        continue;
      const subtitle =
        node.kind === 'note'
          ? flowNodeSubtitle(node) || 'String'
          : node.enabled
            ? 'Not connected'
            : 'Disabled';
      out.push({
        node,
        depth: 0,
        order: 0,
        chip: flowNodeDescriptor(node.kind).chip,
        label: flowNodeLabel(node),
        subtitle,
        parallel: false,
      });
    }

    return out;
  });

  isSelected(id: string): boolean {
    return this.selectedIds().includes(id);
  }

  status(id: string): FlowNodeStatus | null {
    return this.statuses()[id] ?? null;
  }

  handleMenu(id: string, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.menu.emit({ id, x: event.clientX, y: event.clientY });
  }
}
