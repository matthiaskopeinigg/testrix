import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TxHintComponent, TxInputComponent } from '@testrix/ui';

import type { ServiceSort } from '../services.store';

type MenuId = 'filter' | null;

interface MenuPosition {
  readonly top: number;
  readonly left: number;
  readonly maxHeight: number;
  readonly width: number;
}

const MENU_WIDTH = 180;
const MENU_GAP = 6;
const MENU_EDGE = 8;

@Component({
  selector: 'tx-service-toolbar',
  standalone: true,
  imports: [TxHintComponent, TxInputComponent],
  templateUrl: './service-toolbar.component.html',
  styleUrl: './service-toolbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServiceToolbarComponent {
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly searchId = input.required<string>();
  readonly placeholder = input('Search');
  readonly search = input('');
  readonly sort = input<ServiceSort>('manual');
  readonly showTutorial = input(false);
  readonly showTemplates = input(false);
  readonly showFilter = input(false);
  readonly showExpand = input(false);
  readonly allExpanded = input(false);
  readonly availableTags = input<readonly string[]>([]);
  readonly selectedTags = input<readonly string[]>([]);
  readonly searchChange = output<string>();
  readonly sortChange = output<ServiceSort>();
  readonly tutorial = output<void>();
  readonly templates = output<void>();
  readonly expandToggle = output<void>();
  readonly tagToggle = output<string>();
  readonly tagsClear = output<void>();

  readonly openMenu = signal<MenuId>(null);
  readonly menuPosition = signal<MenuPosition | null>(null);

  readonly isFilterActive = computed(() => this.selectedTags().length > 0);
  readonly expandToggleLabel = computed(() =>
    this.allExpanded() ? 'Collapse all' : 'Expand all',
  );
  readonly sortLabel = computed(() =>
    this.sort() === 'manual' ? 'Manual' : this.sort() === 'name' ? 'Name' : 'Updated',
  );

  handleToggleFilter(event: MouseEvent): void {
    event.stopPropagation();
    const trigger = event.currentTarget;
    if (!(trigger instanceof HTMLElement))
      return;
    this.openMenu.update((current) => {
      if (current === 'filter')
        return null;
      this.menuPosition.set(this.computeMenuPosition(trigger));
      return 'filter';
    });
  }

  handleCloseMenus(): void {
    this.openMenu.set(null);
  }

  handleToggleTag(tag: string): void {
    this.tagToggle.emit(tag);
  }

  handleClearFilters(): void {
    this.tagsClear.emit();
  }

  @HostListener('document:pointerdown', ['$event'])
  handleDocumentPointerDown(event: PointerEvent): void {
    if (!this.openMenu())
      return;
    const target = event.target;
    if (target instanceof Node && this.host.nativeElement.contains(target))
      return;
    this.handleCloseMenus();
  }

  @HostListener('document:keydown.escape')
  handleEscape(): void {
    this.handleCloseMenus();
  }

  private computeMenuPosition(trigger: HTMLElement): MenuPosition {
    const rect = trigger.getBoundingClientRect();
    const width = MENU_WIDTH;
    const left = Math.min(
      Math.max(MENU_EDGE, rect.right - width),
      window.innerWidth - width - MENU_EDGE,
    );
    const top = rect.bottom + MENU_GAP;
    const maxHeight = Math.max(120, window.innerHeight - top - MENU_EDGE);
    return { top, left, width, maxHeight };
  }
}
