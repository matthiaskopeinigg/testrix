import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export type TxTagVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

/** Label casing for tag text (metrics use normal case). */
export type TxTagCasing = 'uppercase' | 'normal';

@Component({
  selector: 'tx-tag',
  standalone: true,
  templateUrl: './tx-tag.component.html',
  styleUrl: './tx-tag.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tx-tag-host',
    '[class.tx-tag-host--removable]': 'removable()',
    '[attr.data-variant]': 'variant()',
    '[attr.data-casing]': 'casing()',
  },
})
export class TxTagComponent {
  readonly variant = input<TxTagVariant>('default');
  readonly casing = input<TxTagCasing>('uppercase');
  readonly removable = input(false);

  readonly removed = output<void>();

  protected handleRemoveClick(event: MouseEvent): void {
    event.stopPropagation();
    this.removed.emit();
  }
}
