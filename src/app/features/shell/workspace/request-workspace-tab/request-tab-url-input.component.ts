import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  forwardRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';
import { TxTooltipService } from '@app/shared/components/tx-tooltip/tx-tooltip.service';
import { TxVariableInputHighlightHtmlPipe } from '@app/shared/components/tx-variable-input/tx-variable-input-highlight-html.pipe';
import { caretIndexFromClientX } from '@app/shared/components/tx-variable-input/tx-variable-input-caret';
import type { CollectionRequestPathParam } from '@shared/config';
import { highlightRequestUrlDisplay } from '@shared/config';
import {
  DYNAMIC_VARIABLES,
  findTemplateVariableSuggestions,
  formatDynamicVariablePlaceholderHint,
  formatDynamicVariableTooltip,
  type DynamicVariableCatalogItem,
} from '@shared/dynamic-variables';

@Component({
  selector: 'app-request-tab-url-input',
  standalone: true,
  imports: [TxVariableInputHighlightHtmlPipe],
  templateUrl: './request-tab-url-input.component.html',
  styleUrl: './request-tab-url-input.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'request-tab-url-input-host',
  },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => RequestTabUrlInputComponent),
      multi: true,
    },
  ],
})
export class RequestTabUrlInputComponent implements ControlValueAccessor {
  private static nextId = 0;

  readonly controlId = input('');
  readonly placeholder = input('https://api.example.com/:id');
  readonly disabled = input(false);
  readonly pathParams = input<readonly CollectionRequestPathParam[]>([]);
  readonly catalog = input<readonly DynamicVariableCatalogItem[]>(DYNAMIC_VARIABLES);

  readonly environmentVariableClick = output<{ readonly key: string }>();

  /** Fired when Enter is pressed and variable completion is not active. */
  readonly sendRequest = output<void>();

  private readonly hostEl = inject(ElementRef<HTMLElement>);
  private readonly tooltips = inject(TxTooltipService);
  private readonly uiPreferences = inject(UiPreferencesService);
  private readonly nativeInput = viewChild<ElementRef<HTMLInputElement>>('nativeInput');

  protected readonly autoId = `request-tab-url-${RequestTabUrlInputComponent.nextId++}`;
  protected readonly value = signal('');

  /** Highlight from URL text only; path param values are resolved on hover (avoids mirror refresh while typing). */
  protected readonly highlightedHtml = computed(() =>
    highlightRequestUrlDisplay(this.value(), this.pathParams(), this.catalog()),
  );

  protected readonly completionOpen = signal(false);
  protected readonly completionItems = signal<readonly DynamicVariableCatalogItem[]>([]);
  protected readonly completionIndex = signal(0);

  private completionReplaceStart = 0;
  private completionReplaceEnd = 0;
  private tooltipAnchor: HTMLElement | null = null;
  private isFocused = false;
  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  protected effectiveId(): string {
    return this.controlId().trim() || this.autoId;
  }

  protected handleInput(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const next = inputEl.value;
    this.value.set(next);
    this.onChange(next);
    this.updateCompletion(next, inputEl.selectionStart ?? next.length);
    queueMicrotask(() => this.syncMirrorScroll());
  }

  protected handleFocus(): void {
    this.isFocused = true;
  }

  protected handleScroll(): void {
    this.syncMirrorScroll();
  }

  protected handleBlur(): void {
    this.isFocused = false;
    this.onTouched();
    this.closeCompletion();
    this.hideTooltip();
    this.syncNativeInputValue(this.value());
  }

  protected handleFieldMouseEnter(ev: MouseEvent): void {
    if (!this.canShowTooltips() || this.value().trim() || this.disabled()) {
      return;
    }
    const target = ev.target as HTMLElement;
    if (target.closest('.tx-url-path-param, .tx-var-token')) {
      return;
    }
    const field = this.hostEl.nativeElement.querySelector('.request-tab-url-input__field');
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
    this.hideTooltip();
  }

  protected handleHitPointerOver(ev: PointerEvent): void {
    if (!this.canShowTooltips()) {
      return;
    }
    const pathSpan = (ev.target as HTMLElement).closest<HTMLElement>('.tx-url-path-param');
    if (pathSpan) {
      const key = pathSpan.dataset['pathKey'] ?? '';
      const row = this.pathParams().find((p) => p.key === key);
      const val = row?.value?.trim() ?? '';
      const text = val ? `:${key} → ${val}` : `:${key} (no value)`;
      this.tooltips.show(pathSpan, text, 'top');
      this.tooltipAnchor = pathSpan;
      this.setPathParamHover(key, true);
      return;
    }
    const varSpan = (ev.target as HTMLElement).closest<HTMLElement>('[data-var-id]');
    if (varSpan) {
      const varId = varSpan.dataset['varId'] ?? '';
      const part = varSpan.dataset['varPart'] === 'param' ? 'param' : 'token';
      if (varId) {
        this.tooltips.show(varSpan, formatDynamicVariableTooltip(varId, this.catalog(), part), 'top');
        this.tooltipAnchor = varSpan;
      }
    }
  }

