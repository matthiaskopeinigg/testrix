import { afterNextRender, computed, inject, Injectable, Injector, NgZone, signal } from '@angular/core';
import {
  findEnvironmentLocation,
  isEnvironmentFolder,
  moveEnvironmentNode,
  moveEnvironmentNodes,
  type EnvironmentNode,
} from '@testrix/contracts';
import {
  applyScroll,
  computeScrollDelta,
  toTxRect,
  type TxDragEndReason,
  type TxPoint,
  type TxRect,
} from '@testrix/ui';

import { captureFlipPositions, playTreeFlip } from '../../collections/collections-tree-flip';
import { EnvironmentsStore } from '../../environments/environments.store';
import {
  collectDescendantIds,
  resolveEnvEditorDrop,
  type EnvEditorDragItem,
  type EnvEditorDropLayout,
  type EnvEditorDropTarget,
  type EnvMeasuredNodeRow,
} from './environment-editor-drop-model';

const EXPAND_HOVER_MS = 450;

@Injectable()
export class EnvironmentEditorDndService {
  private readonly environments = inject(EnvironmentsStore);
  private readonly injector = inject(Injector);
  private readonly zone = inject(NgZone);

  readonly dragItem = signal<EnvEditorDragItem | null>(null);
  readonly dragNode = signal<EnvironmentNode | null>(null);
  readonly dragIds = signal<readonly string[]>([]);
  readonly dropTarget = signal<EnvEditorDropTarget | null>(null);
  readonly lastMovedId = signal<string | null>(null);

  readonly isIndicatorVisible = computed(
    () => this.dropTarget()?.mode === 'between' && !this.dropTarget()?.denied,
  );
  readonly indicatorY = computed(() => {
    const target = this.dropTarget();
    const scroller = this.treeScroller;
    if (!target || !scroller) {
      return 0;
    }
    return target.y - scroller.getBoundingClientRect().top + scroller.scrollTop;
  });

  private envId: string | null = null;
  private host: HTMLElement | null = null;
  private treeScroller: HTMLElement | null = null;
  private getNodes: () => EnvironmentNode[] = () => [];
  private onExpand: (id: string) => void = () => undefined;
  private layout: EnvEditorDropLayout | null = null;
  private expandTimer: ReturnType<typeof setTimeout> | null = null;
  private expandFolderId: string | null = null;
  private lastPoint: TxPoint | null = null;
  private moveAnimTimer: ReturnType<typeof setTimeout> | null = null;

  register(options: {
    envId: string | null;
    host: HTMLElement | null;
    treeScroller: HTMLElement | null;
    getNodes: () => EnvironmentNode[];
    onExpand: (id: string) => void;
  }): void {
    this.envId = options.envId;
    this.host = options.host;
    this.treeScroller = options.treeScroller;
    this.getNodes = options.getNodes;
    this.onExpand = options.onExpand;
  }

  scrollContainer(): HTMLElement | null {
    return this.treeScroller;
  }

  begin(node: EnvironmentNode, parentId: string | null, ids: readonly string[] = [node.id]): void {
    const location = findEnvironmentLocation(this.getNodes(), node.id);
    this.dragNode.set(node);
    this.dragIds.set(ids.length > 0 ? ids : [node.id]);
    this.dragItem.set({
      id: node.id,
      kind: isEnvironmentFolder(node) ? 'folder' : 'variable',
      parentId: location?.parentId ?? parentId,
      mixedIndex: location?.index ?? 0,
    });
    this.dropTarget.set(null);
    this.lastPoint = null;
    this.layout = this.measure();
  }

  move(point: TxPoint): void {
    const dragged = this.dragItem();
    if (!dragged) {
      return;
    }
    this.lastPoint = point;
    this.autoscroll(point);
    this.layout = this.measure();
    if (!this.layout) {
      return;
    }
    const nodes = this.getNodes();
    const target = resolveEnvEditorDrop(this.layout, point, dragged, this.movingDescendantIds(nodes));
    if (target) {
      this.dropTarget.set(target);
      this.scheduleExpand(target);
    }
  }

  end(reason: TxDragEndReason, releaseRect: TxRect | null): string | null {
    this.clearExpandHover();
    this.layout = null;
    this.lastPoint = null;
    if (reason === 'cancel') {
      this.dragItem.set(null);
      this.dragNode.set(null);
      this.dragIds.set([]);
      this.dropTarget.set(null);
      return null;
    }

    const host = this.host;
    const dragged = this.dragItem();
    const first = host
      ? captureFlipPositions(host, { previewRect: this.clampToHost(releaseRect), draggedId: dragged?.id ?? null })
      : null;

    let movedId: string | null = null;
    this.zone.run(() => {
      movedId = this.commit();
    });

    if (!host || !first || !movedId) {
      return movedId;
    }

    afterNextRender(
      () => {
        requestAnimationFrame(() => playTreeFlip(host, first, movedId));
      },
      { injector: this.injector },
    );
    return movedId;
  }

  isDropFolder(id: string): boolean {
    const target = this.dropTarget();
    return !!target && target.mode === 'into' && target.folderId === id && !target.denied;
  }

