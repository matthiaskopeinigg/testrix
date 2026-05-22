import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import type { TestSuiteStepStatus } from '@shared/testing';

import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxTagComponent } from '@app/shared/components/tx-tag/tx-tag.component';
import type { TxTagVariant } from '@app/shared/components/tx-tag/tx-tag.component';
import { mergeTxTreeConfig } from '@app/shared/components/tx-tree/tx-tree.config';
import { TxTreeComponent } from '@app/shared/components/tx-tree/tx-tree.component';
import { TxTreeNodeTemplateDirective } from '@app/shared/components/tx-tree/tx-tree-node-template.directive';
import type { TxTreeRowContextMenuEvent } from '@app/shared/components/tx-tree/tx-tree.types';

import {
  flowStepStatusLabel,
  flowStepStatusTagVariant,
} from './flow-step-labels';
import {
  buildFlowStepRunOrderIndex,
  countEnabledFlowSteps,
} from './flow-step-run-order';
import {
  assignValidationLinkLanes,
  buildFlowValidationLinkGraphic,
  collectFlowValidationReferenceLinks,
  type FlowValidationLinkPath,
} from './flow-step-validation-tree-links';
import {
  toFlowStepTreeNodes,
  type FlowStepTreeMeta,
  type FlowStepTreeNode,
} from './test-suite-flow-tree.adapter';
import { flowStepCanDrop } from './test-suite-flow-tree.mutations';

