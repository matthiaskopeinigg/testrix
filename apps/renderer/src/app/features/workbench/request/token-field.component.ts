import { OverlayModule, type ConnectedPosition } from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  booleanAttribute,
  computed,
  inject,
  input,
  numberAttribute,
  output,
  signal,
} from '@angular/core';
import { TxHintLayerService } from '@testrix/ui';

import {
  applyPlaceholderSuggestion,
  hasPlaceholderTokens,
  segmentAtOffset,
  suggestPlaceholders,
  tokenAtCaret,
  type PlaceholderSuggestion,
} from './placeholder-complete';
import { PLACEHOLDER_ORIGIN_HOST, placeholderOpenHint, shouldOpenPlaceholderOrigin } from './placeholder-origin';
import { PlaceholderHighlightComponent } from './placeholder-highlight.component';
import { PlaceholderSuggestComponent } from './placeholder-suggest.component';

const COMPLETE_POSITIONS: ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
];

@Component({
  selector: 'tx-token-field',
  standalone: true,
  imports: [OverlayModule, PlaceholderHighlightComponent, PlaceholderSuggestComponent],
  templateUrl: './token-field.component.html',
  styleUrl: './token-field.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.is-cell]': 'variant() === "cell"',
    '[class.is-code]': 'variant() === "code"',
    '[class.is-multiline]': 'multiline()',
    '[class.is-token-hover]': 'tokenHover()',
    '(document:mousedown)': 'handleDocumentDown($event)',
  },
})
export class TokenFieldComponent {
  readonly id = input('');
  readonly label = input<string | null>(null);
  readonly value = input('');
  readonly placeholder = input('');
  readonly type = input('text');
  readonly ariaLabel = input<string | null>(null);
  readonly multiline = input(false, { transform: booleanAttribute });
  readonly rows = input(3, { transform: numberAttribute });
  readonly readonly = input(false, { transform: booleanAttribute });
  readonly variant = input<'field' | 'cell' | 'code'>('field');
  readonly pathParams = input(false, { transform: booleanAttribute });
  readonly variables = input<readonly string[]>([]);
  readonly valueChange = output<string>();
  /** Fires on blur with the control's current text (for commit/normalize). */
  readonly valueCommit = output<string>();

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);
  private readonly originHost = inject(PLACEHOLDER_ORIGIN_HOST, { optional: true });
  private readonly hintLayer = inject(TxHintLayerService);
  private readonly hintId = `tx-token-field-${Math.random().toString(36).slice(2, 9)}`;
  private measureCanvas: HTMLCanvasElement | null = null;
  private pointerMoved = false;
  private pointerDownX = 0;
  private pointerDownY = 0;

  readonly completePositions = COMPLETE_POSITIONS;
  readonly completeOpen = signal(false);
  readonly completeIndex = signal(0);
  readonly completeOrigin = signal<HTMLElement | null>(null);
  readonly completeItems = signal<readonly PlaceholderSuggestion[]>([]);
  readonly completeOriginEl = computed(() => this.completeOrigin() ?? this.host.nativeElement);
  readonly hasTokens = computed(() =>
    this.type() !== 'password' &&
    hasPlaceholderTokens(this.value(), this.variables(), { pathParams: this.pathParams() }),
  );
  readonly controlAria = computed(() => this.ariaLabel() || this.label() || 'Value');
  readonly tokenHover = signal(false);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.hintLayer.hide(this.hintId));
  }

  handleInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement))
      return;
    this.valueChange.emit(target.value);
    if (this.readonly())
      return;
    this.refreshComplete(target, 'auto');
  }

  handleKey(event: KeyboardEvent): void {
    if (this.readonly())
      return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement))
      return;
    if ((event.ctrlKey || event.metaKey) && event.code === 'Space') {
      event.preventDefault();
      this.refreshComplete(target, 'force');
      return;
    }
    if (!this.completeOpen()) {
      if (
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowRight' ||
        event.key === 'Home' ||
        event.key === 'End'
      )
        queueMicrotask(() =>
          this.showHintAtOffset(target, target.selectionStart ?? target.value.length),
        );
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.moveComplete(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.moveComplete(-1);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeComplete();
      return;
    }
    if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault();
      const item = this.completeItems()[this.completeIndex()];
      if (item)
        this.applySuggestion(item);
      else
        this.closeComplete();
      return;
    }
    if (event.key === 'Enter' && !this.multiline()) {
      event.preventDefault();
      const item = this.completeItems()[this.completeIndex()];
      if (item)
        this.applySuggestion(item);
      else
        this.closeComplete();
    }
  }

  handlePointerDown(event: PointerEvent): void {
    if (event.button !== 0)
      return;
    this.pointerMoved = false;
    this.pointerDownX = event.clientX;
    this.pointerDownY = event.clientY;
  }

  handlePointerMove(event: PointerEvent): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement))
      return;
    if (event.buttons !== 0) {
      if (
        Math.abs(event.clientX - this.pointerDownX) > 3 ||
        Math.abs(event.clientY - this.pointerDownY) > 3
      )
        this.pointerMoved = true;
      return;
    }
    if (target.selectionStart !== target.selectionEnd) {
      this.tokenHover.set(false);
      this.hintLayer.hide(this.hintId);
      return;
    }
    const offset = offsetAtClientPoint(target, event.clientX, event.clientY, this.measureCtx());
    this.showHintAtOffset(target, offset);
  }

  handlePointerLeave(): void {
    this.tokenHover.set(false);
    this.hintLayer.hide(this.hintId);
  }

  handleClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement))
      return;
    if (this.pointerMoved || target.selectionStart !== target.selectionEnd)
      return;
    if (!shouldOpenPlaceholderOrigin(event))
      return;
    const offset = offsetAtClientPoint(target, event.clientX, event.clientY, this.measureCtx());
    const part = segmentAtOffset(target.value, offset, this.variables(), {
      pathParams: this.pathParams(),
      origins: this.originHost?.placeholderOrigins() ?? [],
    });
    if (!part?.clickable || !part.originKind)
      return;
    this.hintLayer.hide(this.hintId);
    this.originHost?.openPlaceholder({
      kind: part.originKind,
      name: part.originName ?? '',
      sourceId: part.sourceId ?? '',
      sourceName: part.sourceName ?? '',
    });
  }

  handleBlur(): void {
    this.tokenHover.set(false);
    this.hintLayer.hide(this.hintId);
    const el = this.host.nativeElement.querySelector('.tx-token-field__input');
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
      this.valueCommit.emit(el.value);
    else
      this.valueCommit.emit(this.value());
  }

  handleScroll(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement))
      return;
    const highlight = target.parentElement?.querySelector('tx-placeholder-highlight');
    if (highlight instanceof HTMLElement)
      highlight.scrollTop = target.scrollTop;
  }

  handleCompletePick(item: PlaceholderSuggestion): void {
    this.applySuggestion(item);
  }

  handleDocumentDown(event: Event): void {
    if (!this.completeOpen())
      return;
    const target = event.target;
    if (!(target instanceof Node))
      return;
    if (this.completeOrigin()?.contains(target))
      return;
    if (target instanceof Element && target.closest('.tx-placeholder-suggest'))
      return;
    this.closeComplete();
  }

  private showHintAtOffset(
    origin: HTMLInputElement | HTMLTextAreaElement,
    offset: number,
  ): void {
    const part = segmentAtOffset(origin.value, offset, this.variables(), {
      pathParams: this.pathParams(),
      origins: this.originHost?.placeholderOrigins() ?? [],
    });
    if (!part || part.kind === 'text' || !part.hint) {
      this.tokenHover.set(false);
      this.hintLayer.hide(this.hintId);
      return;
    }
    this.tokenHover.set(part.clickable === true);
    const detail = part.clickable ? placeholderOpenHint(part.hint) : part.hint;
    this.hintLayer.showFor(this.hintId, `${part.text} — ${detail}`, origin, 'top');
  }

  private measureCtx(): CanvasRenderingContext2D | null {
    if (!this.measureCanvas)
      this.measureCanvas = document.createElement('canvas');
    return this.measureCanvas.getContext('2d');
  }

  private refreshComplete(
    origin: HTMLInputElement | HTMLTextAreaElement,
    mode: 'auto' | 'force',
  ): void {
    const token = tokenAtCaret(origin.value, origin.selectionStart ?? origin.value.length);
    if (mode === 'auto' && token.kind === 'none') {
      this.closeComplete();
      return;
    }
    const items = suggestPlaceholders(
      origin.value,
      origin.selectionStart ?? origin.value.length,
      this.variables(),
    );
    if (items.length === 0) {
      this.closeComplete();
      return;
    }
    const wasOpen = this.completeOpen();
    this.completeItems.set(items);
    this.completeIndex.set(wasOpen ? Math.min(this.completeIndex(), items.length - 1) : 0);
    this.completeOrigin.set(origin);
    this.completeOpen.set(true);
  }

  private moveComplete(delta: number): void {
    const count = this.completeItems().length;
    if (count === 0)
      return;
    this.completeIndex.set((this.completeIndex() + delta + count) % count);
  }

  private applySuggestion(item: PlaceholderSuggestion): void {
    const origin = this.completeOrigin();
    if (!(origin instanceof HTMLInputElement) && !(origin instanceof HTMLTextAreaElement)) {
      this.closeComplete();
      return;
    }
    const applied = applyPlaceholderSuggestion(
      origin.value,
      origin.selectionStart ?? origin.value.length,
      item.insert,
    );
    this.valueChange.emit(applied.value);
    this.closeComplete();
    afterNextRender(
      () => {
        origin.focus();
        origin.setSelectionRange(applied.cursor, applied.cursor);
      },
      { injector: this.injector },
    );
  }

  private closeComplete(): void {
    this.completeOpen.set(false);
    this.completeOrigin.set(null);
  }
}

/** Maps a pointer position to a character offset using the control's font metrics. */
function offsetAtClientPoint(
  el: HTMLInputElement | HTMLTextAreaElement,
  clientX: number,
  clientY: number,
  ctx: CanvasRenderingContext2D | null,
): number {
  if (!(el instanceof HTMLInputElement) || !ctx)
    return el.selectionStart ?? el.value.length;

  const style = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
  const x = clientX - rect.left - paddingLeft + el.scrollLeft;
  ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`.trim();
  const value = el.value;
  let lo = 0;
  let hi = value.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(value.slice(0, mid)).width <= x)
      lo = mid;
    else
      hi = mid - 1;
  }
  return lo;
}
