import { booleanAttribute, ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export type TxCheckVariant = 'block' | 'inline' | 'compact';

/**
 * Animated check switch. The box fills with accent and the tick draws in.
 * Use this for boolean options instead of native checkboxes.
 */
@Component({
  selector: 'tx-check',
  standalone: true,
  templateUrl: './tx-check.component.html',
  styleUrl: './tx-check.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tx-check-host',
    '[class.tx-check-host--block]': 'variant() === "block"',
    '[class.tx-check-host--inline]': 'variant() === "inline"',
    '[class.tx-check-host--compact]': 'variant() === "compact"',
  },
})
export class TxCheckComponent {
  readonly checked = input(false);
  readonly label = input.required<string>();
  readonly detail = input<string | null>(null);
  readonly variant = input<TxCheckVariant>('block');
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly checkedChange = output<boolean>();

  handleClick(event: MouseEvent): void {
    if (this.disabled()) {
      event.preventDefault();
      return;
    }
    this.checkedChange.emit(!this.checked());
  }
}
