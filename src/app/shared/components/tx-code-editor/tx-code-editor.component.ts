import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { createDefaultEditorKeyboardSettings } from '@shared/config';

import { ConfigService } from '@app/core/config/config.service';
import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';
import { TxTooltipService } from '@app/shared/components/tx-tooltip/tx-tooltip.service';
import {
  findTemplateVariableSuggestions,
  formatDynamicVariablePlaceholderHint,
  formatDynamicVariableTooltip,
  normalizeTemplateVariableInsert,
  type DynamicVariableCatalogItem,
} from '@shared/dynamic-variables';

import { TxIconComponent } from '../tx-icon/tx-icon.component';
import {
  filterTxCodeEditorCompletions,
  txCodeEditorCompletionContext,
} from './tx-code-editor-completion.logic';
import {
  TX_CODE_EDITOR_JSON_SNIPPETS,
  type TxCodeEditorCompletionItem,
} from './tx-code-editor-completion';
import {
  TX_CODE_EDITOR_HTML_SNIPPETS,
  TX_CODE_EDITOR_XML_SNIPPETS,
} from './tx-code-editor-markup-snippets';
import {
  resolveTxCodeEditorAutoClose,
  resolveTxCodeEditorAutoCloseBackspace,
} from './tx-code-editor-auto-close';
import {
  resolveTxCodeEditorSmartEditWithModifiers,
  shouldOfferJsonClosingQuote,
} from './tx-code-editor-smart-edit';
import {
  dynamicCatalogToCompletionItems,
  mergeCodeEditorCompletionCatalogs,
} from './tx-code-editor-template-variables';
import {
  TX_CODE_EDITOR_JS_SNIPPETS,
  TX_CODE_EDITOR_PM_COMPLETIONS,
} from './tx-code-editor-pm-completions';
import { tryFormatCodeEditorContent } from './tx-code-editor-format';
import {
  buildTxCodeEditorFoldedDisplay,
  extractTxCodeEditorFoldHidden,
  findCollapsedFoldRegionAtPlaceholderLine,
  findTxCodeEditorFoldRegions,
  txCodeEditorLineIndexAtClientY,
  type TxCodeEditorFoldRegion,
} from './tx-code-editor-folding';
import { highlightCodeEditorContent } from './tx-code-editor-highlight';
import {
  txCodeEditorLanguageLabel,
  txCodeEditorSupportsAutoFormat,
  type TxCodeEditorLanguage,
} from './tx-code-editor-language';
import {
  resolveTxCodeEditorShortcut,
  txCodeEditorCopyLineText,
  txCodeEditorCutLines,
  txCodeEditorDeleteLines,
  txCodeEditorDuplicateLines,
  txCodeEditorGetSelection,
  txCodeEditorIndentLines,
  txCodeEditorOutdentLines,
  txCodeEditorReplaceRange,
  txCodeEditorSelectedText,
  txCodeEditorSnapshot,
  txCodeEditorToggleLineComments,
  type TxCodeEditorEditResult,
  type TxCodeEditorShortcutAction,
} from './tx-code-editor-keyboard';
import { TxCodeEditorSanitizeHtmlPipe } from './tx-code-editor-sanitize-html.pipe';
import { TxCodeEditorUndoStack, type TxCodeEditorUndoSnapshot } from './tx-code-editor-undo';

@Component({
  selector: 'tx-code-editor',
  standalone: true,
  imports: [TxIconComponent, TxCodeEditorSanitizeHtmlPipe],
  templateUrl: './tx-code-editor.component.html',
  styleUrl: './tx-code-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.tx-code-editor-host--template-vars]': 'templateVarsActive()',
    '[class.tx-code-editor-host--folding]': 'codeFolding()',
    '[class.tx-code-editor-host--fill]': 'fillHeight()',
  },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TxCodeEditorComponent),
      multi: true,
    },
  ],
})
export class TxCodeEditorComponent implements ControlValueAccessor, AfterViewInit {
  private readonly config = inject(ConfigService);
  private readonly hostRef = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly tooltips = inject(TxTooltipService);
  private readonly uiPreferences = inject(UiPreferencesService);

  private readonly textareaRef = viewChild<ElementRef<HTMLTextAreaElement>>('textarea');

  readonly language = input<TxCodeEditorLanguage>('json');
  /** One-way bound text (e.g. read-only response previews). When set, overrides FormControl / ngModel writes. */
  readonly content = input<string | undefined>(undefined);
  readonly title = input('');
  readonly readOnly = input(false);
  readonly hideToolbar = input(false);
  /** Hides Format / Copy while keeping the language badge row. */
  readonly hideToolbarActions = input(false);
  /** Shows Format in the toolbar when toolbar actions are hidden (e.g. request body editor). */
  readonly showFormatAction = input(false);
  /** Overrides the toolbar language badge (e.g. "Javascript" instead of "JS"). */
  readonly languageBadgeLabel = input<string | undefined>(undefined);
  readonly hideLineNumbers = input(false);
  readonly framed = input(false);
  /** When true, expands to fill a flex/grid parent (e.g. dev tool or request body pane). */
  readonly fillHeight = input(false);
  readonly autoFormat = input(true);
  /** Pretty-print immediately after paste (independent of debounced {@link autoFormat}). */
  readonly formatOnPaste = input(true);
  readonly overlaySyntaxHighlight = input(true);
  readonly jsonSnippetAutocomplete = input<boolean | undefined>(undefined);
  /** Enables Ctrl+Space and trigger-based suggestions (JSON / JS). */
  readonly autocomplete = input<boolean | undefined>(undefined);
  /** Postman-style `pm.*` and JS snippets when language is `js`. */
  readonly jsAutocomplete = input<boolean | undefined>(undefined);
  /** Merged after built-in catalog rows (e.g. folder variable names). */
  readonly extraCompletionItems = input<readonly TxCodeEditorCompletionItem[]>([]);
  /** `$` and `{{environment}}` catalog for highlight + autocomplete. */
  readonly variableCatalog = input<readonly DynamicVariableCatalogItem[]>([]);
  readonly templateVariableAutocomplete = input<boolean | undefined>(undefined);
  readonly autoClose = input<boolean | undefined>(undefined);
  readonly smartEditing = input<boolean | undefined>(undefined);
  readonly markupSnippetAutocomplete = input<boolean | undefined>(undefined);
  /** Enables gutter chevrons to collapse multiline `{` / `[` blocks (JSON and brace languages). */
  readonly codeFolding = input(false);
  readonly showVariablePlaceholderHint = input(false);
  readonly placeholder = input('');
  /** VS Code–style shortcuts (copy, cut, paste, undo, Tab indent, Ctrl+/ comment, …). Overrides settings when set. */
  readonly keyboardShortcuts = input<boolean | undefined>(undefined);
  readonly ariaLabel = input('');

