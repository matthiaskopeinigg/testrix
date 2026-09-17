import { ChangeDetectionStrategy, Component, effect, inject, viewChild, ElementRef } from '@angular/core';
import { TxEmptyStateComponent } from '@testrix/ui';

import { ToolsDndService } from './tools-dnd.service';
import { ToolsListComponent } from './tools-list.component';
import { ToolsStore } from './tools.store';

@Component({
  selector: 'tx-tools-sidebar',
  standalone: true,
  imports: [ToolsListComponent, TxEmptyStateComponent],
  templateUrl: './tools-sidebar.component.html',
  styleUrl: './tools-sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolsSidebarComponent {
  readonly store = inject(ToolsStore);
  readonly dnd = inject(ToolsDndService);

  private readonly rootRef = viewChild<ElementRef<HTMLElement>>('root');
  private readonly scrollerRef = viewChild<ElementRef<HTMLElement>>('scroller');

  constructor() {
    effect(() => {
      this.dnd.registerSurface(
        this.rootRef()?.nativeElement ?? null,
        this.scrollerRef()?.nativeElement ?? null,
      );
    });
  }

  handleChromeClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element) || target.closest('[data-tool-id], button, tx-hint')) {
      return;
    }
    this.store.clearListSelection();
  }
}
