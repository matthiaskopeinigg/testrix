import {
  Directive,
  ElementRef,
  DestroyRef,
  afterNextRender,
  inject,
  input,
  signal,
} from '@angular/core';

/**
 * Defers rendering heavy children until the host nears the viewport (or scroll root).
 * Use with a skeleton placeholder until {@link TxLazyVisibleDirective.visible} is true.
 */
@Directive({
  selector: '[txLazyVisible]',
  exportAs: 'txLazyVisible',
  standalone: true,
})
export class TxLazyVisibleDirective {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  /** Scroll container; defaults to the browser viewport when omitted. */
  readonly txLazyVisibleRoot = input<HTMLElement | null>(null);
  /** When true, content is shown immediately (e.g. small groups or the active theme). */
  readonly txLazyVisibleEager = input(false);
  /** IntersectionObserver root margin (smaller = less eager off-screen mounting). */
  readonly txLazyVisibleRootMargin = input('80px 0px 120px 0px');

  readonly visible = signal(false);

  constructor() {
    afterNextRender(() => {
      if (this.txLazyVisibleEager()) {
        this.visible.set(true);
        return;
      }

      this.attachWhenReady();
    });
  }

  private attachWhenReady(): void {
    if (this.visible()) {
      return;
    }

    const root = this.txLazyVisibleRoot();
    if (!root) {
      const frame = requestAnimationFrame(() => this.attachWhenReady());
      this.destroyRef.onDestroy(() => cancelAnimationFrame(frame));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            continue;
          }
          this.visible.set(true);
          observer.disconnect();
          return;
        }
      },
      {
        root,
        rootMargin: this.txLazyVisibleRootMargin(),
        threshold: 0,
      },
    );

    observer.observe(this.host.nativeElement);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }
}
