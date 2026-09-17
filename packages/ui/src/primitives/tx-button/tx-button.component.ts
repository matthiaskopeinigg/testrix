import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export type TxButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

@Component({
  selector: 'tx-button',
  standalone: true,
  templateUrl: './tx-button.component.html',
  styleUrl: './tx-button.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxButtonComponent {
  readonly variant = input<TxButtonVariant>('secondary');
  readonly type = input<'button' | 'submit'>('button');
  readonly disabled = input(false);
  readonly ariaLabel = input<string | null>(null);
  readonly clicked = output<MouseEvent>();

  handleClick(event: MouseEvent): void {
    if (this.disabled()) {
      event.preventDefault();
      return;
    }
    this.clicked.emit(event);
  }
}
