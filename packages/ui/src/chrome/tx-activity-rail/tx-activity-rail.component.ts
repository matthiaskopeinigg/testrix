import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChildren,
} from '@angular/core';

import { DEFAULT_RAIL_ITEMS, type TxRailItem, type TxRailItemId } from './tx-rail.model';
import { TxHintComponent } from '../../primitives/tx-hint/tx-hint.component';

@Component({
  selector: 'tx-activity-rail',
  standalone: true,
  imports: [TxHintComponent],
  templateUrl: './tx-activity-rail.component.html',
  styleUrl: './tx-activity-rail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.is-collapsed]': 'collapsed()',
  },
})
export class TxActivityRailComponent {
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly items = input<readonly TxRailItem[]>(DEFAULT_RAIL_ITEMS);
  readonly activeId = input<TxRailItemId>('collections');
  readonly collapsed = input(false);
  readonly helpOpen = input(false);
  readonly selectItem = output<TxRailItemId>();
  readonly openHelp = output<void>();
  readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('railBtn');
  private readonly pendingId = signal<TxRailItemId | null>(null);
  readonly selectedId = computed(() => this.pendingId() ?? this.activeId());

  constructor() {
    afterNextRender(() => {
      if (!this.collapsed()) {
        this.movePill(this.selectedId(), true);
      }
    });
    effect(() => {
      const id = this.activeId();
      const isCollapsed = this.collapsed();
      untracked(() => {
        this.pendingId.set(null);
        if (!isCollapsed) {
          this.movePill(id);
        }
      });
    });
  }

  handleSelect(item: TxRailItem): void {
    this.pendingId.set(item.id);
    if (!this.collapsed()) {
      this.movePill(item.id);
    }
    this.selectItem.emit(item.id);
  }

  private movePill(id: TxRailItemId, instant = false): void {
    const rail = this.host.nativeElement.querySelector('.tx-rail') as HTMLElement | null;
    const pill = this.host.nativeElement.querySelector('.tx-rail__pill') as HTMLElement | null;
    const active = this.buttons().find((btn) => btn.nativeElement.dataset['id'] === id);
    if (!rail || !pill || !active) {
      return;
    }
    const railRect = rail.getBoundingClientRect();
    const btnRect = active.nativeElement.getBoundingClientRect();
    const top = btnRect.top - railRect.top + (btnRect.height - pill.offsetHeight) / 2;
    if (instant) {
      pill.style.transition = 'none';
      pill.style.transform = `translateY(${top}px)`;
      pill.offsetHeight;
      pill.style.transition = '';
      return;
    }
    pill.style.transform = `translateY(${top}px)`;
  }
}
