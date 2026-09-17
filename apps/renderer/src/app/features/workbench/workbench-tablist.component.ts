import { CDK_DRAG_CONFIG, CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { GlobalPositionStrategy, Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  ViewContainerRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
  type TemplateRef,
} from '@angular/core';
import { playLeaveThen } from '@testrix/ui';

import { DatabaseTabCloseService } from '../database/database-tab-close.service';
import { ToolIconComponent } from '../tools/tool-icon.component';
import { WorkbenchStore, type WorkbenchTab } from './workbench.store';
import { WorkbenchTabComponent, httpMethodLabel } from './workbench-tab.component';

@Component({
  selector: 'tx-workbench-tablist',
  standalone: true,
  imports: [DragDropModule, ToolIconComponent, WorkbenchTabComponent],
  templateUrl: './workbench-tablist.component.html',
  styleUrl: './workbench-tablist.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: CDK_DRAG_CONFIG,
      useValue: {
        dragStartThreshold: 6,
        zIndex: 1000,
      },
    },
  ],
})
export class WorkbenchTablistComponent {
  private readonly host = inject(ElementRef);
  private readonly store = inject(WorkbenchStore);
  private readonly tabClose = inject(DatabaseTabCloseService);
  private readonly overlay = inject(Overlay);
  private readonly vcr = inject(ViewContainerRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly menuTemplate = viewChild.required<TemplateRef<unknown>>('tabMenu');

  readonly groupId = input.required<string>();
  readonly listId = input.required<string>();
  readonly connectedTo = input<string[]>([]);
  readonly tabs = input.required<readonly WorkbenchTab[]>();
  readonly activeTabId = input<string | null>(null);
  readonly justOpenedId = input<string | null>(null);
  readonly focused = input(false);

  readonly select = output<string>();
  readonly close = output<string>();
  readonly reorder = output<{ previousIndex: number; currentIndex: number }>();
  readonly transfer = output<{
    previousIndex: number;
    currentIndex: number;
    previousContainerId: string;
    containerId: string;
  }>();
  readonly focusGroup = output<void>();
  readonly dragStart = output<void>();
  readonly dragEnd = output<void>();

  readonly menuTab = signal<WorkbenchTab | null>(null);
  readonly canCloseOthers = computed(() => this.tabs().length > 1);
  readonly canCloseAll = computed(() => this.tabs().length > 1);
  readonly canCloseToTheRight = computed(() => {
    const tab = this.menuTab();
    if (!tab) {
      return false;
    }
    const tabs = this.tabs();
    const index = tabs.findIndex((item) => item.id === tab.id);
    return index >= 0 && index < tabs.length - 1;
  });

  /** Stable mutable array reference for CDK (avoid reallocating mid-drag). */
  readonly dropData = computed(() => this.tabs() as WorkbenchTab[]);

  private overlayRef: OverlayRef | null = null;
  private menuCloseToken = 0;

  constructor() {
    this.destroyRef.onDestroy(() => this.closeMenu(true));
  }

  handleSelect(event: { readonly tabId: string; readonly event: MouseEvent | KeyboardEvent }): void {
    this.focusGroup.emit();
    const result = this.store.applyTabPointerSelect(this.groupId(), event.tabId, event.event);
    if (result.shouldActivate) {
      this.select.emit(event.tabId);
    }
  }

  handleClose(tabId: string): void {
    this.close.emit(tabId);
  }

  handleTabMenu(event: { readonly tabId: string; readonly event: MouseEvent }): void {
    const tab = this.tabs().find((item) => item.id === event.tabId);
    if (!tab) {
      return;
    }
    this.openMenu(event.event, tab);
  }

  handleMenuClose(): void {
    const tab = this.menuTab();
    this.closeMenu(true);
    if (tab) {
      this.close.emit(tab.id);
    }
  }

  handleMenuCloseOthers(): void {
    const tab = this.menuTab();
    this.closeMenu(true);
    if (tab) {
      void this.tabClose.closeOthers(this.groupId(), tab.id);
    }
  }

  handleMenuCloseToTheRight(): void {
    const tab = this.menuTab();
    this.closeMenu(true);
    if (tab) {
      void this.tabClose.closeToTheRight(this.groupId(), tab.id);
    }
  }

  handleMenuCloseAll(): void {
    this.closeMenu(true);
    void this.tabClose.closeAllInGroup(this.groupId());
  }

  handleDragStarted(tab: WorkbenchTab): void {
    this.closeMenu(true);
    this.store.beginTabDrag(this.groupId(), tab.id);
    this.dragStart.emit();
  }

  handleDragEnded(): void {
    this.store.endTabDrag();
    this.dragEnd.emit();
  }

  methodLabel(tab: WorkbenchTab): string {
    return httpMethodLabel(tab.method);
  }

  isSelected(tabId: string): boolean {
    return this.store.isTabSelected(this.groupId(), tabId);
  }

  dragCount(): number {
    return this.store.dragTabIds().length;
  }

  handleDrop(event: CdkDragDrop<WorkbenchTab[]>): void {
    const currentIndex = this.resolveDropIndex(event);
    if (currentIndex < 0) {
      return;
    }

    if (event.previousContainer === event.container) {
      if (event.previousIndex === currentIndex) {
        return;
      }
      this.reorder.emit({
        previousIndex: event.previousIndex,
        currentIndex,
      });
      return;
    }

    this.transfer.emit({
      previousIndex: event.previousIndex,
      currentIndex,
      previousContainerId: event.previousContainer.id,
      containerId: event.container.id,
    });
  }

  handleListKeydown(event: KeyboardEvent): void {
    const tabs = this.tabs();
    if (tabs.length === 0) {
      return;
    }

    const activeId = this.activeTabId();
    const index = Math.max(
      0,
      tabs.findIndex((tab) => tab.id === activeId),
    );

    let nextIndex = index;
    if (event.key === 'ArrowRight') {
      nextIndex = (index + 1) % tabs.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = tabs.length - 1;
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.store.clearTabSelection(this.groupId());
      return;
    } else {
      return;
    }

    event.preventDefault();
    const next = tabs[nextIndex];
    this.handleSelect({ tabId: next.id, event });
    queueMicrotask(() => this.focusTab(next.id));
  }

  @HostListener('window:resize')
  handleWindowResize(): void {
    this.closeMenu();
  }

  @HostListener('document:keydown', ['$event'])
  handleDocumentKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !this.menuTab()) {
      return;
    }
    event.preventDefault();
    this.closeMenu();
  }

  private resolveDropIndex(event: CdkDragDrop<WorkbenchTab[]>): number {
    const sameList = event.previousContainer === event.container;
    const cdkStuck = sameList && event.previousIndex === event.currentIndex;
    if (event.isPointerOverContainer && !cdkStuck) {
      return event.currentIndex;
    }

    const fromPoint = this.indexFromDropPoint(event.dropPoint, sameList ? event.previousIndex : null);
    if (fromPoint !== null) {
      return fromPoint;
    }

    return event.isPointerOverContainer ? event.currentIndex : -1;
  }

  private indexFromDropPoint(
    point: { x: number; y: number } | null,
    draggingIndex: number | null,
  ): number | null {
    if (!point) {
      return null;
    }

    const track = (this.host.nativeElement as HTMLElement).querySelector('.tx-workbench-tablist__track');
    if (track instanceof HTMLElement) {
      const trackRect = track.getBoundingClientRect();
      if (point.y < trackRect.top - 12 || point.y > trackRect.bottom + 12) {
        return null;
      }
    }

    const items = Array.from(
      (this.host.nativeElement as HTMLElement).querySelectorAll('.tx-workbench-tablist__item[data-tab-id]'),
    ).filter((node): node is HTMLElement => node instanceof HTMLElement);
    if (items.length === 0) {
      return 0;
    }

    for (let index = 0; index < items.length; index += 1) {
      const rect = items[index].getBoundingClientRect();
      if (rect.width < 2) {
        continue;
      }
      if (point.x < rect.left + rect.width / 2) {
        return index;
      }
    }

    return draggingIndex === null ? items.length : items.length - 1;
  }

  private openMenu(event: MouseEvent, tab: WorkbenchTab): void {
    event.preventDefault();
    event.stopPropagation();
    this.closeMenu(true);
    this.menuTab.set(tab);
    const x = event.clientX;
    const y = event.clientY;
    const position = this.overlay.position().global();
    const overlayRef = this.overlay.create({
      positionStrategy: position,
      scrollStrategy: this.overlay.scrollStrategies.close(),
      panelClass: 'tx-overlay-menu',
    });
    overlayRef.attach(new TemplatePortal(this.menuTemplate(), this.vcr));
    this.overlayRef = overlayRef;
    this.placeMenu(overlayRef, position, x, y);
    requestAnimationFrame(() => {
      if (this.overlayRef === overlayRef) {
        this.placeMenu(overlayRef, position, x, y);
      }
    });
    window.setTimeout(() => {
      if (this.overlayRef !== overlayRef) {
        return;
      }
      overlayRef.outsidePointerEvents().subscribe(() => this.closeMenu());
    });
  }

  private closeMenu(immediate = false): void {
    const overlayRef = this.overlayRef;
    this.menuCloseToken += 1;
    const token = this.menuCloseToken;
    if (!overlayRef) {
      this.menuTab.set(null);
      return;
    }
    const dispose = (): void => {
      if (token !== this.menuCloseToken) {
        return;
      }
      overlayRef.dispose();
      if (this.overlayRef === overlayRef) {
        this.overlayRef = null;
        this.menuTab.set(null);
      }
    };
    if (immediate) {
      dispose();
      return;
    }
    const menu = overlayRef.overlayElement.querySelector('.tx-menu');
    playLeaveThen(menu instanceof HTMLElement ? menu : null, dispose);
  }

  private placeMenu(overlayRef: OverlayRef, position: GlobalPositionStrategy, x: number, y: number): void {
    const menu = overlayRef.overlayElement.querySelector('.tx-workbench-tablist__menu');
    const width = menu instanceof HTMLElement && menu.offsetWidth ? menu.offsetWidth : 188;
    const height = menu instanceof HTMLElement && menu.offsetHeight ? menu.offsetHeight : 160;
    const margin = 8;
    const left = x + width > window.innerWidth - margin ? Math.max(margin, x - width) : x;
    const top = y + height > window.innerHeight - margin ? Math.max(margin, y - height) : y;
    position.left(`${left}px`).top(`${top}px`);
    overlayRef.updatePosition();
  }

  private focusTab(tabId: string): void {
    const el = (this.host.nativeElement as HTMLElement).querySelector(`#workbench-tab-${CSS.escape(tabId)}`);
    if (el instanceof HTMLElement) {
      el.focus();
    }
  }
}
