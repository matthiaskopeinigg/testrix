import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { TxTooltipDirective } from './tx-tooltip.directive';
import type { TxTooltipPosition } from './tx-tooltip.types';

/**
 * Wraps projected content and attaches {@link TxTooltipDirective} to the host.
 */
@Component({
  selector: 'tx-tooltip',
  standalone: true,
  template: '<ng-content />',
  styleUrl: './tx-tooltip.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [
    {
      directive: TxTooltipDirective,
      inputs: ['txTooltip: label', 'txTooltipPosition: position', 'txTooltipDisabled: disabled'],
    },
  ],
})
export class TxTooltipComponent {
  readonly label = input.required<string>();
  readonly position = input<TxTooltipPosition>('top');
  readonly disabled = input(false);
}
