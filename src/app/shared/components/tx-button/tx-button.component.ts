import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { TxSpinnerComponent } from '../tx-spinner/tx-spinner.component';
import { TxTooltipDirective } from '../tx-tooltip/tx-tooltip.directive';

@Component({
  selector: 'tx-button',
  standalone: true,
  imports: [TxSpinnerComponent, TxTooltipDirective],
  templateUrl: './tx-button.component.html',
  styleUrl: './tx-button.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxButtonComponent {
  readonly variant = input<'cta' | 'primary' | 'secondary' | 'add' | 'danger'>('primary');

  readonly disabled = input(false);

  /** Shows spinner, sets aria-busy, and blocks interaction. */
  readonly loading = input(false);

  readonly loadingLabel = input('Loading');

  readonly buttonType = input<'button' | 'submit' | 'reset'>('button');

  /** Accessible name when the visible label is icon-only. */
  readonly ariaLabel = input<string | undefined>(undefined);

  /** Styled hover hint; also defaults to `ariaLabel` for icon-only buttons. */
  readonly hint = input<string | undefined>(undefined);

  /** Compact square control for icon-only toolbar actions. */
  readonly size = input<'default' | 'icon'>('default');

  readonly pressed = output<MouseEvent>();

  protected readonly isInteractionBlocked = computed(() => this.disabled() || this.loading());

  protected readonly tooltipText = computed(() => {
    const explicit = this.hint()?.trim();
    if (explicit) {
      return explicit;
    }
    if (this.size() === 'icon') {
      return this.ariaLabel()?.trim() ?? '';
    }
    return '';
  });

  protected handlePress(event: MouseEvent): void {
    if (this.isInteractionBlocked()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    this.pressed.emit(event);
  }
}
