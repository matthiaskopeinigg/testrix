import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { ThemePalette } from '@shared/theme';

export type TxThemeLayoutPreviewVariant = 'layout' | 'swatch';

/**
 * Miniature workbench chrome preview painted with a theme palette (not live CSS theme vars).
 */
@Component({
  selector: 'tx-theme-layout-preview',
  standalone: true,
  templateUrl: './tx-theme-layout-preview.component.html',
  styleUrl: './tx-theme-layout-preview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tx-theme-layout-preview-host',
    '[class.tx-theme-layout-preview-host--compact]': 'compact()',
    '[style.--tp-bg]': 'palette().bg',
    '[style.--tp-surface]': 'palette().surface',
    '[style.--tp-text]': 'palette().text',
    '[style.--tp-primary]': 'palette().primary',
    '[style.--tp-secondary]': 'palette().secondary',
    '[style.--tp-accent]': 'palette().accent',
    '[style.--tp-border]': 'palette().border',
  },
})
export class TxThemeLayoutPreviewComponent {
  readonly palette = input.required<ThemePalette>();
  /** Full workbench chrome (`layout`, default) vs four-stripe swatch (`swatch`). */
  readonly variant = input<TxThemeLayoutPreviewVariant>('layout');
  /** Smaller chrome for settings theme cards (matches api-workbench `[compact]="true"`). */
  readonly compact = input(false);
}
