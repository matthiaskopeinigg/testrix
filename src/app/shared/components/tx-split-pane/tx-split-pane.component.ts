import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  TemplateRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import type { SplitLayoutLeaf, SplitLayoutNode } from '@shared/config';
import {
  WORKSPACE_SPLIT_MAX_RATIO,
  WORKSPACE_SPLIT_MIN_PANE_SIZE_PX,
  WORKSPACE_SPLIT_MIN_RATIO,
  clampWorkspaceSplitRatio,
} from '@shared/config';

import { WorkspaceEditorMotionService } from '@app/core/workspace/workspace-editor-motion.service';

export interface TxSplitPaneLeafContext {
  readonly groupId: string;
}

@Component({
  selector: 'tx-split-pane',
  standalone: true,
  imports: [NgTemplateOutlet, TxSplitPaneComponent],
  templateUrl: './tx-split-pane.component.html',
  styleUrl: './tx-split-pane.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxSplitPaneComponent {
  protected readonly motion = inject(WorkspaceEditorMotionService);

  readonly layout = input.required<SplitLayoutNode>();
  readonly leafTemplate = input.required<TemplateRef<{ $implicit: TxSplitPaneLeafContext }>>();
  readonly path = input<readonly number[]>([]);
  readonly minPaneSizePx = input(WORKSPACE_SPLIT_MIN_PANE_SIZE_PX);

  readonly ratioChange = output<{ readonly path: readonly number[]; readonly ratio: number }>();

  private readonly resizing = signal(false);

  protected readonly leafNode = computed(() => {
    const layout = this.layout();
    return layout.type === 'leaf' ? layout : null;
  });

  protected readonly splitNode = computed(() => {
    const layout = this.layout();
    return layout.type === 'split' ? layout : null;
  });

  protected leafOutletContext(leaf: SplitLayoutLeaf): { $implicit: TxSplitPaneLeafContext } {
    return { $implicit: { groupId: leaf.groupId } };
  }

  protected childPath(index: number): readonly number[] {
    return [...this.path(), index];
  }

  protected paneMotionClass(index: number): string | null {
    if (!this.motion.isEnabled()) {
      return null;
    }
    const split = this.splitNode();
    if (!split) {
      return null;
    }
    const child = index === 0 ? split.first : split.second;
    if (child.type === 'leaf' && this.motion.isPaneEntering(child.groupId)) {
      return 'tx-split-pane__pane--enter';
    }
    return null;
  }

  protected handleResizeStart(event: PointerEvent): void {
    event.preventDefault();
    this.resizing.set(true);
    const split = this.splitNode();
    if (!split) {
      return;
    }

    const start = split.direction === 'horizontal' ? event.clientX : event.clientY;
    const host = (event.currentTarget as HTMLElement).parentElement;
    if (!host) {
      return;
    }
    const rect = host.getBoundingClientRect();
    const total = split.direction === 'horizontal' ? rect.width : rect.height;
    const startRatio = split.ratio;

    const onMove = (e: PointerEvent): void => {
      const pos = split.direction === 'horizontal' ? e.clientX : e.clientY;
      const offset = pos - (split.direction === 'horizontal' ? rect.left : rect.top);
      let ratio = total > 0 ? offset / total : startRatio;
      ratio = clampWorkspaceSplitRatio(ratio);
      const minRatio = WORKSPACE_SPLIT_MIN_PANE_SIZE_PX / Math.max(total, 1);
      const maxRatio = 1 - minRatio;
      ratio = Math.min(maxRatio, Math.max(minRatio, ratio));
      this.ratioChange.emit({ path: this.path(), ratio });
    };

    const onUp = (): void => {
      this.resizing.set(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }
}
