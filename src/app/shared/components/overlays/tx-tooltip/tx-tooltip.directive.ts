import { Directive, ElementRef, HostListener, inject, input, OnDestroy } from '@angular/core';

import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';

import { TxTooltipService } from './tx-tooltip.service';
import type { TxTooltipPosition } from './tx-tooltip.types';

/**
 * Shows a styled tooltip on hover/focus. Prefer over native `title` for consistent chrome.
 */
@Directive({
  selector: '[txTooltip]',
  standalone: true,
})
export class TxTooltipDirective implements OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly tooltips = inject(TxTooltipService);
  private readonly uiPreferences = inject(UiPreferencesService);

  /** Tooltip copy; omit or pass empty string to disable. */
  readonly txTooltip = input<string>('');

  readonly txTooltipPosition = input<TxTooltipPosition>('top');

  readonly txTooltipDisabled = input(false);

  @HostListener('mouseenter')
  protected onMouseEnter(): void {
    this.show();
  }

  @HostListener('mouseleave')
  protected onMouseLeave(): void {
    this.tooltips.hide(this.host.nativeElement);
  }

  @HostListener('focusin')
  protected onFocusIn(): void {
    this.show();
  }

  @HostListener('focusout')
  protected onFocusOut(): void {
    this.tooltips.hide(this.host.nativeElement);
  }

  @HostListener('click')
  protected onClick(): void {
    this.tooltips.hide(this.host.nativeElement);
  }

  ngOnDestroy(): void {
    this.tooltips.hide(this.host.nativeElement);
  }

  private show(): void {
    const showTooltips = this.uiPreferences.showIconTooltips?.() ?? true;
    if (this.txTooltipDisabled() || !showTooltips || !this.txTooltip().trim()) {
      return;
    }
    this.tooltips.show(this.host.nativeElement, this.txTooltip(), this.txTooltipPosition());
  }
}