  private readonly editorKeyboard = computed(() => ({
    ...createDefaultEditorKeyboardSettings(),
    ...this.config.settings()?.editor.keyboard,
  }));
  protected readonly shortcutsActive = computed(
    () => this.keyboardShortcuts() ?? this.editorKeyboard().shortcutsEnabled,
  );
  protected readonly autocompleteActive = computed(
    () => this.autocomplete() ?? this.editorKeyboard().autocompleteEnabled,
  );
  protected readonly jsAutocompleteActive = computed(
    () => this.jsAutocomplete() ?? this.editorKeyboard().jsAutocompleteEnabled,
  );
  protected readonly jsonSnippetAutocompleteActive = computed(
    () => this.jsonSnippetAutocomplete() ?? this.editorKeyboard().jsonSnippetAutocomplete,
  );
  protected readonly autocompleteOnDotActive = computed(
    () => this.editorKeyboard().autocompleteOnDot,
  );
  protected readonly autoCloseActive = computed(
    () => this.autoClose() ?? this.editorKeyboard().autoCloseEnabled,
  );
  protected readonly smartEditingActive = computed(
    () => this.smartEditing() ?? this.editorKeyboard().smartEditingEnabled,
  );
  protected readonly markupSnippetAutocompleteActive = computed(
    () => this.markupSnippetAutocomplete() ?? this.editorKeyboard().markupSnippetAutocomplete,
  );
  protected readonly templateVariableAutocompleteActive = computed(() => {
    const master = this.autocomplete() ?? this.editorKeyboard().autocompleteEnabled;
    const feature =
      this.templateVariableAutocomplete() ?? this.editorKeyboard().templateVariableAutocomplete;
    return master && feature;
  });
  protected readonly jsonClosingQuoteSuggestActive = computed(() => {
    const master = this.autocomplete() ?? this.editorKeyboard().autocompleteEnabled;
    return master && this.editorKeyboard().jsonClosingQuoteSuggest;
  });
  protected readonly templateVarsActive = computed(
    () => this.variableCatalog().length > 0 && this.overlaySyntaxHighlight(),
  );
  protected readonly foldingHitLayerActive = computed(
    () => this.codeFolding() && this.collapsedFoldIds().size > 0 && this.overlaySyntaxHighlight(),
  );
  protected readonly hitLayerActive = computed(
    () => this.templateVarsActive() || this.foldingHitLayerActive(),
  );

  readonly blurred = output<void>();
  readonly environmentVariableClick = output<{ readonly key: string }>();

  protected readonly innerValue = signal('');
  /** Full document text (unfolded); emitted via ControlValueAccessor. */
  private readonly canonicalValue = signal('');
  private readonly collapsedFoldIds = signal<ReadonlySet<string>>(new Set());
  private readonly foldHiddenById = signal<ReadonlyMap<string, string>>(new Map());
  protected readonly highlightedHtml = signal('');
  protected readonly lineNumbers = signal<number[]>([1]);
  protected readonly foldRegions = computed(() =>
    this.codeFolding()
      ? findTxCodeEditorFoldRegions(this.canonicalValue(), this.language())
      : [],
  );
  protected readonly foldRegionsByStartLine = computed(() => {
    const map = new Map<number, TxCodeEditorFoldRegion>();
    for (const region of this.foldRegions()) {
      map.set(region.startLine, region);
    }
    return map;
  });
  protected readonly completionOpen = signal(false);
  protected readonly completionItems = signal<readonly TxCodeEditorCompletionItem[]>([]);
  protected readonly completionIndex = signal(0);

  protected readonly languageBadge = computed(() => {
    const override = this.languageBadgeLabel()?.trim();
    return override ? override : txCodeEditorLanguageLabel(this.language());
  });
  protected readonly toolbarAriaLabel = computed(() =>
    this.title() ? `${this.title()} tools` : 'Editor tools',
  );
  protected readonly showPlaceholder = computed(
    () => !this.readOnly() && !this.innerValue().length && !!this.placeholder().trim(),
  );
  protected readonly completionPanelLabel = computed(() => {
    const lang = this.language();
    if (lang === 'js') {
      return 'JavaScript suggestions';
    }
    if (lang === 'json') {
      return 'JSON suggestions';
    }
    return 'Suggestions';
  });

  private completionReplaceStart = 0;
  private completionReplaceEnd = 0;
  private completionFromTemplateVars = false;
  private completionAllowEmptyPrefix = false;
  private tooltipAnchor: HTMLElement | null = null;
  private autoFormatTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly autoFormatDebounceMs = 420;
  private pendingFormatOnPaste = false;
  private readonly undoStack = new TxCodeEditorUndoStack();
  private pendingUndoSnapshot: TxCodeEditorUndoSnapshot | null = null;
  private applyingHistory = false;
  private fillSlotResizeObserver: ResizeObserver | null = null;
  private fillSlotResizeFrame: number | null = null;
  private lastFillSlotHostPx = -1;
  private lastFillSlotBodyPx = -1;

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  constructor() {
    effect(() => {
      const lang = this.language();
      const text = this.innerValue();
      const collapsedIds = this.collapsedFoldIds();
      const foldCtx =
        this.codeFolding() && collapsedIds.size > 0
          ? {
              canonical: this.canonicalValue(),
              collapsedIds,
              regions: this.foldRegions(),
            }
          : undefined;
      this.highlightedHtml.set(highlightCodeEditorContent(text, lang, this.variableCatalog(), foldCtx));
      const count = Math.max(1, text.split('\n').length);
      this.lineNumbers.set(Array.from({ length: count }, () => 0));
    });

    effect(() => {
      const bound = this.content();
      if (bound === undefined) {
        return;
      }
      this.applyExternalContent(bound);
    });

    effect(() => {
      if (!this.fillHeight()) {
        this.teardownFillSlotLayout();
        return;
      }
      queueMicrotask(() => this.bindFillSlotLayout());
    });

    effect(() => {
      this.completionOpen();
      if (this.fillHeight()) {
        queueMicrotask(() => this.syncFillSlotLayout());
      }
    });

    this.destroyRef.onDestroy(() => {
      this.hideVariableTooltip();
      this.teardownFillSlotLayout();
    });
  }

