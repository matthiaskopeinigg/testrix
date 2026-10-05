import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  input,
  output,
  viewChild,
  viewChildren,
} from '@angular/core';

import type { PlaceholderSuggestion } from './placeholder-complete';

@Component({
  selector: 'tx-placeholder-suggest',
  standalone: true,
  templateUrl: './placeholder-suggest.component.html',
  styleUrl: './placeholder-suggest.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaceholderSuggestComponent {
  readonly items = input.required<readonly PlaceholderSuggestion[]>();
  readonly index = input(0);
  readonly pick = output<PlaceholderSuggestion>();
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');
  private readonly itemEls = viewChildren<ElementRef<HTMLElement>>('option');

  constructor() {
    afterRenderEffect(() => {
      this.scrollActiveIntoView();
    });
  }

  handlePick(item: PlaceholderSuggestion, event: Event): void {
    event.preventDefault();
    this.pick.emit(item);
  }

  private scrollActiveIntoView(): void {
    const list = this.list()?.nativeElement;
    const item = this.itemEls()[this.index()]?.nativeElement;
    if (!list || !item)
      return;
    const pad = 6;
    const top = item.offsetTop;
    const bottom = top + item.offsetHeight;
    const viewTop = list.scrollTop;
    const viewBottom = viewTop + list.clientHeight;
    if (top - pad < viewTop)
      list.scrollTop = Math.max(0, top - pad);
    else if (bottom + pad > viewBottom)
      list.scrollTop = bottom + pad - list.clientHeight;
  }
}
