import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { TxHintComponent, TxInputComponent } from '@testrix/ui';

import { placeToolbarMenu } from '../../../core/toolbar-menu-position';
import { PlantumlStore } from './plantuml.store';
import {
  PLANTUML_FILTER_KINDS,
  type PlantumlFilterKind,
  type PlantumlSortMode,
} from './plantuml-tree';

type MenuId = 'filter' | 'sort' | null;

interface MenuPosition {
  readonly top: number;
  readonly left: number;
  readonly maxHeight: number;
  readonly width: number;
}

const SORT_OPTIONS: ReadonlyArray<{ id: PlantumlSortMode; label: string }> = [
  { id: 'name-asc', label: 'Name A–Z' },
  { id: 'name-desc', label: 'Name Z–A' },
  { id: 'type', label: 'Type' },
  { id: 'modified-desc', label: 'Recently modified' },
];

const FILTER_LABELS: Readonly<Record<PlantumlFilterKind, string>> = {
  folder: 'Folders',
  sequence: 'Sequence',
  class: 'Class',
  activity: 'Activity',
};

const MENU_WIDTH = 180;

@Component({
  selector: 'tx-plantuml-toolbar',
  standalone: true,
  imports: [TxHintComponent, TxInputComponent],
  templateUrl: './plantuml-toolbar.component.html',
  styleUrl: './plantuml-toolbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlantumlToolbarComponent {
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly store = inject(PlantumlStore);
  readonly openMenu = signal<MenuId>(null);
  readonly menuPosition = signal<MenuPosition | null>(null);
  readonly sortOptions = SORT_OPTIONS;
  readonly filterKinds = PLANTUML_FILTER_KINDS;

  readonly sortLabel = computed(() => {
    const mode = this.store.sortMode();
    return SORT_OPTIONS.find((option) => option.id === mode)?.label ?? 'Sort';
  });

  readonly expandToggleLabel = computed(() =>
    this.store.allFoldersExpanded() ? 'Collapse all' : 'Expand all',
  );

  handleSearch(value: string): void {
    this.store.setSearch(value);
  }

  handleToggleMenu(menu: Exclude<MenuId, null>, event: MouseEvent): void {
    event.stopPropagation();
    const trigger = event.currentTarget;
    if (!(trigger instanceof HTMLElement))
      return;
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

  handleSort(mode: PlantumlSortMode): void {
    this.store.setSortMode(mode);
    this.handleCloseMenus();
  }

  handleToggleKind(kind: PlantumlFilterKind): void {
    this.store.toggleKindFilter(kind);
  }

  handleClearFilters(): void {
    this.store.clearFilters();
  }

  filterLabel(kind: PlantumlFilterKind): string {
    return FILTER_LABELS[kind];
  }

  @HostListener('document:pointerdown', ['$event'])
  handleDocumentPointerDown(event: PointerEvent): void {
    const target = event.target;
    if (target instanceof Node && this.host.nativeElement.contains(target))
      return;
    this.handleCloseMenus();
  }

  @HostListener('window:resize')
  handleWindowResize(): void {
    if (this.openMenu())
      this.handleCloseMenus();
  }

  private computeMenuPosition(trigger: HTMLElement): MenuPosition {
    return placeToolbarMenu(trigger, MENU_WIDTH);
  }
}