  private findFillSlotRoot(): HTMLElement | null {
    let el: HTMLElement | null = this.hostRef.nativeElement.parentElement;
    while (el) {
      if (el.classList.contains('dev-tool-tab__body')) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  private findWorkspaceTabPanel(): HTMLElement | null {
    let el: HTMLElement | null = this.hostRef.nativeElement;
    while (el) {
      if (
        el.classList.contains('workspace-editor__tab-panel') &&
        el.classList.contains('workspace-editor__tab-panel--active')
      ) {
        return el;
      }
      el = el.parentElement;
    }
    el = this.hostRef.nativeElement;
    while (el) {
      if (el.classList.contains('workspace-editor__tab-panel')) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  private computeFillSlotHeights(
    host: HTMLElement,
    root: HTMLElement,
  ): { slotHeight: number; bodyHeight: number } {
    const toolbar = root.querySelector('.tx-code-editor__toolbar');
    const toolbarHeight = toolbar instanceof HTMLElement ? toolbar.offsetHeight : 0;
    const completion = root.querySelector('.tx-code-editor__completion');
    const completionHeight = completion instanceof HTMLElement ? completion.offsetHeight : 0;

    const editorHost = host.parentElement;
    const tabPanel = this.findWorkspaceTabPanel();
    if (editorHost instanceof HTMLElement && tabPanel) {
      const panelRect = tabPanel.getBoundingClientRect();
      const editorHostRect = editorHost.getBoundingClientRect();
      const padBottom = parseFloat(getComputedStyle(tabPanel).paddingBottom) || 0;
      const slotHeight = Math.max(0, Math.floor(panelRect.bottom - editorHostRect.top - padBottom));
      return {
        slotHeight,
        bodyHeight: Math.max(0, slotHeight - toolbarHeight - completionHeight),
      };
    }

    const slotRoot = this.findFillSlotRoot();
    if (!slotRoot) {
      return { slotHeight: 0, bodyHeight: 0 };
    }
    const statStrip = slotRoot.querySelector('app-dev-tool-stat-strip');
    const statHeight = statStrip instanceof HTMLElement ? statStrip.offsetHeight : 0;
    const slotStyle = getComputedStyle(slotRoot);
    const rowGap = parseFloat(slotStyle.rowGap || slotStyle.gap || '0') || 0;
    const slotHeight = Math.max(0, slotRoot.clientHeight - statHeight - rowGap);
    return {
      slotHeight,
      bodyHeight: Math.max(0, slotHeight - toolbarHeight - completionHeight),
    };
  }

  private teardownFillSlotLayout(): void {
    if (this.fillSlotResizeFrame !== null) {
      cancelAnimationFrame(this.fillSlotResizeFrame);
      this.fillSlotResizeFrame = null;
    }
    this.fillSlotResizeObserver?.disconnect();
    this.fillSlotResizeObserver = null;
    this.lastFillSlotHostPx = -1;
    this.lastFillSlotBodyPx = -1;
    const host = this.hostRef.nativeElement;
    host.style.removeProperty('height');
    host.style.removeProperty('max-height');
    const root = host.querySelector('.tx-code-editor');
    const body = root?.querySelector('.tx-code-editor__body');
    if (root instanceof HTMLElement) {
      root.style.removeProperty('height');
    }
    if (body instanceof HTMLElement) {
      body.style.removeProperty('height');
    }
  }

  /** Observe the workspace tab panel — stable pane height, not shrinking editor-host. */
  private bindFillSlotLayout(): void {
    if (!this.fillHeight()) {
      this.teardownFillSlotLayout();
      return;
    }
    const observeTarget = this.findWorkspaceTabPanel() ?? this.findFillSlotRoot();
    if (!observeTarget) {
      return;
    }

    const schedule = (): void => {
      if (this.fillSlotResizeFrame !== null) {
        return;
      }
      this.fillSlotResizeFrame = requestAnimationFrame(() => {
        this.fillSlotResizeFrame = null;
        this.syncFillSlotLayout();
      });
    };

    this.fillSlotResizeObserver?.disconnect();
    this.fillSlotResizeObserver = new ResizeObserver(() => schedule());
    this.fillSlotResizeObserver.observe(observeTarget);
    schedule();
  }

  private syncFillSlotLayout(): void {
    if (!this.fillHeight()) {
      return;
    }

    const host = this.hostRef.nativeElement;
    const root = host.querySelector('.tx-code-editor');
    const body = root?.querySelector('.tx-code-editor__body');
    if (!(root instanceof HTMLElement) || !(body instanceof HTMLElement)) {
      return;
    }

    const { slotHeight, bodyHeight } = this.computeFillSlotHeights(host, root);

    if (slotHeight === this.lastFillSlotHostPx && bodyHeight === this.lastFillSlotBodyPx) {
      return;
    }
    this.lastFillSlotHostPx = slotHeight;
    this.lastFillSlotBodyPx = bodyHeight;

    host.style.height = `${slotHeight}px`;
    host.style.maxHeight = `${slotHeight}px`;
    root.style.height = `${slotHeight}px`;
    body.style.height = `${bodyHeight}px`;

    requestAnimationFrame(() => this.handleScroll());
  }

  private applyExternalContent(next: string): void {
    if (next === this.canonicalValue()) {
      return;
    }
    this.clearFoldState();
    this.canonicalValue.set(next);
    this.innerValue.set(next);
    queueMicrotask(() => this.syncTextareaDom());
  }

  ngAfterViewInit(): void {
    queueMicrotask(() => {
      this.syncTextareaDom();
      this.bindFillSlotLayout();
    });
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(ev: MouseEvent): void {
    if (!this.completionOpen()) {
      return;
    }
    const target = ev.target as Node | null;
    if (target && this.hostRef.nativeElement.contains(target)) {
      return;
    }
    this.closeCompletion();
  }

  writeValue(value: unknown): void {
    if (this.content() !== undefined) {
      return;
    }
    const next = value == null ? '' : String(value);
    if (next !== this.canonicalValue()) {
      this.undoStack.clear();
      this.pendingUndoSnapshot = null;
      this.clearFoldState();
    }
    this.canonicalValue.set(next);
    this.innerValue.set(next);
    queueMicrotask(() => this.syncTextareaDom());
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

  protected handleInput(event: Event): void {
    const ta = event.target as HTMLTextAreaElement;
    if (this.collapsedFoldIds().size > 0) {
      this.expandAllFoldsToDisplay();
      const next = ta.value;
      if (next !== this.canonicalValue()) {
        if (!this.applyingHistory && this.pendingUndoSnapshot) {
          this.undoStack.record(this.pendingUndoSnapshot);
          this.pendingUndoSnapshot = null;
        }
        this.emitContentChange(next);
        if (this.pendingFormatOnPaste) {
          this.pendingFormatOnPaste = false;
          this.clearAutoFormatTimer();
          queueMicrotask(() => this.handleFormat());
        } else {
          this.scheduleAutoFormat();
        }
      }
      return;
    }
    const next = ta.value;
    if (!this.applyingHistory && this.pendingUndoSnapshot) {
      this.undoStack.record(this.pendingUndoSnapshot);
      this.pendingUndoSnapshot = null;
    }
    this.emitContentChange(next);
    if (this.pendingFormatOnPaste) {
      this.pendingFormatOnPaste = false;
      this.clearAutoFormatTimer();
      queueMicrotask(() => this.handleFormat());
      return;
    }
    this.scheduleAutoFormat();
    if (this.completionOpen()) {
      this.refreshCompletionFilter();
    } else {
      this.maybeOpenTemplateVariableAutocomplete(ta.selectionStart);
      if (!this.completionOpen()) {
        this.maybeSuggestJsonClosingQuote(ta.selectionStart);
      }
      if (!this.completionOpen()) {
        this.maybeOpenAutocompleteOnInput(event);
      }
    }
  }

  protected handleBlur(): void {
    this.onTouched();
    this.blurred.emit();
    this.closeCompletion();
    this.hideVariableTooltip();
    this.tryFormatOnBlur();
  }

  protected handlePaste(_event: ClipboardEvent): void {
    if (this.readOnly() || !this.formatOnPaste() || !txCodeEditorSupportsAutoFormat(this.language())) {
      return;
    }
    const ta = this.textareaRef()?.nativeElement;
    if (ta && !this.applyingHistory) {
      this.pendingUndoSnapshot = txCodeEditorSnapshot(this.innerValue(), ta);
    }
    this.pendingFormatOnPaste = true;
  }

  protected handleFieldMouseEnter(ev: MouseEvent): void {
    if (
      !this.showVariablePlaceholderHint() ||
      !this.canShowTooltips() ||
      this.innerValue().trim() ||
      this.readOnly()
    ) {
      return;
    }
    const target = ev.target as HTMLElement;
    if (this.findVariableSpan(target)) {
      return;
    }
    const field = this.hostRef.nativeElement.querySelector('.tx-code-editor__field');
    if (!(field instanceof HTMLElement)) {
      return;
    }
    this.tooltips.show(field, formatDynamicVariablePlaceholderHint(this.variableCatalog()), 'top');
    this.tooltipAnchor = field;
  }

  protected handleFieldMouseLeave(ev: MouseEvent): void {
    const related = ev.relatedTarget as Node | null;
    if (related && this.hostRef.nativeElement.contains(related)) {
      return;
    }
    this.hideVariableTooltip();
  }

  protected handleMirrorPointerOver(ev: PointerEvent): void {
    const span = this.findVariableSpan(ev.target);
    if (!span || !this.canShowTooltips()) {
      return;
    }
    const varId = span.dataset['varId'] ?? '';
    const part = span.dataset['varPart'] === 'param' ? 'param' : 'token';
    if (!varId) {
      return;
    }
    this.tooltips.show(span, formatDynamicVariableTooltip(varId, this.variableCatalog(), part), 'top');
    this.tooltipAnchor = span;
  }

  protected handleMirrorPointerOut(): void {
    this.hideVariableTooltip();
  }

  protected handleMirrorPointerDown(ev: PointerEvent): void {
    const foldSpan = this.findFoldPlaceholderSpan(ev.target);
    if (foldSpan) {
      this.handleExpandFoldFromPlaceholder(foldSpan, ev);
      return;
    }

    const ta = this.textareaRef()?.nativeElement;
    if (!ta || this.readOnly()) {
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
      const key = varId.slice(4);
      if (key) {
        this.environmentVariableClick.emit({ key });
      }
      return;
    }
    ev.preventDefault();
    ta.focus({ preventScroll: true });
  }

  protected handleTextareaPointerDown(ev: PointerEvent): void {
    if (this.readOnly() || !this.codeFolding() || this.overlaySyntaxHighlight()) {
      return;
    }
    const ta = this.textareaRef()?.nativeElement;
    if (!ta || ev.target !== ta) {
      return;
    }
    const lineIndex = txCodeEditorLineIndexAtClientY(ta, ev.clientY);
    const region = this.foldRegionAtPlaceholderLine(lineIndex);
    if (!region) {
      return;
    }
    ev.preventDefault();
    this.handleToggleFold(region, ev);
  }

  protected handleScroll(): void {
    const ta = this.textareaRef()?.nativeElement;
    const mirror = this.hostRef.nativeElement.querySelector('.tx-code-editor__mirror');
    if (!ta || !(mirror instanceof HTMLElement)) {
      return;
    }
    mirror.scrollTop = ta.scrollTop;
    mirror.scrollLeft = ta.scrollLeft;
    const hit = this.hostRef.nativeElement.querySelector('.tx-code-editor__hit');
    if (hit instanceof HTMLElement) {
      hit.scrollTop = ta.scrollTop;
      hit.scrollLeft = ta.scrollLeft;
    }
    const gutter = this.hostRef.nativeElement.querySelector('.tx-code-editor__gutter');
    if (gutter instanceof HTMLElement) {
      gutter.scrollTop = ta.scrollTop;
    }
  }

  protected handleGutterWheel(ev: WheelEvent): void {
    this.scrollEditorBy(ev.deltaY, ev.deltaX);
    ev.preventDefault();
  }

  protected handleEditorWheel(ev: WheelEvent): void {
    const ta = this.textareaRef()?.nativeElement;
    if (!ta || ev.target === ta) {
      return;
    }
    this.scrollEditorBy(ev.deltaY, ev.deltaX);
    ev.preventDefault();
  }

  private scrollEditorBy(deltaY: number, deltaX: number): void {
    const ta = this.textareaRef()?.nativeElement;
    if (!ta) {
      return;
    }
    ta.scrollTop += deltaY;
    ta.scrollLeft += deltaX;
    this.handleScroll();
  }

  protected handleKeydown(ev: KeyboardEvent): void {
    const ta = this.textareaRef()?.nativeElement;
    if (
      !this.readOnly() &&
      this.collapsedFoldIds().size > 0 &&
      !ev.ctrlKey &&
      !ev.metaKey &&
      !ev.altKey &&
      ev.key !== 'Tab' &&
      ev.key !== 'Escape'
    ) {
      this.expandAllFoldsToDisplay();
      if (ta) {
        ta.value = this.innerValue();
      }
    }

    if (ta && !this.readOnly() && !this.applyingHistory && this.shouldRecordUndoForKey(ev)) {
      this.pendingUndoSnapshot = txCodeEditorSnapshot(this.innerValue(), ta);
    }

    if (!this.readOnly() && this.completionOpen()) {
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

    if (this.shortcutsActive()) {
      const action = resolveTxCodeEditorShortcut(ev);
      if (action && this.dispatchShortcut(action, ev)) {
        return;
      }
    }

    if (!this.readOnly() && this.autoCloseActive() && ta) {
      const auto =
        ev.key === 'Backspace'
          ? resolveTxCodeEditorAutoCloseBackspace(this.innerValue(), ta.selectionStart, this.language())
          : resolveTxCodeEditorAutoClose({
              key: ev.key,
              value: this.innerValue(),
              selection: txCodeEditorGetSelection(ta),
              language: this.language(),
            });
      if (auto) {
        ev.preventDefault();
        this.recordUndoFromTextarea();
        this.applyEditResult(auto, false);
        return;
      }
    }

    if (!this.readOnly() && this.smartEditingActive()) {
      const smart = resolveTxCodeEditorSmartEditWithModifiers({
        key: ev.key,
        value: this.innerValue(),
        selection: ta ? txCodeEditorGetSelection(ta) : { start: 0, end: 0 },
        language: this.language(),
        shiftKey: ev.shiftKey,
      });
      if (smart && ta) {
        ev.preventDefault();
        this.recordUndoFromTextarea();
        this.applyEditResult(smart, false);
        return;
      }
    }

    if (this.readOnly()) {
      return;
    }
  }

  protected handleFormat(): void {
    if (this.readOnly()) {
      return;
    }
    this.expandAllFoldsToDisplay();
    const before = this.canonicalValue();
    const formatted = tryFormatCodeEditorContent(before, this.language());
    if (formatted === null || formatted === before) {
      return;
    }
    this.emitContentChange(formatted);
    const ta = this.textareaRef()?.nativeElement;
    if (ta) {
      queueMicrotask(() => {
        ta.selectionStart = formatted.length;
        ta.selectionEnd = formatted.length;
        this.handleScroll();
      });
    }
  }

  protected handleCopy(): void {
    const ta = this.textareaRef()?.nativeElement;
    if (!ta) {
      return;
    }
    ta.focus();
    if (document.execCommand('copy')) {
      return;
    }
    void this.copyToClipboard();
  }

  protected applyCompletion(item: TxCodeEditorCompletionItem): void {
    const ta = this.textareaRef()?.nativeElement;
    if (!ta) {
      return;
    }
    this.recordUndoFromTextarea();
    const value = this.innerValue();
    let start = this.completionReplaceStart;
    let end = this.completionReplaceEnd;
    let insert = item.insert;
    let caretOffsetFromEnd = item.caretOffsetFromEnd ?? 0;

    if (this.completionFromTemplateVars) {
      const normalized = normalizeTemplateVariableInsert(value, start, end, insert, {
        json: this.language() === 'json',
      });
      start = normalized.replaceStart;
      end = normalized.replaceEnd;
      insert = normalized.insert;
      caretOffsetFromEnd = normalized.caretOffsetFromEnd;
    }

    const next = value.slice(0, start) + insert + value.slice(end);
    this.emitContentChange(next);
    const caret = start + insert.length - caretOffsetFromEnd;
    queueMicrotask(() => {
      ta.focus();
      ta.selectionStart = caret;
      ta.selectionEnd = caret;
    });
    this.closeCompletion();
  }

  protected handleToggleFold(region: TxCodeEditorFoldRegion, ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    if (this.readOnly() || !this.codeFolding()) {
      return;
    }

    const nextCollapsed = new Set(this.collapsedFoldIds());
    const hidden = new Map(this.foldHiddenById());

    if (nextCollapsed.has(region.id)) {
      nextCollapsed.delete(region.id);
      hidden.delete(region.id);
    } else {
      const extracted = extractTxCodeEditorFoldHidden(this.canonicalValue(), region);
      if (!extracted) {
        return;
      }
      hidden.set(region.id, extracted);
      nextCollapsed.add(region.id);
    }

    this.collapsedFoldIds.set(nextCollapsed);
    this.foldHiddenById.set(hidden);
    this.refreshFoldedDisplay();
  }

  protected isFoldCollapsed(region: TxCodeEditorFoldRegion): boolean {
    return this.collapsedFoldIds().has(region.id);
  }

  protected foldRegionAtLine(lineIndex: number): TxCodeEditorFoldRegion | null {
    return this.foldRegionsByStartLine().get(lineIndex) ?? null;
  }

  protected foldRegionAtPlaceholderLine(lineIndex: number): TxCodeEditorFoldRegion | null {
    return findCollapsedFoldRegionAtPlaceholderLine(
      this.innerValue(),
      lineIndex,
      this.canonicalValue(),
      this.collapsedFoldIds(),
      this.foldRegions(),
    );
  }

  private handleExpandFoldFromPlaceholder(span: HTMLElement, ev: Event): void {
    if (this.readOnly() || !this.codeFolding()) {
      return;
    }
    const regionId = span.dataset['foldId'] ?? '';
    const region = this.foldRegions().find((entry) => entry.id === regionId);
    if (!region || !this.isFoldCollapsed(region)) {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    this.handleToggleFold(region, ev);
  }

  private findFoldPlaceholderSpan(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof HTMLElement)) {
      return null;
    }
    const span = target.closest('.tx-fold-placeholder');
    return span instanceof HTMLElement ? span : null;
  }

  private emitContentChange(next: string): void {
    this.clearFoldState();
    this.canonicalValue.set(next);
    this.innerValue.set(next);
    this.onChange(next);
    this.syncTextareaDom();
  }

  private clearFoldState(): void {
    this.collapsedFoldIds.set(new Set());
    this.foldHiddenById.set(new Map());
  }

  private expandAllFoldsToDisplay(): void {
    if (this.collapsedFoldIds().size === 0) {
      return;
    }
    this.clearFoldState();
    this.innerValue.set(this.canonicalValue());
    queueMicrotask(() => this.syncTextareaDom());
  }

  private refreshFoldedDisplay(): void {
    const display = buildTxCodeEditorFoldedDisplay(
      this.canonicalValue(),
      this.collapsedFoldIds(),
      this.foldRegions(),
    );
    this.innerValue.set(display);
    queueMicrotask(() => {
      this.syncTextareaDom();
      this.handleScroll();
    });
  }

  private syncTextareaDom(): void {
    const ta = this.textareaRef()?.nativeElement;
    if (!ta) {
      return;
    }
    const v = this.innerValue();
    if (ta.value !== v) {
      ta.value = v;
    }
  }

  private scheduleAutoFormat(): void {
    if (this.readOnly() || !this.autoFormat() || !txCodeEditorSupportsAutoFormat(this.language())) {
      this.clearAutoFormatTimer();
      return;
    }
    this.clearAutoFormatTimer();
    this.autoFormatTimer = setTimeout(() => {
      this.autoFormatTimer = null;
      if (this.isTextareaFocused()) {
        return;
      }
      this.applyAutoFormatIfChanged();
    }, this.autoFormatDebounceMs);
  }

  /** Pretty-print when leaving the field so typing is never rearranged mid-edit. */
  private tryFormatOnBlur(): void {
    if (this.readOnly() || !this.autoFormat() || !txCodeEditorSupportsAutoFormat(this.language())) {
      return;
    }
    this.applyAutoFormatIfChanged();
  }

  private applyAutoFormatIfChanged(): void {
    this.expandAllFoldsToDisplay();
    const before = this.canonicalValue();
    const formatted = tryFormatCodeEditorContent(before, this.language());
    if (formatted === null || formatted === before) {
      return;
    }
    this.emitContentChange(formatted);
  }

  private clearAutoFormatTimer(): void {
    if (this.autoFormatTimer !== null) {
      clearTimeout(this.autoFormatTimer);
      this.autoFormatTimer = null;
    }
  }

  private isTextareaFocused(): boolean {
    const ta = this.textareaRef()?.nativeElement;
    return !!ta && document.activeElement === ta;
  }

  private catalogForLanguage(): readonly TxCodeEditorCompletionItem[] {
    const lang = this.language();
    const languageSnippets: TxCodeEditorCompletionItem[] = [];
    if (lang === 'json' && this.jsonSnippetAutocompleteActive()) {
      languageSnippets.push(...TX_CODE_EDITOR_JSON_SNIPPETS);
    }
    if (lang === 'xml' && this.markupSnippetAutocompleteActive()) {
      languageSnippets.push(...TX_CODE_EDITOR_XML_SNIPPETS);
    }
    if (lang === 'html' && this.markupSnippetAutocompleteActive()) {
      languageSnippets.push(...TX_CODE_EDITOR_HTML_SNIPPETS);
    }
    const variableItems =
      this.templateVariableAutocompleteActive() && this.variableCatalog().length > 0
        ? dynamicCatalogToCompletionItems(this.variableCatalog())
        : [];
    if (lang === 'js' && this.jsAutocompleteActive()) {
      return mergeCodeEditorCompletionCatalogs(
        TX_CODE_EDITOR_PM_COMPLETIONS,
        TX_CODE_EDITOR_JS_SNIPPETS,
        languageSnippets,
        variableItems,
        this.extraCompletionItems(),
      );
    }
    return mergeCodeEditorCompletionCatalogs(
      languageSnippets,
      variableItems,
      this.extraCompletionItems(),
    );
  }

  private openAutocomplete(): void {
    const ta = this.textareaRef()?.nativeElement;
    if (!ta) {
      return;
    }
    this.maybeOpenTemplateVariableAutocomplete(ta.selectionStart, { allowEmptyPrefix: true });
    if (this.completionOpen()) {
      return;
    }
    if (this.catalogForLanguage().length === 0) {
      return;
    }
    this.completionFromTemplateVars = false;
    this.completionOpen.set(true);
    this.refreshCompletionFilter();
  }

  /** Recomputes replace range and filtered rows from text before the caret. */
  private refreshCompletionFilter(): void {
    const ta = this.textareaRef()?.nativeElement;
    if (!ta) {
      return;
    }
    if (this.completionFromTemplateVars) {
      const result = findTemplateVariableSuggestions(
        this.innerValue(),
        ta.selectionStart,
        this.variableCatalog(),
      );
      if (!result || result.items.length === 0) {
        this.closeCompletion();
        return;
      }
      if (result.context.prefix.length < 1 && !this.completionAllowEmptyPrefix) {
        this.closeCompletion();
        return;
      }
      this.completionReplaceStart = result.context.replaceStart;
      this.completionReplaceEnd = result.context.replaceEnd;
      this.completionItems.set(dynamicCatalogToCompletionItems(result.items));
      this.completionIndex.update((i) => Math.min(i, Math.max(0, result.items.length - 1)));
      return;
    }
    const catalog = this.catalogForLanguage();
    const ctx = txCodeEditorCompletionContext(this.innerValue(), ta.selectionStart);
    this.completionReplaceStart = ctx.replaceStart;
    this.completionReplaceEnd = ctx.replaceEnd;
    const filtered = filterTxCodeEditorCompletions(catalog, ctx.needle);
    this.completionItems.set(filtered);
    this.completionIndex.update((i) => Math.min(i, Math.max(0, filtered.length - 1)));
  }

  private maybeOpenAutocompleteOnInput(event: Event): void {
    if (
      !this.autocompleteActive() ||
      this.readOnly() ||
      this.language() !== 'js' ||
      !this.jsAutocompleteActive() ||
      !this.autocompleteOnDotActive()
    ) {
      return;
    }
    const inputEvent = event as InputEvent;
    if (inputEvent.data === ' ' && this.completionOpen()) {
      this.closeCompletion();
      return;
    }
    if (inputEvent.data !== '.') {
      return;
    }
    const ta = this.textareaRef()?.nativeElement;
    if (!ta) {
      return;
    }
    const ctx = txCodeEditorCompletionContext(this.innerValue(), ta.selectionStart);
    if (!ctx.needle.includes('pm')) {
      return;
    }
    this.openAutocomplete();
  }

  private maybeSuggestJsonClosingQuote(caret: number): void {
    if (!this.jsonClosingQuoteSuggestActive() || this.language() !== 'json') {
      return;
    }
    if (!shouldOfferJsonClosingQuote(this.innerValue(), caret)) {
      return;
    }
    this.completionFromTemplateVars = false;
    this.completionReplaceStart = caret;
    this.completionReplaceEnd = caret;
    this.completionItems.set([
      {
        label: 'Close string "',
        insert: '"',
        detail: 'Tab or Enter to add closing quote',
      },
    ]);
    this.completionIndex.set(0);
    this.completionOpen.set(true);
  }

  private maybeOpenTemplateVariableAutocomplete(
    caret: number,
    options?: { readonly allowEmptyPrefix?: boolean },
  ): void {
    if (!this.templateVariableAutocompleteActive() || this.variableCatalog().length === 0) {
      return;
    }
    const result = findTemplateVariableSuggestions(this.innerValue(), caret, this.variableCatalog());
    if (!result || result.items.length === 0) {
      return;
    }
    if (result.context.prefix.length < 1 && !options?.allowEmptyPrefix) {
      return;
    }
    this.completionAllowEmptyPrefix = options?.allowEmptyPrefix ?? false;
    this.completionFromTemplateVars = true;
    this.completionReplaceStart = result.context.replaceStart;
    this.completionReplaceEnd = result.context.replaceEnd;
    this.completionItems.set(dynamicCatalogToCompletionItems(result.items));
    this.completionIndex.set(0);
    this.completionOpen.set(true);
  }

  private closeCompletion(): void {
    this.completionOpen.set(false);
    this.completionItems.set([]);
    this.completionIndex.set(0);
    this.completionFromTemplateVars = false;
    this.completionAllowEmptyPrefix = false;
  }

  private findVariableSpan(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof HTMLElement)) {
      return null;
    }
    return target.closest('.tx-var-token, .tx-var-param');
  }

  private hideVariableTooltip(): void {
    if (this.tooltipAnchor) {
      this.tooltips.hide(this.tooltipAnchor);
      this.tooltipAnchor = null;
    } else {
      this.tooltips.hideImmediate();
    }
  }

  private canShowTooltips(): boolean {
    return this.uiPreferences.showIconTooltips() && !this.readOnly();
  }

  private shouldRecordUndoForKey(ev: KeyboardEvent): boolean {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) {
      return false;
    }
    if (ev.key === 'Backspace' || ev.key === 'Delete' || ev.key === 'Enter') {
      return true;
    }
    return ev.key.length === 1;
  }

  /** Clipboard shortcuts with a non-empty selection use native textarea behavior. */
  private static readonly nativeTextareaShortcuts = new Set<TxCodeEditorShortcutAction>([
    'paste',
    'selectAll',
  ]);

  private dispatchShortcut(action: TxCodeEditorShortcutAction, ev: KeyboardEvent): boolean {
    if (TxCodeEditorComponent.nativeTextareaShortcuts.has(action)) {
      return false;
    }

    switch (action) {
      case 'copy':
        return this.execCopy(ev);
      case 'cut':
        return this.execCut(ev);
      case 'undo':
        if (this.readOnly()) {
          return false;
        }
        return this.execUndo(ev);
      case 'redo':
        if (this.readOnly()) {
          return false;
        }
        return this.execRedo(ev);
      case 'format':
        if (this.readOnly()) {
          return false;
        }
        ev.preventDefault();
        this.handleFormat();
        return true;
      case 'indent':
        if (this.readOnly()) {
          return false;
        }
        return this.execIndent(ev);
      case 'outdent':
        if (this.readOnly()) {
          return false;
        }
        return this.execOutdent(ev);
      case 'toggleComment':
        if (this.readOnly()) {
          return false;
        }
        return this.execToggleComment(ev);
      case 'deleteLine':
        if (this.readOnly()) {
          return false;
        }
        return this.execDeleteLine(ev);
      case 'duplicateLine':
        if (this.readOnly()) {
          return false;
        }
        return this.execDuplicateLine(ev);
      case 'autocomplete':
        if (!this.autocompleteActive()) {
          return false;
        }
        ev.preventDefault();
        this.openAutocomplete();
        return true;
      default:
        return false;
    }
  }

  private async copyToClipboard(): Promise<void> {
    const ta = this.textareaRef()?.nativeElement;
    if (!ta) {
      return;
    }
    const sel = txCodeEditorGetSelection(ta);
    const text =
      sel.start !== sel.end
        ? txCodeEditorSelectedText(this.innerValue(), sel)
        : txCodeEditorCopyLineText(this.innerValue(), sel);
    if (text) {
      await this.writeClipboardText(text);
    }
  }

  private async writeClipboardText(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const ta = this.textareaRef()?.nativeElement;
    if (!ta) {
      return;
    }
    ta.focus();
    ta.select();
    document.execCommand('copy');
    ta.setSelectionRange(ta.selectionStart, ta.selectionEnd);
  }

  private execCopy(ev: KeyboardEvent): boolean {
    const ta = this.textareaRef()?.nativeElement;
    if (!ta) {
      return false;
    }
    const sel = txCodeEditorGetSelection(ta);
    if (sel.start !== sel.end) {
      return false;
    }
    ev.preventDefault();
    const text = txCodeEditorCopyLineText(this.innerValue(), sel);
    void this.writeClipboardText(text);
    return true;
  }

  private execCut(ev: KeyboardEvent): boolean {
    if (this.readOnly()) {
      return false;
    }
    const ta = this.textareaRef()?.nativeElement;
    if (!ta) {
      return false;
    }
    const sel = txCodeEditorGetSelection(ta);
    if (sel.start !== sel.end) {
      return false;
    }
    ev.preventDefault();
    this.recordUndoFromTextarea();
    const { text, edit } = txCodeEditorCutLines(this.innerValue(), sel);
    void this.writeClipboardText(text);
    this.applyEditResult(edit, false);
    return true;
  }

  private execUndo(ev: KeyboardEvent): boolean {
    const ta = this.textareaRef()?.nativeElement;
    if (!ta) {
      return false;
    }
    const restored = this.undoStack.undo(txCodeEditorSnapshot(this.innerValue(), ta));
    if (!restored) {
      return false;
    }
    ev.preventDefault();
    this.applySnapshot(restored);
    return true;
  }

  private execRedo(ev: KeyboardEvent): boolean {
    const ta = this.textareaRef()?.nativeElement;
    if (!ta) {
      return false;
    }
    const restored = this.undoStack.redo(txCodeEditorSnapshot(this.innerValue(), ta));
    if (!restored) {
      return false;
    }
    ev.preventDefault();
    this.applySnapshot(restored);
    return true;
  }

  private execIndent(ev: KeyboardEvent): boolean {
    const ta = this.textareaRef()?.nativeElement;
    if (!ta) {
      return false;
    }
    ev.preventDefault();
    this.recordUndoFromTextarea();
    const sel = txCodeEditorGetSelection(ta);
    this.applyEditResult(txCodeEditorIndentLines(this.innerValue(), sel), false);
    return true;
  }

  private execOutdent(ev: KeyboardEvent): boolean {
    const ta = this.textareaRef()?.nativeElement;
    if (!ta) {
      return false;
    }
    ev.preventDefault();
    this.recordUndoFromTextarea();
    const sel = txCodeEditorGetSelection(ta);
    this.applyEditResult(txCodeEditorOutdentLines(this.innerValue(), sel), false);
    return true;
  }

  private execToggleComment(ev: KeyboardEvent): boolean {
    const lang = this.language();
    if (lang !== 'js' && lang !== 'ts' && lang !== 'css' && lang !== 'scss') {
      return false;
    }
    const ta = this.textareaRef()?.nativeElement;
    if (!ta) {
      return false;
    }
    ev.preventDefault();
    this.recordUndoFromTextarea();
    const sel = txCodeEditorGetSelection(ta);
    this.applyEditResult(txCodeEditorToggleLineComments(this.innerValue(), sel), false);
    return true;
  }

  private execDeleteLine(ev: KeyboardEvent): boolean {
    const ta = this.textareaRef()?.nativeElement;
    if (!ta) {
      return false;
    }
    ev.preventDefault();
    this.recordUndoFromTextarea();
    const sel = txCodeEditorGetSelection(ta);
    this.applyEditResult(txCodeEditorDeleteLines(this.innerValue(), sel), false);
    return true;
  }

  private execDuplicateLine(ev: KeyboardEvent): boolean {
    const ta = this.textareaRef()?.nativeElement;
    if (!ta) {
      return false;
    }
    ev.preventDefault();
    this.recordUndoFromTextarea();
    const sel = txCodeEditorGetSelection(ta);
    this.applyEditResult(txCodeEditorDuplicateLines(this.innerValue(), sel), false);
    return true;
  }

  private recordUndoFromTextarea(): void {
    const ta = this.textareaRef()?.nativeElement;
    if (!ta || this.applyingHistory) {
      return;
    }
    this.undoStack.record(txCodeEditorSnapshot(this.innerValue(), ta));
    this.pendingUndoSnapshot = null;
  }

  private applySnapshot(snapshot: TxCodeEditorUndoSnapshot): void {
    this.applyingHistory = true;
    this.pendingUndoSnapshot = null;
    this.emitContentChange(snapshot.value);
    queueMicrotask(() => {
      const ta = this.textareaRef()?.nativeElement;
      if (ta) {
        ta.value = snapshot.value;
        ta.selectionStart = snapshot.selectionStart;
        ta.selectionEnd = snapshot.selectionEnd;
        ta.focus();
        this.handleScroll();
      }
      this.applyingHistory = false;
    });
  }

  private applyEditResult(result: TxCodeEditorEditResult, recordUndo = true): void {
    if (recordUndo) {
      this.recordUndoFromTextarea();
    }
    this.applyingHistory = true;
    this.pendingUndoSnapshot = null;
    this.emitContentChange(result.value);
    queueMicrotask(() => {
      const ta = this.textareaRef()?.nativeElement;
      if (ta) {
        ta.value = result.value;
        ta.selectionStart = result.selectionStart;
        ta.selectionEnd = result.selectionEnd;
        ta.focus();
        this.handleScroll();
      }
      this.applyingHistory = false;
    });
  }
}
