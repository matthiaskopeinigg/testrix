import { AfterViewInit, Directive, ElementRef, inject, OnDestroy } from '@angular/core';

@Directive({
  standalone: true,
  selector: '[txAutofocus]',
})
export class TxAutofocusDirective implements AfterViewInit, OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);

  private readonly handleVisibility = (): void => {
    if (document.visibilityState !== 'visible') {
      return;
    }
    this.focusHost();
  };

  ngAfterViewInit(): void {
    queueMicrotask(() => this.focusHost());
    document.addEventListener('visibilitychange', this.handleVisibility);
  }

  ngOnDestroy(): void {
    document.removeEventListener('visibilitychange', this.handleVisibility);
  }

  private focusHost(): void {
    try {
      this.host.nativeElement.focus({ preventScroll: true });
    } catch {
      /** Host may not participate in sequential focus */
    }
  }
}
