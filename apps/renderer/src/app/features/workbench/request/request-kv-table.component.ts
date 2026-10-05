import { OverlayModule, type ConnectedPosition } from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { TxCheckComponent, TxHintComponent } from '@testrix/ui';
import { SETTINGS_KV_SOURCE_ID } from '@testrix/contracts';

import {
  applyPlaceholderSuggestion,
  hasPlaceholderTokens,
  suggestPlaceholders,
  tokenAtCaret,
  type PlaceholderSuggestion,
} from './placeholder-complete';
import { suggestHeaderNames, suggestHeaderValues, headerGhost } from './http-header-complete';
import { PlaceholderHighlightComponent } from './placeholder-highlight.component';
import { PlaceholderSuggestComponent } from './placeholder-suggest.component';
import { emptyMockRow, isKvRowFilled, type MockKeyValue } from './request-mock';

type KvCol = 'key' | 'value' | 'description';

const KV_COLS: readonly KvCol[] = ['key', 'value', 'description'];

const COMPLETE_POSITIONS: ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
];

@Component({
  selector: 'tx-request-kv-table',
  standalone: true,
  imports: [
    OverlayModule,
    TxCheckComponent,
    TxHintComponent,
    PlaceholderHighlightComponent,
    PlaceholderSuggestComponent,
  ],
  templateUrl: './request-kv-table.component.html',
  styleUrl: './request-kv-table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:mousedown)': 'handleDocumentDown($event)',
  },
})
export class RequestKvTableComponent {
  readonly label = input.required<string>();
  readonly rows = model.required<MockKeyValue[]>();
  readonly inherited = input<readonly MockKeyValue[]>([]);
  readonly inheritedLabel = input('From folder');
  readonly inheritedKind = input<'headers' | 'variables' | 'params'>('headers');
  readonly inheritedActivate = output<MockKeyValue>();
  readonly completeVariables = input<readonly string[]>([]);
  readonly headerComplete = input(false);
  readonly extraHeaderNames = input<readonly string[]>([]);
  /** When false, hides the Description column (narrow inspectors). */
  readonly showDescription = input(true);

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);

  readonly completePositions = COMPLETE_POSITIONS;
  readonly completeOpen = signal(false);
  readonly completeIndex = signal(0);
  readonly completeOrigin = signal<HTMLElement | null>(null);
  readonly completeItems = signal<readonly PlaceholderSuggestion[]>([]);
  readonly ghost = signal<{ readonly pad: string; readonly rest: string } | null>(null);
  readonly ghostRowId = signal<string | null>(null);
  readonly ghostCol = signal<KvCol | null>(null);
  private completeRow = 0;
  private completeCol: KvCol = 'key';
  private ghostItem: PlaceholderSuggestion | null = null;

  readonly completeOriginEl = computed(() => this.completeOrigin() ?? this.host.nativeElement);

  ghostFor(rowId: string, col: KvCol): { readonly pad: string; readonly rest: string } | null {
    if (this.completeOpen())
      return null;
    if (this.ghostRowId() !== rowId || this.ghostCol() !== col)
      return null;
    return this.ghost();
  }

  trackRow(_index: number, row: MockKeyValue): string {
    return row.id;
  }

  sourceLabel(row: MockKeyValue): string {
    return row.source?.trim() || this.inheritedLabel();
  }

  hasTokens(value: string): boolean {
    return hasPlaceholderTokens(value, this.completeVariables());
  }

  canOpenInherited(row: MockKeyValue): boolean {
    return Boolean(row.sourceId);
  }

  openInheritedLabel(row: MockKeyValue): string {
    const source = this.sourceLabel(row);
    if (row.sourceId === SETTINGS_KV_SOURCE_ID || source === 'Settings')
      return 'Open default headers in Settings';
    const section = this.inheritedKind() === 'variables' ? 'variables' : 'headers';
    return `Open ${section} from ${source}`;
  }

  handleInheritedActivate(row: MockKeyValue): void {
    if (!this.canOpenInherited(row))
      return;
    this.inheritedActivate.emit(row);
  }

  handleInheritedKey(event: KeyboardEvent, row: MockKeyValue): void {
    if (event.key !== 'Enter' && event.key !== ' ')
      return;
    event.preventDefault();
    this.handleInheritedActivate(row);
  }

  enableLabel(row: MockKeyValue): string {
    return row.enabled ? 'Included in the request' : 'Skipped in the request';
  }

  handleEnabled(index: number, enabled: boolean): void {
    this.patch(index, { enabled });
  }

  handleCellFocus(index: number, event: Event, col: KvCol): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement))
      return;
    // Refresh suggestions only — patching on focus remounts the trailing blank row
    // when the parent persists without empty rows (Settings default headers).
    this.refreshComplete(target, index, col, 'auto');
  }

  handleKey(index: number, event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement))
      return;
    this.patch(index, { key: target.value }, true);
    this.refreshComplete(target, index, 'key', 'auto');
  }

  handleValue(index: number, event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement))
      return;
    this.patch(index, { value: target.value }, true);
    this.refreshComplete(target, index, 'value', 'auto');
  }

  handleDescription(index: number, event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement))
      return;
    this.patch(index, { description: target.value }, true);
  }

  handleCellKey(event: KeyboardEvent, index: number, col: KvCol): void {
    if (this.handleCompleteKey(event, index, col))
      return;
    if (event.ctrlKey || event.metaKey || event.altKey)
      return;
    if (event.shiftKey)
      return;
    if (this.handleGridKey(event, index, col))
      return;
    if (event.key === 'Enter') {
      event.preventDefault();
      this.insertRowAfter(index, col);
      return;
    }
    if (event.key === 'Delete') {
      event.preventDefault();
      this.removeRow(index, col);
    }
  }

  handleCompletePick(item: PlaceholderSuggestion): void {
    this.applySuggestion(item);
  }

  handleDocumentDown(event: Event): void {
    if (!this.completeOpen() && !this.ghost())
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

  private handleCompleteKey(event: KeyboardEvent, index: number, col: KvCol): boolean {
    if (col === 'description')
      return false;
    const target = event.target;
    if (!(target instanceof HTMLInputElement))
      return false;
    if ((event.ctrlKey || event.metaKey) && event.code === 'Space') {
      event.preventDefault();
      this.refreshComplete(target, index, col, 'force');
      return true;
    }
    if (event.key === 'Tab' && !event.shiftKey) {
      if (this.completeOpen()) {
        event.preventDefault();
        const item = this.completeItems()[this.completeIndex()];
        if (item)
          this.applySuggestion(item);
        else
          this.closeComplete();
        return true;
      }
      if (this.ghostItem && this.ghostRowId() === this.rows()[index]?.id && this.ghostCol() === col) {
        event.preventDefault();
        this.applySuggestion(this.ghostItem);
        return true;
      }
    }
    if (!this.completeOpen())
      return false;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.moveComplete(1);
      return true;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.moveComplete(-1);
      return true;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeComplete();
      return true;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const item = this.completeItems()[this.completeIndex()];
      if (item)
        this.applySuggestion(item);
      else
        this.closeComplete();
      return true;
    }
    return false;
  }

  private refreshComplete(
    inputEl: HTMLInputElement,
    index: number,
    col: KvCol,
    mode: 'auto' | 'force',
  ): void {
    const token = tokenAtCaret(inputEl.value, inputEl.selectionStart ?? inputEl.value.length);
    this.updateGhost(inputEl, index, col, token);
    const keepOpen = this.completeOpen() && mode === 'auto';
    if (mode === 'auto' && token.kind === 'none' && !keepOpen) {
      this.completeOpen.set(false);
      return;
    }
    const items = this.completeItemsFor(
      inputEl,
      index,
      col,
      token,
      mode === 'force' || keepOpen ? 'force' : 'auto',
    );
    if (items.length === 0) {
      this.completeOpen.set(false);
      return;
    }
    const wasOpen = this.completeOpen();
    this.completeRow = index;
    this.completeCol = col;
    this.completeItems.set(items);
    this.completeIndex.set(wasOpen ? Math.min(this.completeIndex(), items.length - 1) : 0);
    this.completeOrigin.set(inputEl);
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
    if (!(origin instanceof HTMLInputElement)) {
      this.closeComplete();
      return;
    }
    const applied =
      tokenAtCaret(origin.value, origin.selectionStart ?? origin.value.length).kind === 'none'
        ? { value: item.insert, cursor: item.insert.length }
        : applyPlaceholderSuggestion(
            origin.value,
            origin.selectionStart ?? origin.value.length,
            item.insert,
          );
    this.patch(this.completeRow, { [this.completeCol]: applied.value }, true);
    this.closeComplete();
    afterNextRender(
      () => {
        origin.focus();
        origin.setSelectionRange(applied.cursor, applied.cursor);
      },
      { injector: this.injector },
    );
  }

  private handleGridKey(event: KeyboardEvent, index: number, col: KvCol): boolean {
    const target = event.target;
    if (!(target instanceof HTMLInputElement))
      return false;
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? start;
    const atStart = start === 0 && end === 0;
    const atEnd = start === target.value.length && end === target.value.length;
    const cols = this.showDescription() ? KV_COLS : (['key', 'value'] as const);
    const next = neighborCell(this.rows().length, index, col, event.key, atStart, atEnd, cols);
    if (!next)
      return false;
    event.preventDefault();
    this.closeComplete();
    const row = this.rows()[next.row];
    if (!row)
      return true;
    const caret = next.caret === 'keep' ? start : next.caret;
    this.focusCell(row.id, next.col, caret);
    return true;
  }

  private completeItemsFor(
    inputEl: HTMLInputElement,
    index: number,
    col: KvCol,
    token: ReturnType<typeof tokenAtCaret>,
    mode: 'auto' | 'force',
  ): PlaceholderSuggestion[] {
    if (token.kind !== 'none')
      return suggestPlaceholders(inputEl.value, inputEl.selectionStart ?? inputEl.value.length, this.completeVariables());
    if (this.headerComplete() && col === 'key')
      return suggestHeaderNames(inputEl.value, this.usedHeaderKeys(index), this.extraHeaderNames());
    if (this.headerComplete() && col === 'value') {
      const values = suggestHeaderValues(this.rows()[index]?.key ?? '', inputEl.value);
      if (values.length > 0)
        return values;
    }
    if (mode === 'force')
      return suggestPlaceholders(inputEl.value, inputEl.selectionStart ?? inputEl.value.length, this.completeVariables());
    return [];
  }

  private updateGhost(
    inputEl: HTMLInputElement,
    index: number,
    col: KvCol,
    token: ReturnType<typeof tokenAtCaret>,
  ): void {
    this.completeRow = index;
    this.completeCol = col;
    this.completeOrigin.set(inputEl);
    if (token.kind !== 'none' || !this.headerComplete() || (col !== 'key' && col !== 'value')) {
      this.clearGhost();
      return;
    }
    const items = this.completeItemsFor(inputEl, index, col, token, 'auto');
    const item = items[0] ?? null;
    this.ghostItem = item;
    this.ghost.set(headerGhost(inputEl.value, item));
    this.ghostRowId.set(this.rows()[index]?.id ?? null);
    this.ghostCol.set(col);
  }

  private clearGhost(): void {
    this.ghostItem = null;
    this.ghost.set(null);
    this.ghostRowId.set(null);
    this.ghostCol.set(null);
  }

  private usedHeaderKeys(index: number): string[] {
    return this.rows()
      .filter((_, rowIndex) => rowIndex !== index)
      .map((row) => row.key);
  }

  private closeComplete(): void {
    this.completeOpen.set(false);
    this.completeOrigin.set(null);
    this.clearGhost();
  }

  private insertRowAfter(index: number, col: KvCol): void {
    const rows = [...this.rows()];
    const blank = emptyMockRow();
    rows.splice(index + 1, 0, blank);
    ensureTrailingBlank(rows);
    this.rows.set(rows);
    this.focusCell(blank.id, col);
  }

  private removeRow(index: number, col: KvCol): void {
    const rows = this.rows();
    const current = rows[index];
    if (!current || isTrailingEmpty(rows, index))
      return;
    const nextRows = rows.filter((_, rowIndex) => rowIndex !== index);
    ensureTrailingBlank(nextRows);
    this.rows.set(nextRows);
    const next = nextRows[Math.min(index, nextRows.length - 1)];
    if (next)
      this.focusCell(next.id, col);
  }

  private focusCell(rowId: string, col: KvCol, caret: number | 'start' | 'end' = 'end'): void {
    const apply = (): boolean => {
      const cell = this.host.nativeElement.querySelector(
        `input[data-kv-row="${cssEscape(rowId)}"][data-kv-col="${col}"]`,
      );
      if (!(cell instanceof HTMLInputElement))
        return false;
      cell.focus();
      const offset =
        caret === 'start' ? 0 : caret === 'end' ? cell.value.length : Math.min(Math.max(0, caret), cell.value.length);
      cell.setSelectionRange(offset, offset);
      return true;
    };
    if (apply())
      return;
    afterNextRender(() => {
      apply();
    }, { injector: this.injector });
  }

  private patch(index: number, patch: Partial<MockKeyValue>, grow = false): void {
    const next = this.rows().map((row, rowIndex) =>
      rowIndex === index ? { ...row, ...patch } : row,
    );
    if (grow)
      ensureTrailingBlank(next);
    this.rows.set(next);
  }
}