@Component({
  selector: 'app-ts-flow-step-tree',
  standalone: true,
  imports: [
    TxTreeComponent,
    TxTreeNodeTemplateDirective,
    TxIconComponent,
    TxTagComponent,
  ],
  templateUrl: './ts-flow-step-tree.component.html',
  styleUrl: './ts-flow-step-tree.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TsFlowStepTreeComponent {
  private readonly treeScroll = viewChild<ElementRef<HTMLElement>>('treeScroll');
  private resizeObserver: ResizeObserver | null = null;
  private refreshFrame: number | null = null;

  readonly nodes = input.required<import('@shared/testing').TestSuiteFlowNode[]>();
  readonly selectedStepId = input<string | null>(null);
  readonly liveStepStatuses = input<Readonly<Record<string, TestSuiteStepStatus>>>({});

  readonly selectedStepIdChange = output<string | null>();
  readonly nodesChange = output<readonly FlowStepTreeNode[]>();
  readonly rowContextMenu = output<TxTreeRowContextMenuEvent>();

  protected readonly treeNodes = computed(() => toFlowStepTreeNodes(this.nodes()));

  protected readonly stepCount = computed(() => countEnabledFlowSteps(this.nodes()));

  protected readonly runOrderIndex = computed(() => buildFlowStepRunOrderIndex(this.nodes()));

  protected readonly validationLinks = computed(() =>
    collectFlowValidationReferenceLinks(this.nodes()),
  );

  protected readonly validationRefTargetIds = computed(() => {
    const ids = new Set<string>();
    for (const link of this.validationLinks()) {
      ids.add(link.refId);
    }
    return ids;
  });

  protected readonly linkPaths = signal<readonly FlowValidationLinkPath[]>([]);
  protected readonly linkLayerHeight = signal(0);
  protected readonly linkLayerWidth = signal(0);

  protected readonly selectionIds = computed(() => {
    const id = this.selectedStepId();
    return id ? [id] : [];
  });

  protected readonly treeConfig = computed(() => {
    const treeNodes = this.treeNodes();
    return mergeTxTreeConfig<FlowStepTreeMeta>({
      ariaLabel: 'Flow steps',
      selection: {
        canSelect: () => true,
      },
      drop: {
        canDrop: (ctx) => flowStepCanDrop(treeNodes, ctx),
      },
      sort: { foldersFirst: false, siblingSort: 'manual' },
    });
  });

  constructor() {
    afterNextRender(() => {
      this.bindLinkLayoutObserver();
      this.scheduleLinkRefresh();
    });

    effect(() => {
      this.nodes();
      this.treeNodes();
      this.validationLinks();
      this.selectedStepId();
      this.liveStepStatuses();
      this.scheduleLinkRefresh();
    });
  }

  protected rowIndex(row: { readonly node: FlowStepTreeNode }): number | null {
    return this.runOrderIndex()[row.node.id] ?? null;
  }

  protected effectiveStatus(row: { readonly node: FlowStepTreeNode }): TestSuiteStepStatus | undefined {
    const live = this.liveStepStatuses()[row.node.id];
    if (live) {
      return live;
    }
    const stored = row.node.data?.lastRunStatus;
    return stored as TestSuiteStepStatus | undefined;
  }

  protected statusTag(row: {
    readonly node: FlowStepTreeNode;
  }): { readonly variant: TxTagVariant; readonly label: string } | null {
    const status = this.effectiveStatus(row);
    if (!status || status === 'never') {
      return null;
    }
    return {
      variant: flowStepStatusTagVariant(status),
      label: flowStepStatusLabel(status),
    };
  }

  protected hasValidationReference(row: { readonly node: FlowStepTreeNode }): boolean {
    return Boolean(row.node.data?.refStepId);
  }

  protected isValidationRefTarget(row: { readonly node: FlowStepTreeNode }): boolean {
    return this.validationRefTargetIds().has(row.node.id);
  }

  protected isValidationLinkHighlighted(row: { readonly node: FlowStepTreeNode }): boolean {
    const selected = this.selectedStepId();
    if (!selected) {
      return false;
    }
    if (row.node.id === selected) {
      return this.hasValidationReference(row) || this.isValidationRefTarget(row);
    }
    return this.validationLinks().some(
      (link) =>
        (link.validationId === selected && link.refId === row.node.id) ||
        (link.refId === selected && link.validationId === row.node.id),
    );
  }

  protected handleNodeClick(event: { nodeId: string }): void {
    this.selectedStepIdChange.emit(event.nodeId);
  }

  protected handleTreeScroll(): void {
    this.scheduleLinkRefresh();
  }

  private bindLinkLayoutObserver(): void {
    const scrollEl = this.treeScroll()?.nativeElement;
    if (!scrollEl || typeof ResizeObserver === 'undefined') {
      return;
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => this.scheduleLinkRefresh());
    this.resizeObserver.observe(scrollEl);
    const canvasEl = scrollEl.querySelector('.ts-flow-step-tree__link-canvas');
    if (canvasEl) {
      this.resizeObserver.observe(canvasEl);
    }
  }

  private scheduleLinkRefresh(): void {
    if (this.refreshFrame != null) {
      cancelAnimationFrame(this.refreshFrame);
    }
    this.refreshFrame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.refreshFrame = null;
        this.refreshLinkPaths();
      });
    });
  }

  private refreshLinkPaths(): void {
    const scrollEl = this.treeScroll()?.nativeElement;
    const canvasEl = scrollEl?.querySelector('.ts-flow-step-tree__link-canvas') as HTMLElement | null;
    const treeEl = canvasEl?.querySelector('.tx-tree') as HTMLElement | null;
    const links = this.validationLinks();

    if (!canvasEl || !treeEl || links.length === 0) {
      this.linkPaths.set([]);
      this.linkLayerHeight.set(0);
      this.linkLayerWidth.set(0);
      return;
    }

    const paths: FlowValidationLinkPath[] = [];
    const stepOrder = new Map(this.treeNodes().map((node, index) => [node.id, index]));
    const lanes = assignValidationLinkLanes(links, stepOrder);
    const selected = this.selectedStepId();

    const anchors: {
      link: (typeof links)[number];
      ref: { x: number; y: number };
      validation: { x: number; y: number };
    }[] = [];

    for (const link of links) {
      const refHost = treeEl.querySelector(
        `[data-tx-tree-node-id="${cssEscape(link.refId)}"]`,
      ) as HTMLElement | null;
      const validationHost = treeEl.querySelector(
        `[data-tx-tree-node-id="${cssEscape(link.validationId)}"]`,
      ) as HTMLElement | null;
      if (!refHost || !validationHost) {
        continue;
      }

      const refAnchor = rowLinkAnchor(refHost, canvasEl);
      const validationAnchor = rowLinkAnchor(validationHost, canvasEl);
      anchors.push({ link, ref: refAnchor, validation: validationAnchor });
    }

    for (const { link, ref, validation } of anchors) {
      const highlighted =
        selected === link.validationId || selected === link.refId;
      paths.push(
        buildFlowValidationLinkGraphic(link.validationId, ref, validation, {
          lane: lanes.get(link.validationId) ?? 0,
          highlighted,
        }),
      );
    }

    this.linkPaths.set(paths);
    this.linkLayerHeight.set(Math.max(treeEl.offsetHeight, canvasEl.offsetHeight));
    this.linkLayerWidth.set(canvasEl.clientWidth);
  }
}

function rowLinkAnchor(host: HTMLElement, canvas: HTMLElement): { x: number; y: number } {
  const icon =
    (host.querySelector('.ts-flow-step-tree__type-icon') as HTMLElement | null) ??
    (host.querySelector('.ts-flow-step-tree__row') as HTMLElement | null) ??
    host;
  const iconRect = icon.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  return {
    x: iconRect.left - canvasRect.left,
    y: iconRect.top - canvasRect.top + iconRect.height / 2,
  };
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/"/g, '\\"');
}
