import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import type { TxIconName } from '@app/shared/icons/tx-icon.registry';

export type RgStatCardTone = 'success' | 'warning' | 'error' | 'default';

@Component({
  selector: 'app-rg-results-stat-card',
  standalone: true,
  imports: [TxIconComponent],
  template: `
    <article class="rg-stat-card" [attr.data-tone]="tone()">
      <div class="rg-stat-card__accent" aria-hidden="true"></div>
      <div class="rg-stat-card__content">
        <div class="rg-stat-card__head">
          <span class="rg-stat-card__label-group">
            <tx-icon class="rg-stat-card__icon" [name]="icon()" [size]="14" aria-hidden="true" />
            <span class="rg-stat-card__label">{{ label() }}</span>
          </span>
        </div>
        <strong class="rg-stat-card__value">{{ value() }}</strong>
        @if (hint()) {
          <span class="rg-stat-card__hint">{{ hint() }}</span>
        }
      </div>
    </article>
  `,
  styleUrl: './rg-results-stat-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RgResultsStatCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly hint = input<string | undefined>(undefined);
  readonly icon = input<TxIconName>('activity');
  readonly tone = input<RgStatCardTone>('default');
}
