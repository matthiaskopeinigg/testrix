import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { hasPlaceholderTokens, splitPlaceholderSegments } from './placeholder-complete';
import { PLACEHOLDER_ORIGIN_HOST } from './placeholder-origin';

@Component({
  selector: 'tx-placeholder-highlight',
  standalone: true,
  templateUrl: './placeholder-highlight.component.html',
  styleUrl: './placeholder-highlight.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  preserveWhitespaces: false,
  host: {
    '[class.is-multiline]': 'multiline()',
  },
})
export class PlaceholderHighlightComponent {
  readonly value = input('');
  readonly variables = input<readonly string[]>([]);
  readonly pathParams = input(false);
  readonly multiline = input(false);
  readonly markUnknown = input(false);
  readonly parts = computed(() =>
    splitPlaceholderSegments(this.value(), this.variables(), {
      pathParams: this.pathParams(),
      origins: this.originHost?.placeholderOrigins() ?? [],
      markUnknown: this.markUnknown(),
    }),
  );
  readonly hasTokens = computed(() =>
    hasPlaceholderTokens(this.value(), this.variables(), {
      pathParams: this.pathParams(),
      origins: this.originHost?.placeholderOrigins() ?? [],
      markUnknown: this.markUnknown(),
    }),
  );

  private readonly originHost = inject(PLACEHOLDER_ORIGIN_HOST, { optional: true });
}
