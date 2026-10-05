import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { loadHealthTagTone, type LoadHealthLevel } from '@testrix/contracts';

/**
 * A single metric tile with an optional health band.
 */
@Component({
  selector: 'tx-lt-results-stat-card',
  standalone: true,
  templateUrl: './lt-results-stat-card.component.html',
  styleUrl: './lt-results-stat-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LtResultsStatCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly health = input<LoadHealthLevel>('ok');
  readonly healthLabel = input<'Good' | 'OK' | 'Bad'>('OK');
  readonly hint = input<string | undefined>(undefined);
  readonly showHealth = input(true);

  readonly tone = computed(() => loadHealthTagTone(this.health()));
}