/** Ensures a blank trailing row only after the last key+value pair is complete. */
function ensureTrailingBlank(rows: MockKeyValue[]): void {
  const last = rows[rows.length - 1];
  if (!last) {
    rows.push(emptyMockRow());
    return;
  }
  if (isEmptyRow(last))
    return;
  if (isKvRowFilled(last))
    rows.push(emptyMockRow());
}

function neighborCell(
  rowCount: number,
  row: number,
  col: KvCol,
  key: string,
  atStart: boolean,
  atEnd: boolean,
  cols: readonly KvCol[] = KV_COLS,
): { readonly row: number; readonly col: KvCol; readonly caret: number | 'start' | 'end' | 'keep' } | null {
  const colIndex = cols.indexOf(col);
  if (colIndex < 0 || rowCount <= 0)
    return null;
  if (key === 'ArrowUp' && row > 0)
    return { row: row - 1, col, caret: 'keep' };
  if (key === 'ArrowDown' && row < rowCount - 1)
    return { row: row + 1, col, caret: 'keep' };
  if (key === 'ArrowLeft' && atStart) {
    if (colIndex > 0)
      return { row, col: cols[colIndex - 1] ?? col, caret: 'end' };
    if (row > 0)
      return { row: row - 1, col: cols[cols.length - 1] ?? col, caret: 'end' };
    return null;
  }
  if (key === 'ArrowRight' && atEnd) {
    if (colIndex < cols.length - 1)
      return { row, col: cols[colIndex + 1] ?? col, caret: 'start' };
    if (row < rowCount - 1)
      return { row: row + 1, col: cols[0] ?? col, caret: 'start' };
    return null;
  }
  return null;
}

function isTrailingEmpty(rows: readonly MockKeyValue[], index: number): boolean {
  const row = rows[index];
  return index === rows.length - 1 && isEmptyRow(row);
}

function isEmptyRow(row: MockKeyValue | undefined): boolean {
  if (!row)
    return true;
  return !row.key.trim() && !row.value.trim() && !row.description.trim();
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function')
    return CSS.escape(value);
  return value.replace(/["\\]/g, '\\$&');
}
