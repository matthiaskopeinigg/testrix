import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { ToolItem } from '@testrix/contracts';
import { TxHintComponent } from '@testrix/ui';

import { ToolIconComponent } from './tool-icon.component';

export interface ToolsReorderRequest {
  readonly direction: -1 | 1;
}

export interface ToolsSelectRequest {
  readonly id: string;
  readonly event: MouseEvent | KeyboardEvent;
}

@Component({
  selector: 'tx-tools-list-item',
  standalone: true,
  imports: [TxHintComponent, ToolIconComponent],
  templateUrl: './tools-list-item.component.html',
  styleUrl: './tools-list-item.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolsListItemComponent {
  readonly tool = input.required<ToolItem>();
  readonly active = input(false);
  readonly selected = input(false);
  readonly select = output<ToolsSelectRequest>();
  readonly shift = output<ToolsReorderRequest>();

  readonly rowAriaLabel = computed(() => {
    const tool = this.tool();
    return this.active() ? `${tool.label}, open` : tool.label;
  });

  handleRowClick(event: MouseEvent): void {
    event.stopPropagation();
    this.select.emit({ id: this.tool().id, event });
  }

  handleRowKeydown(event: KeyboardEvent): void {
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      event.stopPropagation();
      this.shift.emit({ direction: event.key === 'ArrowUp' ? -1 : 1 });
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.select.emit({ id: this.tool().id, event });
  }
}
