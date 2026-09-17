import { booleanAttribute, ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Labeled text field used in chrome and inspectors.
 * Never use a native resize handle — multiline fields scroll instead.
 */
@Component({
  selector: 'tx-input',
  standalone: true,
  templateUrl: './tx-input.component.html',
  styleUrl: './tx-input.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxInputComponent {
  readonly id = input.required<string>();
  readonly label = input<string | null>(null);
  readonly value = input('');
  readonly placeholder = input('');
  readonly type = input('text');
  readonly autocomplete = input('off');
  readonly ariaLabel = input<string | null>(null);
  readonly multiline = input(false, { transform: booleanAttribute });
  readonly rows = input(3);
  readonly valueChange = output<string>();

  handleInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) {
      return;
    }
    this.valueChange.emit(target.value);
  }
}
