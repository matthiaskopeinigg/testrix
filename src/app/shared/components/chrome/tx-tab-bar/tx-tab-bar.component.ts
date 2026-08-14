import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import {
  WORKSPACE_TAB_DRAG_MIME,
  parseWorkspaceTabDragPayload,
  serializeWorkspaceTabDragPayload,
} from '@app/core/workspace/workspace-tab-drag';
import { WorkspaceTabDragService } from '@app/core/workspace/workspace-tab-drag.service';

import { TxTabComponent } from '../tx-tab/tx-tab.component';
import type { TxTabBarItem } from '../tx-tab/tx-tab.types';

export interface TxTabBarDropEvent {
  readonly tabId: string;
  readonly fromIndex: number;
  readonly toIndex: number;
}

export interface TxTabBarCrossDropEvent {
  readonly tabId: string;
  readonly fromGroupId: string;
  readonly fromIndex: number;
  readonly toIndex: number;
}

@Component({
  selector: 'tx-tab-bar',
  standalone: true,
  imports: [TxTabComponent],
  templateUrl: './tx-tab-bar.component.html',
  styleUrl: './tx-tab-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tx-tab-bar-host',
    '[class.tx-tab-bar-host--drag-over]': 'dragOver()',
    '(dragover)': 'handleDragOver($event)',
    '(dragleave)': 'handleDragLeave($event)',
    '(drop)': 'handleDrop($event)',
  },
})
export class TxTabBarComponent {
  private readonly tabDrag = inject(WorkspaceTabDragService);

  readonly tabs = input.required<readonly TxTabBarItem[]>();
  readonly groupId = input<string>('default');
  readonly ariaLabel = input('Editor tabs');

  readonly tabActivate = output<string>();
  readonly tabClose = output<string>();
  readonly tabPinToggle = output<string>();
  readonly tabReorder = output<TxTabBarDropEvent>();
  readonly tabCrossDrop = output<TxTabBarCrossDropEvent>();
  readonly tabContextMenu = output<{ readonly tabId: string; readonly event: MouseEvent }>();
  readonly barContextMenu = output<MouseEvent>();

  private readonly scrollEl = viewChild<ElementRef<HTMLElement>>('scrollRegion');

  protected readonly dragOver = signal(false);
  protected readonly dragIndex = signal<number | null>(null);

  private dragTabId: string | null = null;
  private dragFromIndex: number | null = null;

  protected handleTabActivate(tabId: string): void {
    this.tabActivate.emit(tabId);
  }

  protected handleTabClose(tabId: string): void {
    this.tabClose.emit(tabId);
  }

  protected handleTabPinToggle(tabId: string): void {
    this.tabPinToggle.emit(tabId);
  }

  protected handleTabContextMenu(tabId: string, event: MouseEvent): void {
    this.tabContextMenu.emit({ tabId, event });
  }

  protected handleBarContextMenu(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.tx-tab-host')) {
      return;
    }
    event.preventDefault();
    this.barContextMenu.emit(event);
  }

  protected handleDragStart(event: DragEvent, index: number, tabId: string): void {
    this.dragTabId = tabId;
    this.dragFromIndex = index;
    this.dragIndex.set(index);
    const payload = { tabId, fromGroupId: this.groupId(), fromIndex: index };
    this.tabDrag.begin(payload);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData(WORKSPACE_TAB_DRAG_MIME, serializeWorkspaceTabDragPayload(payload));
    }
  }

  protected handleDragEnd(): void {
    this.tabDrag.end();
    this.dragTabId = null;
    this.dragFromIndex = null;
    this.dragIndex.set(null);
    this.dragOver.set(false);
  }

  protected handleDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.dragOver.set(true);
  }

  protected handleDragLeave(event: DragEvent): void {
    const related = event.relatedTarget as Node | null;
    if (related && this.scrollEl()?.nativeElement.contains(related)) {
      return;
    }
    this.dragOver.set(false);
  }

  protected handleDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);

    const raw = event.dataTransfer?.getData(WORKSPACE_TAB_DRAG_MIME);
    if (!raw) {
      return;
    }

    const payload = parseWorkspaceTabDragPayload(raw);
    if (!payload) {
      return;
    }

    const toIndex = this.resolveDropIndex(event);
    if (toIndex === null) {
      return;
    }

    if (payload.fromGroupId === this.groupId()) {
      if (payload.fromIndex !== toIndex) {
        this.tabReorder.emit({
          tabId: payload.tabId,
          fromIndex: payload.fromIndex,
          toIndex,
        });
      }
    } else {
      this.tabCrossDrop.emit({
        tabId: payload.tabId,
        fromGroupId: payload.fromGroupId,
        fromIndex: payload.fromIndex,
        toIndex,
      });
    }

    this.handleDragEnd();
  }

  private resolveDropIndex(event: DragEvent): number | null {
    const tabs = this.tabs();
    if (tabs.length === 0) {
      return 0;
    }

    const target = event.target as HTMLElement | null;
    const tabHost = target?.closest('.tx-tab-host');
    if (tabHost) {
      const id = tabHost.getAttribute('data-tab-id');
      const index = tabs.findIndex((t) => t.id === id);
      return index >= 0 ? index : tabs.length - 1;
    }

    return tabs.length;
  }
}