  protected handleHitPointerOut(ev: PointerEvent): void {
    const related = ev.relatedTarget as HTMLElement | null;
    if (related?.closest('.tx-url-path-param, [data-var-id]')) {
      return;
    }
    this.clearPathParamHover();
    this.hideTooltip();
  }

  protected handleControlClick(): void {
    this.nativeInput()?.nativeElement.focus({ preventScroll: true });
  }

  protected handleHitPointerDown(ev: PointerEvent): void {
    const inputEl = this.nativeInput()?.nativeElement;
    if (!inputEl || this.disabled()) {
      return;
    }
    const envSpan = (ev.target as HTMLElement).closest<HTMLElement>('[data-var-id^="env:"]');
    if (envSpan) {
      const varId = envSpan.dataset['varId'] ?? '';
      if (varId.startsWith('env:')) {
        ev.preventDefault();
        ev.stopPropagation();
        const key = varId.slice(4);
        if (key) {
          this.environmentVariableClick.emit({ key });
        }
        return;
      }
    }

    const token = (ev.target as HTMLElement).closest('.tx-url-path-param, [data-var-id]');
    if (!token) {
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
    if (this.completionOpen()) {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        this.closeCompletion();
        return;
      }
      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        const max = this.completionItems().length - 1;
        this.completionIndex.update((i) => Math.min(i + 1, max));
        return;
      }
      if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        this.completionIndex.update((i) => Math.max(i - 1, 0));
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

    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      this.sendRequest.emit();
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
    this.syncNativeInputValue(next);
    this.onChange(next);
    const caretOffset = item.hasArgs ? 1 : 0;
    const caret = start + item.insert.length - caretOffset;
    queueMicrotask(() => {
      inputEl.focus({ preventScroll: true });
      inputEl.setSelectionRange(caret, caret);
      this.syncMirrorScroll();
    });
    this.closeCompletion();
  }

  writeValue(value: string | null): void {
    const next = value ?? '';
    if (next === this.value()) {
      return;
    }
    this.value.set(next);
    if (!this.isFocused) {
      this.syncNativeInputValue(next);
    }
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

  private updateCompletion(value: string, caret: number): void {
    const result = findTemplateVariableSuggestions(value, caret, this.catalog());
    if (!result || result.items.length === 0) {
      this.closeCompletion();
      return;
    }
    this.completionReplaceStart = result.context.replaceStart;
    this.completionReplaceEnd = result.context.replaceEnd;
    this.completionItems.set(result.items);
    this.completionIndex.set(0);
    this.completionOpen.set(true);
  }

  private closeCompletion(): void {
    this.completionOpen.set(false);
    this.completionItems.set([]);
  }

  /** Keeps DOM value in sync without Angular `[value]` rebinding (preserves caret while typing). */
  private syncNativeInputValue(next: string): void {
    const inputEl = this.nativeInput()?.nativeElement;
    if (!inputEl || inputEl.value === next) {
      return;
    }
    const start = inputEl.selectionStart;
    const end = inputEl.selectionEnd;
    inputEl.value = next;
    if (this.isFocused && start !== null && end !== null) {
      const caret = Math.min(start, next.length);
      inputEl.setSelectionRange(caret, Math.min(end, next.length));
    }
  }

  private syncMirrorScroll(): void {
    const inputEl = this.nativeInput()?.nativeElement;
    if (!inputEl) {
      return;
    }
    const scrollLeft = inputEl.scrollLeft;
    const mirrors = this.hostEl.nativeElement.querySelectorAll(
      '.request-tab-url-input__mirror code, .request-tab-url-input__hit code',
    );
    for (const el of mirrors) {
      if (!(el instanceof HTMLElement)) {
        continue;
      }
      el.scrollLeft = scrollLeft;
    }
  }

  private setPathParamHover(key: string, hovered: boolean): void {
    const selector = `.tx-url-path-param[data-path-key="${key}"]`;
    this.hostEl.nativeElement
      .querySelectorAll(
        `.request-tab-url-input__mirror ${selector}, .request-tab-url-input__hit ${selector}`,
      )
      .forEach((node: Element) => {
        node.classList.toggle('tx-url-path-param--hover', hovered);
      });
  }

  private clearPathParamHover(): void {
    this.hostEl.nativeElement
      .querySelectorAll('.tx-url-path-param--hover')
      .forEach((node: Element) => {
        node.classList.remove('tx-url-path-param--hover');
      });
  }

  private hideTooltip(): void {
    if (this.tooltipAnchor) {
      this.tooltips.hide(this.tooltipAnchor);
      this.tooltipAnchor = null;
    }
  }

  private canShowTooltips(): boolean {
    return this.uiPreferences.showIconTooltips();
  }
}
