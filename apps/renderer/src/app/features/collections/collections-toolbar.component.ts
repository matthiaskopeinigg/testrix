import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  COLLECTION_STATUS_FILTERS,
  HTTP_METHODS,
  type CollectionSortMode,
  type CollectionStatusFilter,
  type HttpMethod,
} from '@testrix/contracts';
import { TxHintComponent, TxInputComponent } from '@testrix/ui';

import { CollectionsStore } from './collections.store';

type MenuId = 'filter' | 'sort' | null;

interface MenuPosition {
  readonly top: number;
  readonly left: number;
  readonly maxHeight: number;
  readonly width: number;
}

const SORT_OPTIONS: ReadonlyArray<{ id: CollectionSortMode; label: string }> = [
  { id: 'name-asc', label: 'Name A–Z' },
  { id: 'name-desc', label: 'Name Z–A' },
  { id: 'type', label: 'Type' },
  { id: 'modified-desc', label: 'Recently modified' },
];

const MENU_WIDTH = 180;
const MENU_GAP = 6;
const MENU_EDGE = 8;

@Component({
  selector: 'tx-collections-toolbar',
  standalone: true,
  imports: [TxHintComponent, TxInputComponent],
  templateUrl: './collections-toolbar.component.html',
  styleUrl: './collections-toolbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionsToolbarComponent {
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly store = inject(CollectionsStore);
  readonly openMenu = signal<MenuId>(null);
  readonly menuPosition = signal<MenuPosition | null>(null);
  readonly sortOptions = SORT_OPTIONS;
  readonly httpMethods = HTTP_METHODS;
  readonly statusFilters = COLLECTION_STATUS_FILTERS;

  readonly sortLabel = computed(() => {
    const mode = this.store.sortMode();
    return SORT_OPTIONS.find((option) => option.id === mode)?.label ?? 'Sort';
  });

  readonly expandToggleLabel = computed(() =>
    this.store.allFoldersExpanded() ? 'Collapse all' : 'Expand all',
  );

  handleSearch(value: string): void {
    this.store.setSearchQuery(value);
  }

  handleToggleMenu(menu: Exclude<MenuId, null>, event: MouseEvent): void {
    event.stopPropagation();
    const trigger = event.currentTarget;
    if (!(trigger instanceof HTMLElement)) {
      return;
    }

    this.openMenu.update((current) => {
      if (current === menu)
        return null;
      this.menuPosition.set(this.computeMenuPosition(trigger));
      return menu;
    });
  }

  handleCloseMenus(): void {
    this.openMenu.set(null);
  }

  handleToggleExpandAll(): void {
    this.store.toggleExpandAll();
  }

  handleSort(mode: CollectionSortMode): void {
    this.store.setSortMode(mode);
    this.handleCloseMenus();
  }

  handleToggleKind(kind: 'folder' | 'http' | 'websocket'): void {
    this.store.toggleKindFilter(kind);
  }

  handleToggleMethod(method: HttpMethod): void {
    this.store.toggleMethodFilter(method);
  }

  handleToggleStatus(status: CollectionStatusFilter): void {
    this.store.toggleStatusFilter(status);
  }

  handleClearFilters(): void {
    this.store.clearFilters();
  }

  statusLabel(status: CollectionStatusFilter): string {
    return status === 'unset' ? 'Unset' : String(status);
  }

  @HostListener('document:pointerdown', ['$event'])
  handleDocumentPointerDown(event: PointerEvent): void {
    const target = event.target;
    if (target instanceof Node && this.host.nativeElement.contains(target)) {
      return;
    }
    this.handleCloseMenus();
  }

  @HostListener('window:resize')
  handleWindowResize(): void {
    if (this.openMenu()) {
      this.handleCloseMenus();
    }
  }

  private computeMenuPosition(trigger: HTMLElement): MenuPosition {
    const triggerRect = trigger.getBoundingClientRect();
    const bounds =
      this.host.nativeElement.closest('.tx-sidebar')?.getBoundingClientRect() ??
      this.host.nativeElement.closest('.tx-collections')?.getBoundingClientRect() ??
      new DOMRect(0, 0, window.innerWidth, window.innerHeight);

    const width = Math.min(MENU_WIDTH, Math.max(140, bounds.width - MENU_EDGE * 2));
    let left = triggerRect.left;
    left = Math.min(left, bounds.right - width - MENU_EDGE);
    left = Math.max(left, bounds.left + MENU_EDGE);

    const top = triggerRect.bottom + MENU_GAP;
    const maxHeight = Math.max(120, Math.floor(bounds.bottom - top - MENU_EDGE));

    return { top, left, maxHeight, width };
  }
}
