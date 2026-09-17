import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { environmentVariableCount, type Environment } from '@testrix/contracts';
import { TxHintComponent } from '@testrix/ui';

export interface EnvironmentsReorderRequest {
  readonly direction: -1 | 1;
}

export interface EnvironmentsSelectRequest {
  readonly id: string;
  readonly event: MouseEvent | KeyboardEvent;
}

export interface EnvironmentsMenuRequest {
  readonly id: string;
  readonly event: MouseEvent;
}

@Component({
  selector: 'tx-environments-list-item',
  standalone: true,
  imports: [TxHintComponent],
  templateUrl: './environments-list-item.component.html',
  styleUrl: './environments-list-item.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnvironmentsListItemComponent {
  readonly environment = input.required<Environment>();
  readonly active = input(false);
  readonly selected = input(false);
  readonly renaming = input(false);
  readonly select = output<EnvironmentsSelectRequest>();
  readonly shift = output<EnvironmentsReorderRequest>();
  readonly menu = output<EnvironmentsMenuRequest>();
  readonly renameStart = output<string>();
  readonly renameInput = output<{ readonly id: string; readonly value: string }>();
  readonly renameKey = output<KeyboardEvent>();
  readonly renameBlur = output<void>();

  readonly rowAriaLabel = computed(() => {
    const env = this.environment();
    const total = environmentVariableCount(env);
    const count = total === 1 ? '1 variable' : `${total} variables`;
    return this.active() ? `${env.name}, active, ${count}` : `${env.name}, ${count}`;
  });

  readonly countLabel = computed(() => environmentVariableCount(this.environment()));

  handleRowClick(event: MouseEvent): void {
    if (this.renaming()) {
      return;
    }
    event.stopPropagation();
    this.select.emit({ id: this.environment().id, event });
  }

  handleRowKeydown(event: KeyboardEvent): void {
    if (this.renaming()) {
      return;
    }
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      event.stopPropagation();
      this.shift.emit({ direction: event.key === 'ArrowUp' ? -1 : 1 });
      return;
    }
    if (event.key === 'F2') {
      event.preventDefault();
      event.stopPropagation();
      this.renameStart.emit(this.environment().id);
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.select.emit({ id: this.environment().id, event });
  }

  handleMenu(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.menu.emit({ id: this.environment().id, event });
  }

  handleRenameInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    this.renameInput.emit({ id: this.environment().id, value: target.value });
  }
}
