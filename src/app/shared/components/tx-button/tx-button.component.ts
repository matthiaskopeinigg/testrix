import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { TxSpinnerComponent } from '../tx-spinner/tx-spinner.component';

@Component({
  selector: 'tx-button',
  standalone: true,
  imports: [TxSpinnerComponent],
  templateUrl: './tx-button.component.html',
  styleUrl: './tx-button.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxButtonComponent {
  readonly variant = input<'cta' | 'primary' | 'secondary' | 'add'>('primary');

  readonly disabled = input(false);

  /** Shows spinner, sets aria-busy, and blocks interaction. */
  readonly loading = input(false);

  readonly loadingLabel = input('Loading');

  readonly buttonType = input<'button' | 'submit' | 'reset'>('button');

  /** Accessible name when the visible label is icon-only. */
  readonly ariaLabel = input<string | undefined>(undefined);

  /** Compact square control for icon-only toolbar actions. */
  readonly size = input<'default' | 'icon'>('default');

  readonly pressed = output<MouseEvent>();

  protected readonly isInteractionBlocked = computed(() => this.disabled() || this.loading());

  protected handlePress(event: MouseEvent): void {
    if (this.isInteractionBlocked()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    this.pressed.emit(event);
  }
}
