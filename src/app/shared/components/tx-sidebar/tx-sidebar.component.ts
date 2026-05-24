import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';

import { WorkspaceSidebarPanelHeaderService } from '@app/core/workspace/workspace-sidebar-panel-header.service';

import { shouldSuppressTxTreeOutsideInteraction } from '../tx-tree/tx-tree-dnd.controller';
import { TxIconComponent } from '../tx-icon/tx-icon.component';
import { TxTooltipDirective } from '../tx-tooltip/tx-tooltip.directive';

import type { TxSidebarItem } from './tx-sidebar.types';
import {
  TX_SIDEBAR_PANEL_DEFAULT_WIDTH_PX,
  TX_SIDEBAR_PANEL_MAX_WIDTH_PX,
  TX_SIDEBAR_PANEL_MIN_WIDTH_PX,
  TX_SIDEBAR_RAIL_WIDTH_PX,
} from './tx-sidebar.types';

@Component({
  selector: 'tx-sidebar',
  standalone: true,
  imports: [TxIconComponent, TxTooltipDirective],
  templateUrl: './tx-sidebar.component.html',
  styleUrl: './tx-sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tx-sidebar-host',
    '[class.tx-sidebar-host--panel-open]': 'panelOpen()',
    '[class.tx-sidebar-host--resizing]': 'isResizing()',
    '[style.width.px]': 'hostWidth()',
  },
})
export class TxSidebarComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly panelHeader = inject(WorkspaceSidebarPanelHeaderService);

  readonly items = input.required<readonly TxSidebarItem[]>();
  readonly footerItems = input<readonly TxSidebarItem[]>([]);
  readonly activeId = model<string | undefined>(undefined);
  readonly ariaLabel = input('Application navigation');

  /** Contextual panel beside the icon rail (closed by default). */
  readonly panelOpen = model(false);

  /** When true, pointer down outside the sidebar closes the open panel. */
  readonly closePanelOnOutsideClick = input(false);

  readonly itemSelect = output<string>();
  readonly panelWidthChange = output<number>();

  protected readonly panelWidth = signal(TX_SIDEBAR_PANEL_DEFAULT_WIDTH_PX);
  protected readonly isResizing = signal(false);

  protected readonly hostWidth = computed(() =>
    TX_SIDEBAR_RAIL_WIDTH_PX + (this.panelOpen() ? this.panelWidth() : 0),
  );

  protected readonly activeItem = computed((): TxSidebarItem | undefined => {
    const id = this.activeId();
    if (!id) {
      return undefined;
    }
    return [...this.items(), ...this.footerItems()].find((item) => item.id === id);
  });

  protected readonly panelHeaderState = this.panelHeader.state;

  protected readonly activePanelTitle = computed(() => {
    const override = this.panelHeaderState()?.title;
    if (override) {
      return override;
    }
    return this.activeItem()?.label ?? '';
  });

  protected readonly panelBackHandler = computed(() => this.panelHeaderState()?.onBack);

  private resizeOriginX = 0;
  private resizeOriginWidth = TX_SIDEBAR_PANEL_DEFAULT_WIDTH_PX;

  private readonly handleResizeMove = (event: PointerEvent): void => {
    const delta = event.clientX - this.resizeOriginX;
    const next = Math.min(
      TX_SIDEBAR_PANEL_MAX_WIDTH_PX,
      Math.max(TX_SIDEBAR_PANEL_MIN_WIDTH_PX, this.resizeOriginWidth + delta),
    );
    this.panelWidth.set(next);
    this.panelWidthChange.emit(next);
  };

  private readonly handleResizeEnd = (): void => {
    this.isResizing.set(false);
    document.removeEventListener('pointermove', this.handleResizeMove);
    document.removeEventListener('pointerup', this.handleResizeEnd);
    document.removeEventListener('pointercancel', this.handleResizeEnd);
    document.body.style.removeProperty('cursor');
    document.body.style.removeProperty('user-select');
  };

  private readonly handleOutsidePointer = (event: PointerEvent): void => {
    if (!this.panelOpen() || !this.closePanelOnOutsideClick()) {
      return;
    }

    if (shouldSuppressTxTreeOutsideInteraction()) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Node) || this.host.nativeElement.contains(target)) {
      return;
    }

    // Context menus and modals portal to document.body; ignore those interactions.
    if (target instanceof Element && target.closest('.tx-context-menu, .tx-modal-root, .tx-overlay-dialog')) {
      return;
    }

    this.closePanel();
  };

  constructor() {
    this.destroyRef.onDestroy(() => this.handleResizeEnd());

    effect(() => {
      if (!this.panelOpen()) {
        this.panelHeader.clear();
      }
    });

    effect(() => {
      if (this.panelOpen() && this.closePanelOnOutsideClick()) {
        document.addEventListener('pointerdown', this.handleOutsidePointer, true);
        return () => document.removeEventListener('pointerdown', this.handleOutsidePointer, true);
      }
      return undefined;
    });
  }

  protected handleRailItemClick(item: TxSidebarItem): void {
    if (item.disabled) {
      return;
    }

    if (item.opensPanel === false) {
      this.itemSelect.emit(item.id);
      return;
    }

    const isSameItem = item.id === this.activeId();

    if (isSameItem && this.panelOpen()) {
      this.closePanel();
      return;
    }

    this.activeId.set(item.id);
    this.panelOpen.set(true);
    this.itemSelect.emit(item.id);
  }

  protected handleClosePanel(): void {
    const onBack = this.panelBackHandler();
    if (onBack) {
      onBack();
      return;
    }
    this.closePanel();
  }

  protected isRailActive(item: TxSidebarItem): boolean {
    return this.panelOpen() && item.id === this.activeId();
  }

  protected handleResizeStart(event: PointerEvent): void {
    if (!this.panelOpen()) {
      return;
    }

    event.preventDefault();
    this.isResizing.set(true);
    this.resizeOriginX = event.clientX;
    this.resizeOriginWidth = this.panelWidth();

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('pointermove', this.handleResizeMove);
    document.addEventListener('pointerup', this.handleResizeEnd);
    document.addEventListener('pointercancel', this.handleResizeEnd);
  }

  private closePanel(): void {
    this.panelOpen.set(false);
  }
}
