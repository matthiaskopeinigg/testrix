import { DOCUMENT } from '@angular/common';
import {
  Directive,
  ElementRef,
  HostBinding,
  HostListener,
  afterNextRender,
  effect,
  inject,
  input,
} from '@angular/core';

import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';

/**
 * Animated highlight pill that slides between active section tabs.
 */
@Directive({
  selector: '[txSectionNavSlider], [txWorkspaceSectionNav]',
  standalone: true,
})
export class TxSectionNavSliderDirective {
  /** Active section id — drives the sliding highlight position. */
  readonly txSectionNavSlider = input.required<string>({ alias: 'txWorkspaceSectionNav' });

  @HostBinding('class.tx-section-nav-slider')
  @HostBinding('class.workspace-tab-section-nav')
  protected readonly navHostClass = true;

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly document = inject(DOCUMENT);
  private readonly uiPreferences = inject(UiPreferencesService);

  private sliderEl: HTMLElement | null = null;
  private sliderReady = false;

  constructor() {
    afterNextRender(() => {
      this.ensureSlider();
      this.syncSlider(false);
    });

    effect(() => {
      this.txSectionNavSlider();
      queueMicrotask(() => this.syncSlider(this.sliderReady));
    });
  }

  @HostListener('window:resize')
  protected handleResize(): void {
    this.syncSlider(this.sliderReady);
  }

  @HostListener('scroll')
  protected handleScroll(): void {
    this.syncSlider(this.sliderReady);
  }

  private ensureSlider(): void {
    const nav = this.host.nativeElement;
    if (this.sliderEl?.isConnected && nav.contains(this.sliderEl)) {
      return;
    }

    const slider = this.document.createElement('span');
    slider.className = 'tx-section-nav-slider__pill workspace-tab-section-nav__slider';
    slider.setAttribute('aria-hidden', 'true');
    slider.style.position = 'absolute';
    slider.style.top = '0';
    slider.style.left = '0';
    slider.style.pointerEvents = 'none';
    nav.prepend(slider);
    this.sliderEl = slider;
  }

  private syncSlider(animate: boolean): void {
    this.ensureSlider();
    const nav = this.host.nativeElement;
    const slider = this.sliderEl;
    if (!slider) {
      return;
    }

    const active = nav.querySelector('[role="tab"].is-active, [role="tab"][aria-selected="true"]') as HTMLElement | null;
    if (!active) {
      slider.style.opacity = '0';
      return;
    }

    const motionEnabled =
      this.uiPreferences.animationsEnabled() &&
      this.document.documentElement.getAttribute('data-animation-speed') !== 'none';

    slider.style.transition = animate && motionEnabled ? '' : 'none';
    slider.style.width = `${active.offsetWidth}px`;
    slider.style.height = `${active.offsetHeight}px`;
    slider.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
    slider.style.opacity = '1';

    if (!animate || !motionEnabled) {
      requestAnimationFrame(() => {
        if (this.sliderEl) {
          this.sliderEl.style.transition = motionEnabled ? '' : 'none';
        }
      });
    }

    this.sliderReady = true;
  }
}
