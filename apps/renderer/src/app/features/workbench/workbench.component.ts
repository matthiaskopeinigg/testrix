import { type CdkDragDrop, type CdkDragEnter, DragDropModule } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { WelcomeComponent } from '../welcome/welcome.component';
import { DatabaseTabCloseService } from '../database/database-tab-close.service';
import { WorkbenchGroupComponent } from './workbench-group.component';
import {
  WORKBENCH_SPLIT_RIGHT_ID,
  WorkbenchStore,
  type WorkbenchTab,
} from './workbench.store';

@Component({
  selector: 'tx-workbench',
  standalone: true,
  imports: [DragDropModule, WelcomeComponent, WorkbenchGroupComponent],
  templateUrl: './workbench.component.html',
  styleUrl: './workbench.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkbenchComponent {
  readonly store = inject(WorkbenchStore);
  private readonly tabClose = inject(DatabaseTabCloseService);
  readonly splitRightId = WORKBENCH_SPLIT_RIGHT_ID;
  /** Bucket for the split drop list (tabs are never kept here). */
  readonly splitBucket: WorkbenchTab[] = [];
  readonly dragging = signal(false);

  readonly hasTabs = computed(() => this.store.hasTabs());
  readonly groups = computed(() => this.store.groups());
  readonly splitSizes = computed(() => this.store.splitSizes());
  readonly focusedGroupId = computed(() => this.store.focusedGroupId());
  readonly splitPreview = computed(() => this.store.splitPreview());
  readonly canSplit = computed(() => this.store.canSplitFromDrag());
  readonly splitPreviewTab = computed(() => {
    const preview = this.splitPreview();
    if (!preview) {
      return null;
    }
    const group =
      this.groups().find((item) => item.id === preview.fromGroupId) ?? this.groups()[0];
    return group?.tabs.find((tab) => tab.id === preview.tabId) ?? null;
  });

  private resizing = false;

  listId(groupId: string): string {
    return this.store.groupTablistId(groupId);
  }

  connectedTo(groupId: string): string[] {
    return this.store.connectedTablistIds(groupId);
  }

  handleSelect(groupId: string, tabId: string): void {
    this.store.activate(groupId, tabId);
  }

  handleClose(groupId: string, tabId: string): void {
    void this.tabClose.close(groupId, tabId);
  }

  handleReorder(groupId: string, event: { previousIndex: number; currentIndex: number }): void {
    this.store.reorderTab(groupId, event.previousIndex, event.currentIndex);
  }

  handleTransfer(
    event: {
      previousIndex: number;
      currentIndex: number;
      previousContainerId: string;
      containerId: string;
    },
  ): void {
    this.store.clearSplitPreview();

    if (event.containerId === WORKBENCH_SPLIT_RIGHT_ID) {
      const fromGroupId = event.previousContainerId.replace(/^workbench-tabs-/, '');
      const groups = this.store.groups();
      const from = groups.find((group) => group.id === fromGroupId) ?? groups[0];
      const tab = from?.tabs[event.previousIndex];
      if (tab) {
        this.store.moveTabToSplitRight(from.id, tab.id);
      }
      return;
    }

    const fromGroupId = event.previousContainerId.replace(/^workbench-tabs-/, '');
    const toGroupId = event.containerId.replace(/^workbench-tabs-/, '');
    this.store.moveTab(fromGroupId, toGroupId, event.previousIndex, event.currentIndex);
  }

  handleDragStart(): void {
    this.dragging.set(true);
  }

  handleDragEnd(): void {
    this.dragging.set(false);
    this.store.clearSplitPreview();
    this.store.clearTabDropCue();
    this.store.endTabDrag();
  }

  handleSplitEntered(event: CdkDragEnter<WorkbenchTab[]>): void {
    if (!this.canSplit()) {
      return;
    }
    const tab = event.item.data as unknown as WorkbenchTab | undefined;
    const group = this.store.groups()[0];
    if (!group || !tab?.id) {
      return;
    }
    const tabIndex = group.tabs.findIndex((item) => item.id === tab.id);
    if (tabIndex < 0) {
      return;
    }
    this.store.setSplitPreview({
      side: 'right',
      fromGroupId: group.id,
      tabId: tab.id,
      tabIndex,
    });
  }

  handleSplitExited(): void {
    this.store.clearSplitPreview();
  }

  handleSplitDrop(event: CdkDragDrop<WorkbenchTab[]>): void {
    this.dragging.set(false);
    this.store.clearSplitPreview();
    if (!event.isPointerOverContainer) {
      return;
    }
    const tab = event.item.data as unknown as WorkbenchTab | undefined;
    const fromGroupId = event.previousContainer.id.replace(/^workbench-tabs-/, '');
    if (tab?.id) {
      this.store.moveTabToSplitRight(fromGroupId, tab.id);
      return;
    }
    const from = this.store.groups().find((group) => group.id === fromGroupId);
    const fallback = from?.tabs[event.previousIndex];
    if (fallback) {
      this.store.moveTabToSplitRight(fromGroupId, fallback.id);
    }
  }

  handleFocusGroup(groupId: string): void {
    this.store.focusGroup(groupId);
  }

  handleResizeStart(event: PointerEvent): void {
    if (this.groups().length < 2) {
      return;
    }
    event.preventDefault();
    const sash = event.currentTarget;
    if (!(sash instanceof HTMLElement)) {
      return;
    }
    const shell = sash.parentElement;
    if (!shell) {
      return;
    }

    this.resizing = true;
    const rect = shell.getBoundingClientRect();
    const onMove = (moveEvent: PointerEvent): void => {
      if (!this.resizing) {
        return;
      }
      const ratio = (moveEvent.clientX - rect.left) / rect.width;
      const left = Math.min(0.75, Math.max(0.25, ratio));
      this.store.setSplitSizes([left, 1 - left]);
    };
    const onUp = (): void => {
      this.resizing = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  groupFlex(index: number): string {
    const sizes = this.splitSizes();
    const size = sizes[index] ?? 1 / Math.max(sizes.length, 1);
    return `${size} 1 0`;
  }
}
