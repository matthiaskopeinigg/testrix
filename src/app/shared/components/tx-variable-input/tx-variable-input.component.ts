import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  forwardRef,
  HostListener,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';
import { TxTooltipService } from '@app/shared/components/tx-tooltip/tx-tooltip.service';
import {
  DYNAMIC_VARIABLES,
  findTemplateVariableSuggestions,
  formatDynamicVariablePlaceholderHint,
  formatDynamicVariableTooltip,
  highlightTemplateVariables,
  type DynamicVariableCatalogItem,
} from '@shared/dynamic-variables';

import {
  positionFixedCompletionPopup,
  scheduleFixedCompletionPosition,
  TX_COMPLETION_PLACEMENT_DEFAULT,
  type TxCompletionPlacement,
} from '../tx-completion-popup/tx-completion-popup-placement';

import { isSuggestTriggerKeydown } from '../tx-suggest-input/tx-suggest-input-keyboard';

import { caretIndexFromClientX } from './tx-variable-input-caret';
import { findLiteralValueSuggestions } from './tx-variable-input-literal-suggestions';
import {
  escapeVariableInputMaskHtml,
  maskVariableInputDisplay,
} from './tx-variable-input-mask';
import { TxVariableInputHighlightHtmlPipe } from './tx-variable-input-highlight-html.pipe';

@Component({
  selector: 'tx-variable-input',
  standalone: true,
  imports: [TxVariableInputHighlightHtmlPipe],
  templateUrl: './tx-variable-input.component.html',
  styleUrl: './tx-variable-input.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tx-variable-input-host',
  },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TxVariableInputComponent),
      multi: true,
    },
  ],
})
export class TxVariableInputComponent implements ControlValueAccessor {
  private static nextId = 0;
  private static readonly COMPLETION_GAP_PX = 4;

  readonly controlId = input('');
  readonly placeholder = input('');
  readonly disabled = input(false);
  readonly ariaLabel = input('');
  /**
   * When false, hovering an empty field does not show the dynamic-variable placeholder hint
   * (use a separate help control beside the label instead).
   */
  readonly showPlaceholderHint = input(false);
  /** Catalog used for `$` autocomplete; defaults to app-wide {@link DYNAMIC_VARIABLES}. */
  readonly catalog = input<readonly DynamicVariableCatalogItem[]>(DYNAMIC_VARIABLES);
  /** Fixed suggestion panel placement relative to the field. */
  readonly completionPlacement = input<TxCompletionPlacement>(TX_COMPLETION_PLACEMENT_DEFAULT);
  /**
   * Literal value suggestions (e.g. common header values for the row key).
   * Shown when `$` / `{{}}` completion is not active.
   */
  readonly valueSuggestions = input<readonly string[]>([]);
  /** When true, the value can be masked until {@link valueRevealed} is set. */
  readonly maskValue = input(false);
  /** When false with {@link maskValue}, displays asterisks instead of the raw value. */
  readonly valueRevealed = input(true);

  /** Emitted when the user clicks a highlighted `{{environment}}` placeholder. */
  readonly environmentVariableClick = output<{ readonly key: string }>();

  private readonly destroyRef = inject(DestroyRef);
  private readonly hostEl = inject(ElementRef<HTMLElement>);
  private readonly tooltips = inject(TxTooltipService);
  private readonly uiPreferences = inject(UiPreferencesService);
  private readonly nativeInput = viewChild<ElementRef<HTMLInputElement>>('nativeInput');
  private readonly completionPanel = viewChild<ElementRef<HTMLElement>>('completionPanel');

