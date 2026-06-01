import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';

import { TxIconService } from '../../icons/tx-icon.service';
import { type TxIconName } from '../../icons/tx-icon.registry';

@Component({
  selector: 'tx-icon',
  standalone: true,
  templateUrl: './tx-icon.component.html',
  styleUrl: './tx-icon.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxIconComponent {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly iconService = inject(TxIconService);

  /** Registry key (`TxIconName`). */
  readonly name = input.required<TxIconName>();

  /** Pixel width/height (square). */
  readonly size = input(18);

  readonly strokeWidth = input(2);

  /** When set, exposes `role="img"` + `aria-label`; otherwise decorative. */
  readonly ariaLabel = input<string | undefined>(undefined);

  private readonly innerMarkup = signal<string | null>(null);

  protected readonly svgInner = computed((): SafeHtml | null => {
    const markup = this.innerMarkup();
    return markup ? this.sanitizer.bypassSecurityTrustHtml(markup) : null;
  });

  protected readonly isDecorative = computed(() => {
    const label = this.ariaLabel();
    return !label || label.length === 0;
  });

  constructor() {
    effect(() => {
      const iconName = this.name();
      this.innerMarkup.set(null);

      void this.iconService.loadIconInner(iconName).then(
        (inner) => {
          if (this.name() === iconName) {
            this.innerMarkup.set(inner);
          }
        },
        () => {
          if (this.name() === iconName) {
            this.innerMarkup.set(null);
          }
        },
      );
    });
  }
}