  isJustMoved(id: string): boolean {
    return this.lastMovedId() === id;
  }

  private commit(): string | null {
    const envId = this.envId;
    const dragged = this.dragItem();
    const target = this.dropTarget();
    const ids = this.dragIds().length > 0 ? this.dragIds() : dragged ? [dragged.id] : [];
    this.dragItem.set(null);
    this.dragNode.set(null);
    this.dragIds.set([]);
    this.dropTarget.set(null);
    if (!envId || !dragged || !target || target.denied || ids.length === 0) {
      return null;
    }

    const nodes = this.getNodes();
    const next =
      ids.length > 1
        ? moveEnvironmentNodes(nodes, ids, target.parentId, target.index)
        : moveEnvironmentNode(nodes, dragged.id, target.parentId, target.index);
    if (!next) {
      return null;
    }

    this.environments.setVariables(envId, next);
    this.markMoved(dragged.id);
    return dragged.id;
  }

  private movingDescendantIds(nodes: readonly EnvironmentNode[]): Set<string> {
    const ids = this.dragIds();
    const denied = new Set<string>();
    for (const id of ids) {
      const location = findEnvironmentLocation(nodes, id);
      if (!location || !isEnvironmentFolder(location.node)) {
        continue;
      }
      denied.add(id);
      for (const descendant of collectDescendantIds(nodes, id)) {
        denied.add(descendant);
      }
    }
    return denied;
  }

  private measure(): EnvEditorDropLayout | null {
    const tree = this.treeScroller;
    if (!tree) {
      return null;
    }

    const treeBox = tree.getBoundingClientRect();
    const rows: EnvMeasuredNodeRow[] = [];
    tree.querySelectorAll('[data-env-node-id]').forEach((element) => {
      if (!(element instanceof HTMLElement) || !element.dataset['envNodeId']) {
        return;
      }
      const id = element.dataset['envNodeId'];
      const location = findEnvironmentLocation(this.getNodes(), id);
      if (!location) {
        return;
      }
      const box = element.getBoundingClientRect();
      const folder = isEnvironmentFolder(location.node);
      rows.push({
        id,
        kind: folder ? 'folder' : 'variable',
        parentId: location.parentId,
        mixedIndex: location.index,
        folderIndex: location.siblings.slice(0, location.index).filter((node) => isEnvironmentFolder(node)).length,
        depth: Number(element.dataset['envDepth'] ?? '0'),
        collapsed: folder ? location.node.collapsed : false,
        childCount: folder ? location.node.children.length : 0,
        top: box.top,
        height: box.height,
        left: box.left,
      });
    });

    return {
      rows,
      tree: { left: treeBox.left, right: treeBox.right, top: treeBox.top, bottom: treeBox.bottom },
    };
  }

  private autoscroll(point: TxPoint): void {
    const scroller = this.treeScroller;
    if (!scroller) {
      return;
    }
    const box = scroller.getBoundingClientRect();
    if (point.x < box.left || point.x > box.right || point.y < box.top || point.y > box.bottom) {
      return;
    }
    const delta = computeScrollDelta(toTxRect(box), point.y);
    if (delta !== 0) {
      applyScroll(scroller, delta);
      this.layout = this.measure();
    }
  }

  private scheduleExpand(target: EnvEditorDropTarget | null): void {
    const folderId = target?.mode === 'into' ? target.folderId : null;
    if (!folderId) {
      this.clearExpandHover();
      return;
    }
    const folder = findEnvironmentLocation(this.getNodes(), folderId);
    if (!folder || !isEnvironmentFolder(folder.node) || !folder.node.collapsed) {
      this.clearExpandHover();
      return;
    }
    if (this.expandFolderId === folderId) {
      return;
    }
    this.clearExpandHover();
    this.expandFolderId = folderId;
    this.expandTimer = setTimeout(() => {
      this.expandTimer = null;
      this.onExpand(folderId);
      afterNextRender(
        () => {
          this.layout = this.measure();
          if (this.lastPoint) {
            this.move(this.lastPoint);
          }
        },
        { injector: this.injector },
      );
    }, EXPAND_HOVER_MS);
  }

  private clearExpandHover(): void {
    if (this.expandTimer) {
      clearTimeout(this.expandTimer);
      this.expandTimer = null;
    }
    this.expandFolderId = null;
  }

  private clampToHost(rect: TxRect | null): TxRect | null {
    const host = this.host?.getBoundingClientRect();
    if (!rect || !host) {
      return rect;
    }
    const maxLeft = Math.max(host.left, host.right - rect.width);
    return { ...rect, left: Math.min(Math.max(rect.left, host.left), maxLeft) };
  }

  private markMoved(id: string): void {
    if (this.moveAnimTimer) {
      clearTimeout(this.moveAnimTimer);
      this.moveAnimTimer = null;
    }
    this.lastMovedId.set(null);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.lastMovedId.set(id);
        this.moveAnimTimer = setTimeout(() => {
          if (this.lastMovedId() === id) {
            this.lastMovedId.set(null);
          }
          this.moveAnimTimer = null;
        }, 300);
      });
    });
  }
}
