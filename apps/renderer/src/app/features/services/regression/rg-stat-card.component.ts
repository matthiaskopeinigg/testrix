import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type RgStatTone = 'success' | 'warning' | 'error' | 'default';

@Component({
  selector: 'tx-rg-stat-card',
  standalone: true,
  template: `
    <article class="rg-stat-card" [attr.data-tone]="tone()">
      <div class="rg-stat-card__accent" aria-hidden="true"></div>
      <div class="rg-stat-card__content">
        <span class="rg-stat-card__label">{{ label() }}</span>
        <strong class="rg-stat-card__value">{{ value() }}</strong>
        @if (hint()) {
          <span class="rg-stat-card__hint">{{ hint() }}</span>
        }
      </div>
    </article>
  `,
  styleUrl: './rg-stat-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RgStatCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly hint = input<string | undefined>(undefined);
  readonly tone = input<RgStatTone>('default');
}
