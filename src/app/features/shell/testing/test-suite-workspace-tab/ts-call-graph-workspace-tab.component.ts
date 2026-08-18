import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  collectTriggerCallGraph,
  testSuiteTabResourceId,
  type TriggerGraphEdge,
  type TriggerGraphNode,
} from '@shared/testing';

import { TestSuiteService } from '@app/core/testing/test-suite.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import { TxBannerComponent } from '@app/shared/components/feedback/tx-banner/tx-banner.component';
import { TestingWorkspaceTabShellComponent } from '../testing-workspace-tab-shell/testing-workspace-tab-shell.component';

const NODE_WIDTH = 160;
const NODE_HEIGHT = 40;
const LAYER_GAP = 220;
const ROW_GAP = 72;
const PAD = 28;

interface CallGraphLayoutNode extends TriggerGraphNode {
  readonly x: number;
  readonly y: number;
}

interface CallGraphLayoutEdge extends TriggerGraphEdge {
  readonly d: string;
}

/** Suite-level TRIGGER call graph (flows as nodes, left-to-right layers). */
@Component({
  selector: 'app-ts-call-graph-workspace-tab',
  standalone: true,
  imports: [TestingWorkspaceTabShellComponent, TxBannerComponent],
  templateUrl: './ts-call-graph-workspace-tab.component.html',
  styleUrl: './ts-call-graph-workspace-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'testing-workspace-tab-host' },
})
export class TsCallGraphWorkspaceTabComponent {
  private readonly testSuite = inject(TestSuiteService);
  private readonly workspaceEditor = inject(WorkspaceEditorService);

  protected readonly graph = computed(() => collectTriggerCallGraph(this.testSuite.flows()));

  protected readonly layoutNodes = computed((): readonly CallGraphLayoutNode[] =>
    this.graph().nodes.map((node) => ({
      ...node,
      x: PAD + node.layer * LAYER_GAP,
      y: PAD + node.indexInLayer * ROW_GAP,
    })),
  );

  protected readonly layoutEdges = computed((): readonly CallGraphLayoutEdge[] => {
    const byId = new Map(this.layoutNodes().map((node) => [node.flowId, node]));
    return this.graph().edges.map((edge) => {
      const from = byId.get(edge.fromFlowId);
      const to = byId.get(edge.toFlowId);
      if (!from || !to) {
        return { ...edge, d: '' };
      }
      return { ...edge, d: elbow(from, to) };
    });
  });

  protected readonly viewBox = computed(() => {
    const nodes = this.layoutNodes();
    if (nodes.length === 0) {
      return '0 0 400 200';
    }
    const maxX = Math.max(...nodes.map((node) => node.x)) + NODE_WIDTH + PAD;
    const maxY = Math.max(...nodes.map((node) => node.y)) + NODE_HEIGHT + PAD;
    return `0 0 ${Math.max(maxX, 400)} ${Math.max(maxY, 200)}`;
  });

  protected handleNodeClick(flowId: string): void {
    this.workspaceEditor.openResource({
      resourceId: testSuiteTabResourceId('flow', flowId),
      kind: 'test-suite',
    });
  }
}

function elbow(from: CallGraphLayoutNode, to: CallGraphLayoutNode): string {
  const x1 = from.x + NODE_WIDTH;
  const y1 = from.y + NODE_HEIGHT / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_HEIGHT / 2;
  const mid = x1 + (x2 - x1) / 2;
  return `M ${x1} ${y1} L ${mid} ${y1} L ${mid} ${y2} L ${x2} ${y2}`;
}