  constructor() {
    const onScroll = (): void => {
      if (this.completionOpen()) {
        this.positionCompletion();
      }
    };
    document.addEventListener('scroll', onScroll, { capture: true });
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      this.hideVariableTooltip();
      this.clearTokenHover();
    });
  }

  protected readonly autoId = `tx-variable-input-${TxVariableInputComponent.nextId++}`;
  protected readonly value = signal('');

  protected readonly highlightedHtml = computed(() => {
    if (this.maskValue() && !this.valueRevealed()) {
      return escapeVariableInputMaskHtml(maskVariableInputDisplay(this.value()));
    }
    return highlightTemplateVariables(this.value(), this.catalog());
  });

  protected readonly isValueMasked = computed(
    () => this.maskValue() && !this.valueRevealed(),
  );

  protected readonly completionOpen = signal(false);
  protected readonly completionPositioned = signal(false);
  protected readonly resolvedCompletionPlacement = signal<TxCompletionPlacement>(
    TX_COMPLETION_PLACEMENT_DEFAULT,
  );
  protected readonly completionItems = signal<readonly DynamicVariableCatalogItem[]>([]);
  protected readonly completionIndex = signal(0);

  private completionReplaceStart = 0;
  private completionReplaceEnd = 0;
  private tooltipAnchor: HTMLElement | null = null;

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  @HostListener('window:resize')
  onWindowResize(): void {
    if (this.completionOpen()) {
      this.positionCompletion();
    }
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(ev: MouseEvent): void {
    if (!this.completionOpen()) {
      return;
    }
    const target = ev.target as Node | null;
    if (target && this.hostEl.nativeElement.contains(target)) {
      return;
    }
    this.closeCompletion();
  }

  protected effectiveId(): string {
    return this.controlId().trim() || this.autoId;
  }

  protected handleInput(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const raw = inputEl.value;
    this.value.set(raw);
    this.onChange(raw);
    this.refreshCompletion(inputEl);
  }

  protected handleFocus(event: Event): void {
    this.refreshCompletion(event.target as HTMLInputElement);
  }

  protected handleBlur(): void {
    this.onTouched();
    this.closeCompletion();
    this.hideVariableTooltip();
    this.clearTokenHover();
  }

  protected handleScroll(): void {
    const inputEl = this.nativeInput()?.nativeElement;
    const mirror = this.hostEl.nativeElement.querySelector('.tx-variable-input__mirror');
    const hit = this.hostEl.nativeElement.querySelector('.tx-variable-input__hit');
    if (!inputEl) {
      return;
    }
    if (mirror instanceof HTMLElement) {
      mirror.scrollLeft = inputEl.scrollLeft;
    }
    if (hit instanceof HTMLElement) {
      hit.scrollLeft = inputEl.scrollLeft;
    }
  }

  protected handleFieldMouseEnter(ev: MouseEvent): void {
    if (!this.showPlaceholderHint() || !this.canShowTooltips() || this.value().trim() || this.disabled()) {
      return;
    }
    const target = ev.target as HTMLElement;
    if (this.findVariableSpan(target)) {
      return;
    }
    const field = this.hostEl.nativeElement.querySelector('.tx-variable-input__field');
    if (!(field instanceof HTMLElement)) {
      return;
    }
    this.tooltips.show(field, formatDynamicVariablePlaceholderHint(this.catalog()), 'top');
    this.tooltipAnchor = field;
  }

  protected handleFieldMouseLeave(ev: MouseEvent): void {
    const related = ev.relatedTarget as Node | null;
    if (related && this.hostEl.nativeElement.contains(related)) {
      return;
    }
    this.hideVariableTooltip();
    this.clearTokenHover();
  }

  protected handleHitPointerOver(ev: PointerEvent): void {
    if (this.isValueMasked()) {
      return;
    }
    const span = this.findVariableSpan(ev.target);
    if (!span || !this.canShowTooltips()) {
      return;
    }
    const varId = span.dataset['varId'] ?? '';
    const part = span.dataset['varPart'] === 'param' ? 'param' : 'token';
    if (!varId) {
      return;
    }
    this.setTokenHover(varId, part, true);
    this.tooltips.show(span, formatDynamicVariableTooltip(varId, this.catalog(), part), 'top');
    this.tooltipAnchor = span;
  }

  protected handleHitPointerOut(ev: PointerEvent): void {
    const span = this.findVariableSpan(ev.target);
    const related = ev.relatedTarget as HTMLElement | null;
    if (related && span?.contains(related)) {
      return;
    }
    if (related && this.findVariableSpan(related)) {
      return;
    }
    this.hideVariableTooltip();
    this.clearTokenHover();
  }

  protected handleHitPointerDown(ev: PointerEvent): void {
    if (this.isValueMasked()) {
      return;
    }
    const inputEl = this.nativeInput()?.nativeElement;
    if (!inputEl || this.disabled()) {
      return;
    }

    const span = this.findVariableSpan(ev.target);
    if (!span) {
      return;
    }

    const varId = span.dataset['varId'] ?? '';
    if (varId.startsWith('env:')) {
      ev.preventDefault();
      ev.stopPropagation();
      this.hideVariableTooltip();
      this.clearTokenHover();
      const key = varId.slice(4);
      if (key) {
        this.environmentVariableClick.emit({ key });
      }
      return;
    }

    ev.preventDefault();
    const caret = caretIndexFromClientX(inputEl, ev.clientX);
    inputEl.focus({ preventScroll: true });
    inputEl.setSelectionRange(caret, caret);
  }

  protected handleKeydown(ev: KeyboardEvent): void {
    if (this.disabled()) {
      return;
    }

    const inputEl = this.nativeInput()?.nativeElement;
    if (isSuggestTriggerKeydown(ev) && inputEl) {
      ev.preventDefault();
      this.refreshCompletion(inputEl);
      return;
    }

    if (this.completionOpen()) {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        this.closeCompletion();
        return;
      }
      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        const max = this.completionItems().length - 1;
        this.completionIndex.update((index) => Math.min(index + 1, max));
        return;
      }
      if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        this.completionIndex.update((index) => Math.max(index - 1, 0));
        return;
      }
      if (ev.key === 'Enter' || ev.key === 'Tab') {
        const item = this.completionItems()[this.completionIndex()];
        if (item) {
          ev.preventDefault();
          this.applyCompletion(item);
        }
        return;
      }
    }
  }

  protected applyCompletion(item: DynamicVariableCatalogItem): void {
    const inputEl = this.nativeInput()?.nativeElement;
    if (!inputEl) {
      return;
    }
    const current = this.value();
    const start = this.completionReplaceStart;
    const end = this.completionReplaceEnd;
    const next = current.slice(0, start) + item.insert + current.slice(end);
    this.value.set(next);
    this.onChange(next);
    const caretOffset = item.hasArgs ? 1 : 0;
    const caret = start + item.insert.length - caretOffset;
    queueMicrotask(() => {
      inputEl.focus({ preventScroll: true });
      inputEl.selectionStart = caret;
      inputEl.selectionEnd = caret;
    });
    this.closeCompletion();
  }

  writeValue(value: unknown): void {
    this.value.set(value == null ? '' : String(value));
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    void isDisabled;
  }

  private refreshCompletion(inputEl: HTMLInputElement): void {
    const templateResult = findTemplateVariableSuggestions(
      inputEl.value,
      inputEl.selectionStart ?? inputEl.value.length,
      this.catalog(),
    );
    const result =
      templateResult ??
      findLiteralValueSuggestions(inputEl.value, this.valueSuggestions());
    if (!result || result.items.length === 0) {
      this.closeCompletion();
      return;
    }
    this.openCompletion(result);
  }

  private openCompletion(result: {
    readonly context: { readonly replaceStart: number; readonly replaceEnd: number };
    readonly items: readonly DynamicVariableCatalogItem[];
  }): void {
    this.completionReplaceStart = result.context.replaceStart;
    this.completionReplaceEnd = result.context.replaceEnd;
    this.completionItems.set(result.items);
    this.completionIndex.set(0);
    this.completionPositioned.set(false);
    this.completionOpen.set(true);
    scheduleFixedCompletionPosition(() => {
      if (this.completionOpen()) {
        this.positionCompletion();
      }
    });
  }

  private positionCompletion(): void {
    const panelEl = this.completionPanel()?.nativeElement;
    const fieldEl = this.hostEl.nativeElement.querySelector('.tx-variable-input__field');
    const anchor =
      fieldEl instanceof HTMLElement
        ? fieldEl
        : this.nativeInput()?.nativeElement;
    if (!panelEl || !anchor) {
      return;
    }
    const resolved = positionFixedCompletionPopup({
      anchor,
      panel: panelEl,
      placement: this.completionPlacement(),
      gapPx: TxVariableInputComponent.COMPLETION_GAP_PX,
    });
    this.resolvedCompletionPlacement.set(resolved);
    this.completionPositioned.set(true);
  }

  private closeCompletion(): void {
    this.completionOpen.set(false);
    this.completionPositioned.set(false);
    this.completionItems.set([]);
    this.completionIndex.set(0);
  }

  private canShowTooltips(): boolean {
    return this.uiPreferences.showIconTooltips() && !this.disabled();
  }

  private hideVariableTooltip(): void {
    if (this.tooltipAnchor) {
      this.tooltips.hide(this.tooltipAnchor);
      this.tooltipAnchor = null;
    } else {
      this.tooltips.hideImmediate();
    }
  }

  private findVariableSpan(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof HTMLElement)) {
      return null;
    }
    return target.closest('.tx-var-token, .tx-var-param') as HTMLElement | null;
  }

  private setTokenHover(varId: string, part: 'token' | 'param', hovered: boolean): void {
    const selector = `[data-var-id="${varId}"][data-var-part="${part}"]`;
    this.hostEl.nativeElement
      .querySelectorAll(`.tx-variable-input__mirror ${selector}, .tx-variable-input__hit ${selector}`)
      .forEach((node: Element) => {
        node.classList.toggle('is-var-hovered', hovered);
      });
  }

  private clearTokenHover(): void {
    this.hostEl.nativeElement
      .querySelectorAll('.tx-var-token.is-var-hovered, .tx-var-param.is-var-hovered')
      .forEach((node: Element) => {
        node.classList.remove('is-var-hovered');
      });
  }
}
