import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { LoadTestHealthLevel } from '@shared/testing';
import { loadTestHealthTagVariant } from '@shared/testing';

import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import type { TxIconName } from '@app/shared/icons/tx-icon.registry';
import { TxTagComponent } from '@app/shared/components/tx-tag/tx-tag.component';

@Component({
  selector: 'app-lt-results-stat-card',
  standalone: true,
  imports: [TxIconComponent, TxTagComponent],
  template: `
    <article class="lt-stat-card" [attr.data-health]="health()">
      <div class="lt-stat-card__accent" aria-hidden="true"></div>
      <div class="lt-stat-card__content">
        <div class="lt-stat-card__head">
          <span class="lt-stat-card__label-group">
            <tx-icon class="lt-stat-card__icon" [name]="icon()" [size]="14" aria-hidden="true" />
            <span class="lt-stat-card__label">{{ label() }}</span>
          </span>
          @if (showHealth()) {
            <tx-tag class="lt-stat-card__tag" [variant]="tagVariant()" casing="normal">
              {{ healthLabel() }}
            </tx-tag>
          }
        </div>
        <strong class="lt-stat-card__value">{{ value() }}</strong>
        @if (hint()) {
          <span class="lt-stat-card__hint">{{ hint() }}</span>
        }
      </div>
    </article>
  `,
  styleUrl: './lt-results-stat-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LtResultsStatCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly health = input<LoadTestHealthLevel>('ok');
  readonly healthLabel = input<'Good' | 'OK' | 'Bad'>('OK');
  readonly hint = input<string | undefined>(undefined);
  readonly icon = input<TxIconName>('activity');
  readonly showHealth = input(true);

  protected readonly tagVariant = computed(() => loadTestHealthTagVariant(this.health()));
}
