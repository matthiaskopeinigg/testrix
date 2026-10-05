import { Overlay, type OverlayRef, type GlobalPositionStrategy } from '@angular/cdk/overlay';
import { ComponentPortal, TemplatePortal } from '@angular/cdk/portal';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
  ViewContainerRef,
  type TemplateRef,
} from '@angular/core';
import {
  DATABASE_QUERY_PAGE_SIZE_DEFAULT,
  DATABASE_QUERY_PAGE_SIZES,
  formatDatabaseQueryResult,
  type DatabaseQueryCell,
  type DatabaseQueryExportFormat,
  type DatabaseQueryTable,
  type DatabaseRelationJump,
  type TableDataRowKind,
} from '@testrix/contracts';
import { TxHintComponent, TxSelectComponent, playLeaveThen, type TxSelectOption } from '@testrix/ui';

import { applyPointerSelect, applyRangeSelect, isRangeModifier, isToggleModifier } from '../../core/range-select';
import {
  databaseCellHasPicker,
  formatJsonCell,
  inferDatabaseCellEditorKind,
  isTrueCell,
  newUuid,
  normalizeEditedCell,
  sqlValueFromDate,
  type DatabaseCellEditorKind,
} from './database-cell-edit';
import { DatabaseDatePickerComponent } from './database-date-picker.component';

const GRID_INDEX_WIDTH = 42;
const GRID_COL_MAX = 1600;
const GRID_CHAR_PX = 7.4;
const GRID_PAD_PX = 24;

function estimateColumnWidth(
  name: string,
  rows: readonly (readonly DatabaseQueryCell[])[],
  index: number,
  extra = 0,
): number {
  let chars = name.length;
  const limit = Math.min(rows.length, 48);
  for (let i = 0; i < limit; i++) {
    const cell = rows[i]?.[index];
    const len = cell == null ? 4 : String(cell).length;
    if (len > chars)
      chars = len;
  }
  return Math.round(Math.min(GRID_COL_MAX, chars * GRID_CHAR_PX + GRID_PAD_PX + extra));
}

function clampColumnWidth(width: number): number {
  return Math.round(Math.min(GRID_COL_MAX, Math.max(0, width)));
}

interface GridCellMenu {
  readonly target: 'cell';
  readonly row: number;
  readonly col: number;
  readonly column: string;
  readonly value: DatabaseQueryCell;
  readonly kind: DatabaseCellEditorKind;
  readonly selectedRows: readonly number[];
}

interface GridEmptyMenu {
  readonly target: 'empty';
  readonly selectedRows: readonly number[];
}

type GridMenu = GridCellMenu | GridEmptyMenu;

@Component({
  selector: 'tx-database-result-grid',
  standalone: true,
  imports: [TxHintComponent, TxSelectComponent],
  templateUrl: './database-result-grid.component.html',
  styleUrl: './database-result-grid.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.is-resizing]': 'resizeColumn() !== null',
    '[class.is-range-selecting]': 'rangeDragging',
    '(window:resize)': 'handleWindowResize()',
    '(document:keydown)': 'handleCopyKey($event)',
    '(keydown)': 'handleGridKey($event)',
    tabindex: '0',
    role: 'grid',
  },
})
export class DatabaseResultGridComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly overlay = inject(Overlay);
  private readonly vcr = inject(ViewContainerRef);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly menuTemplate = viewChild.required<TemplateRef<unknown>>('cellMenuTpl');

  readonly table = input.required<DatabaseQueryTable | null>();
  readonly durationMs = input<number | null>(null);
  readonly filter = input('');
  readonly dirtyKeys = input<ReadonlySet<string>>(new Set());
  readonly rowKinds = input<readonly TableDataRowKind[]>([]);
  readonly rolledBack = input(false);
  readonly editable = input(false);
  readonly offset = input(0);
  readonly pageSize = input(DATABASE_QUERY_PAGE_SIZE_DEFAULT);
  readonly pageSizes = input<readonly number[]>(DATABASE_QUERY_PAGE_SIZES);
  readonly emptyLabel = input('Run a query to preview results here.');
  readonly busy = input(false);
  readonly columnTypes = input<Readonly<Record<string, string>>>({});
  readonly relations = input<Readonly<Record<string, DatabaseRelationJump>>>({});
  readonly rowFocus = input<{ readonly row: number; readonly column?: string; readonly seq: number } | null>(null);
  readonly cellChange = output<{ readonly row: number; readonly column: string; readonly value: string }>();
  readonly filterChange = output<string>();
  readonly pageSizeChange = output<number>();
  readonly rowSelect = output<number>();
  readonly rowsSelect = output<readonly number[]>();
  readonly insertRow = output<void>();
  readonly duplicateRows = output<readonly number[]>();
  readonly deleteRows = output<readonly number[]>();
  readonly restoreRows = output<readonly number[]>();
  readonly relationJump = output<{ readonly row: number; readonly column: string }>();

  readonly selected = signal<{ row: number; col: number } | null>(null);
  readonly gridLive = signal('');
  readonly selectedRows = signal<readonly number[]>([]);
  readonly editing = signal<{ row: number; col: number } | null>(null);
  readonly columnWidths = signal<Readonly<Record<string, number>>>({});
  readonly resizeColumn = signal<string | null>(null);
  readonly cellMenu = signal<GridMenu | null>(null);
  readonly indexWidth = GRID_INDEX_WIDTH;

  private resizeStartX = 0;
  private resizeStartWidth = 0;
  private dragBound = false;
  private rangeBound = false;
  rangeDragging = false;
  private pickerRef: OverlayRef | null = null;
  private menuRef: OverlayRef | null = null;
  private selectionAnchor: string | null = null;
  private appliedFocusSeq = Number.NaN;

  readonly filteredRows = computed(() => {
    const table = this.table();
    const needle = this.filter().trim().toLowerCase();
    if (!table)
      return [];
    if (!needle)
      return table.rows.map((row, index) => ({ row, index }));
    return table.rows
      .map((row, index) => ({ row, index }))
      .filter((entry) => entry.row.some((cell) => String(cell ?? '').toLowerCase().includes(needle)));
  });

  readonly rangeLabel = computed(() => {
    const table = this.table();
    if (!table || table.rows.length === 0)
      return '';
    const start = this.offset() + 1;
    const end = this.offset() + table.rows.length;
    return table.hasMore ? `${start}–${end}+` : `${start}–${end}`;
  });

  readonly tableWidth = computed(() => {
    const table = this.table();
    if (!table)
      return GRID_INDEX_WIDTH;
    return GRID_INDEX_WIDTH + table.columns.reduce((sum, column) => sum + this.widthOf(column), 0);
  });

  readonly pageSizeOptions = computed<readonly TxSelectOption[]>(() =>
    this.pageSizes().map((size) => ({ value: String(size), label: String(size) })),
  );

  readonly pageSizeKey = computed(() => String(this.pageSize()));

  readonly showSkeleton = computed(() => this.busy() && !this.table());

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.unbindResize();
      this.unbindRangeDrag();
      this.closeDatePicker();
      this.closeCellMenu();
    });
    effect(() => {
      const table = this.table();
      if (!table)
        return;
      this.columnWidths.update((current) => {
        const missing = table.columns.some((column) => current[column] == null);
        if (!missing)
          return current;
        const next = { ...current };
        table.columns.forEach((column, index) => {
          if (next[column] == null)
            next[column] = estimateColumnWidth(
              column,
              table.rows,
              index,
              this.relations()[column] ? 28 : 0,
            );
        });
        return next;
      });
    });
    effect(() => {
      const rows = this.filteredRows();
      if (rows.length === 0)
        return;
      const valid = new Set(rows.map((entry) => entry.index));
      this.selectedRows.update((current) => {
        const next = current.filter((row) => valid.has(row));
        return next.length === current.length ? current : next;
      });
    });
    effect(() => {
      const focus = this.rowFocus();
      const table = this.table();
      if (!focus || !table)
        return;
      if (focus.seq === this.appliedFocusSeq)
        return;
      untracked(() => {
        this.appliedFocusSeq = focus.seq;
        this.applyFocusedRow(focus.row, focus.column);
      });
    });
  }

  selectFocusedRow(row: number, column?: string): void {
    this.applyFocusedRow(row, column);
  }

  widthOf(column: string): number {
    return this.columnWidths()[column] ?? 0;
  }

  handleFilter(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement)
      this.filterChange.emit(target.value);
  }

  handlePageSize(value: string): void {
    this.pageSizeChange.emit(Number.parseInt(value, 10) || DATABASE_QUERY_PAGE_SIZE_DEFAULT);
  }

  handleSelect(event: PointerEvent, row: number, col: number): void {
    if (event.button !== 0)
      return;
    if (this.resizeColumn())
      return;
    const target = event.target;
    if (target instanceof Element && target.closest('button, input, tx-hint, .tx-db-grid__helper, .tx-db-grid__resizer'))
      return;
    const editing = this.editing();
    if (editing && editing.row === row && editing.col === col)
      return;
    this.editing.set(null);
    this.applyRowPointerSelect(event, row);
    this.selected.set({ row, col });
    if (isToggleModifier(event) || isRangeModifier(event))
      return;
    this.rangeDragging = true;
    this.bindRangeDrag();
  }

  isRowSelected(row: number): boolean {
    return this.selectedRows().includes(row);
  }

  canMutateRows(): boolean {
    return this.editable() && !this.rolledBack();
  }

  menuRowCount(kinds: 'delete' | 'restore' | 'all' = 'all'): number {
    const menu = this.cellMenu();
    const rows = menu?.selectedRows ?? [];
    if (kinds === 'all')
      return rows.length;
    return rows.filter((row) => {
      const kind = this.rowKind(row);
      return kinds === 'restore' ? kind === 'deleted' : kind !== 'deleted';
    }).length;
  }

  rowActionLabel(verb: string, count: number): string {
    return count <= 1 ? `${verb} row` : `${verb} ${count} rows`;
  }

  handleEdit(row: number, col: number): void {
    this.editing.set({ row, col });
  }

  handleCellCommit(row: number, column: string, event: Event): void {
    const editing = this.editing();
    if (!editing || editing.row !== row)
      return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement))
      return;
    if (this.canEditCell(row)) {
      const kind = this.kindOf(column, target.value);
      this.emitValue(row, column, normalizeEditedCell(kind, target.value));
    }
    this.editing.set(null);
  }

  handleCellCancel(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.editing.set(null);
  }

  openDatePicker(event: MouseEvent, row: number, column: string, sample: DatabaseQueryCell): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.canEditCell(row))
      return;
    const origin = event.currentTarget;
    if (!(origin instanceof HTMLElement))
      return;
    this.closeDatePicker();
    const kind = this.kindOf(column, sample);
    const position = this.overlay
      .position()
      .flexibleConnectedTo(origin)
      .withFlexibleDimensions(false)
      .withPush(true)
      .withPositions([
        { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 8 },
        { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -8 },
      ]);
    const overlayRef = this.overlay.create({
      positionStrategy: position,
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
      panelClass: 'tx-overlay-menu',
    });
    const ref = overlayRef.attach(new ComponentPortal(DatabaseDatePickerComponent));
    ref.setInput('kind', kind);
    ref.setInput('value', sample == null ? '' : String(sample));
    ref.instance.picked.subscribe((value) => {
      this.emitValue(row, column, value);
      this.editing.set(null);
      this.closeDatePicker();
    });
    this.pickerRef = overlayRef;
    overlayRef.keydownEvents().subscribe((event) => {
      if (event.key !== 'Escape')
        return;
      event.preventDefault();
      this.closeDatePicker();
    });
    window.setTimeout(() => {
      if (this.pickerRef !== overlayRef)
        return;
      overlayRef.outsidePointerEvents().subscribe(() => this.closeDatePicker());
    });
  }

  toggleBoolean(row: number, column: string, value: DatabaseQueryCell): void {
    if (!this.canEditCell(row))
      return;
    this.emitValue(row, column, isTrueCell(value == null ? '' : String(value)) ? 'false' : 'true');
    this.editing.set(null);
  }

  handleCellMenu(
    event: MouseEvent,
    row: number,
    col: number,
    column: string,
    value: DatabaseQueryCell,
  ): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.selectedRows().includes(row))
      this.applyRowPointerSelect({ shiftKey: false, ctrlKey: false, metaKey: false }, row);
    this.selected.set({ row, col });
    this.editing.set(null);
    this.closeDatePicker();
    this.closeCellMenu(true);
    this.cellMenu.set({
      target: 'cell',
      row,
      col,
      column,
      value,
      kind: this.kindOf(column, value),
      selectedRows: this.selectedRows(),
    });
    this.openOverlayMenu(event.clientX, event.clientY);
  }

  handleCanvasMenu(event: MouseEvent): void {
    const node = event.target;
    if (!(node instanceof Element))
      return;
    if (node.closest('td, tbody th'))
      return;
    event.preventDefault();
    event.stopPropagation();
    if (!this.canMutateRows())
      return;
    this.editing.set(null);
    this.closeDatePicker();
    this.closeCellMenu(true);
    this.cellMenu.set({
      target: 'empty',
      selectedRows: this.selectedRows(),
    });
    this.openOverlayMenu(event.clientX, event.clientY);
  }

  handleCopyValue(): void {
    const menu = this.cellMenu();
    this.closeCellMenu();
    if (menu?.target !== 'cell')
      return;
    void navigator.clipboard?.writeText(menu.value === null ? 'NULL' : String(menu.value));
  }

  handleCopyRow(): void {
    const menu = this.cellMenu();
    const table = this.table();
    this.closeCellMenu();
    if (!menu || menu.target !== 'cell' || !table)
      return;
    const rows = (menu.selectedRows.length > 0 ? menu.selectedRows : [menu.row])
      .map((index) => table.rows[index])
      .filter((row): row is NonNullable<typeof table.rows[number]> => row != null);
    if (rows.length === 0)
      return;
    const text = rows
      .map((row) => row.map((cell) => (cell === null ? '' : String(cell))).join('\t'))
      .join('\n');
    void navigator.clipboard?.writeText(text);
  }

  handleCopyColumn(): void {
    const menu = this.cellMenu();
    this.closeCellMenu();
    if (menu?.target === 'cell')
      void navigator.clipboard?.writeText(menu.column);
  }

  handleEditFromMenu(): void {
    const menu = this.cellMenu();
    this.closeCellMenu();
    if (menu?.target === 'cell')
      this.handleEdit(menu.row, menu.col);
  }

  handleInsertFromMenu(): void {
    this.closeCellMenu();
    if (this.canMutateRows())
      this.insertRow.emit();
  }

  handleDuplicateFromMenu(): void {
    const rows = this.cellMenu()?.selectedRows ?? [];
    this.closeCellMenu();
    if (!this.canMutateRows() || rows.length === 0)
      return;
    this.duplicateRows.emit(rows);
  }

  handleDeleteFromMenu(): void {
    const rows = this.menuIndexes('delete');
    this.closeCellMenu();
    if (!this.canMutateRows() || rows.length === 0)
      return;
    this.deleteRows.emit(rows);
  }

  handleRestoreFromMenu(): void {
    const rows = this.menuIndexes('restore');
    this.closeCellMenu();
    if (!this.canMutateRows() || rows.length === 0)
      return;
    this.restoreRows.emit(rows);
  }

  handleSetNow(): void {
    const menu = this.cellMenu();
    this.closeCellMenu();
    if (menu?.target !== 'cell' || !this.canEditCell(menu.row))
      return;
    this.emitValue(menu.row, menu.column, sqlValueFromDate(menu.kind, new Date()));
    this.editing.set(null);
  }

  handleCopyJson(): void {
    const menu = this.cellMenu();
    this.closeCellMenu();
    if (menu?.target !== 'cell')
      return;
    void navigator.clipboard?.writeText(JSON.stringify(menu.value));
  }

  handleGenerateUuid(): void {
    const menu = this.cellMenu();
    this.closeCellMenu();
    if (menu?.target !== 'cell' || !this.canEditCell(menu.row))
      return;
    this.fillUuid(menu.row, menu.column);
  }

  handleFormatJson(): void {
    const menu = this.cellMenu();
    this.closeCellMenu();
    if (menu?.target !== 'cell' || !this.canEditCell(menu.row))
      return;
    this.formatJson(menu.row, menu.column, menu.value);
  }

  handleSetNull(): void {
    const menu = this.cellMenu();
    this.closeCellMenu();
    if (menu?.target !== 'cell' || !this.canEditCell(menu.row))
      return;
    this.fillNull(menu.row, menu.column);
  }

  handleSetBoolean(value: boolean): void {
    const menu = this.cellMenu();
    this.closeCellMenu();
    if (menu?.target !== 'cell' || !this.canEditCell(menu.row))
      return;
    this.emitValue(menu.row, menu.column, value ? 'true' : 'false');
    this.editing.set(null);
  }

  fillUuid(row: number, column: string): void {
    this.emitValue(row, column, newUuid());
    this.editing.set(null);
  }

  formatJson(row: number, column: string, value: DatabaseQueryCell): void {
    const formatted = formatJsonCell(value == null ? '' : String(value));
    if (!formatted)
      return;
    this.emitValue(row, column, formatted);
    this.editing.set(null);
  }

  fillNull(row: number, column: string): void {
    this.emitValue(row, column, '');
    this.editing.set(null);
  }

  kindOf(column: string, sample: DatabaseQueryCell): DatabaseCellEditorKind {
    return inferDatabaseCellEditorKind(this.columnTypes()[column], sample == null ? null : String(sample));
  }

  isTrueValue(value: DatabaseQueryCell): boolean {
    return isTrueCell(value == null ? '' : String(value));
  }

  canEditCell(row: number): boolean {
    return this.editable() && !this.rolledBack() && this.rowKinds()[row] !== 'deleted';
  }

  showHelpers(row: number, col: number, column: string, sample: DatabaseQueryCell): boolean {
    if (!this.canEditCell(row))
      return false;
    const selected = this.selected();
    if (!selected || selected.row !== row || selected.col !== col)
      return false;
    const kind = this.kindOf(column, sample);
    if (databaseCellHasPicker(kind))
      return true;
    const editing = this.editing();
    return !!editing && editing.row === row && editing.col === col && (kind === 'uuid' || kind === 'json');
  }

  relationOf(column: string): DatabaseRelationJump | null {
    return this.relations()[column] ?? null;
  }

  canJump(column: string, sample: DatabaseQueryCell): boolean {
    return !!this.relationOf(column) && sample != null && String(sample) !== '';
  }

  relationLabel(column: string): string {
    const jump = this.relationOf(column);
    if (!jump)
      return '';
    return jump.schema ? `${jump.schema}.${jump.table}` : jump.table;
  }

  handleRelationJump(event: Event, row: number, column: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.relationJump.emit({ row, column });
  }

  handleHeaderRelation(event: Event, column: string): void {
    event.preventDefault();
    event.stopPropagation();
    const row = this.selected()?.row ?? this.selectedRows()[0];
    if (row == null)
      return;
    this.relationJump.emit({ row, column });
  }

  handleResizeStart(event: PointerEvent, column: string): void {
    if (event.button !== 0)
      return;
    event.preventDefault();
    event.stopPropagation();
    this.resizeStartX = event.clientX;
    this.resizeStartWidth = this.widthOf(column);
    this.resizeColumn.set(column);
    this.bindResize();
  }

  handleCopy(): void {
    const selected = this.copySelectionText();
    if (selected) {
      void navigator.clipboard?.writeText(selected);
      return;
    }
    const table = this.table();
    if (!table)
      return;
    void navigator.clipboard?.writeText(formatDatabaseQueryResult(table, 'tsv'));
  }

  handleGridKey(event: KeyboardEvent): void {
    const target = event.target;
    if (target instanceof HTMLElement) {
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable)
        return;
    }
    const table = this.table();
    const rows = this.filteredRows();
    if (!table || rows.length === 0)
      return;
    const colCount = table.columns.length;
    if (colCount === 0)
      return;
    const current = this.selected() ?? { row: rows[0]!.index, col: 0 };
    let row = current.row;
    let col = current.col;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const pos = rows.findIndex((entry) => entry.index === row);
      if (pos >= 0 && pos < rows.length - 1)
        row = rows[pos + 1]!.index;
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const pos = rows.findIndex((entry) => entry.index === row);
      if (pos > 0)
        row = rows[pos - 1]!.index;
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      col = Math.min(colCount - 1, col + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      col = Math.max(0, col - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.handleEdit(row, col);
      return;
    } else {
      return;
    }
    this.selected.set({ row, col });
    const column = table.columns[col] ?? '';
    this.gridLive.set(`Row ${this.offset() + row + 1}, column ${column}`);
  }

  handleCopyKey(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'c' || event.altKey || event.shiftKey)
      return;
    if (this.editing())
      return;
    const target = event.target;
    if (!(target instanceof Node) || !this.host.nativeElement.contains(target))
      return;
    const native = window.getSelection()?.toString();
    if (native)
      return;
    const text = this.copySelectionText();
    if (!text)
      return;
    event.preventDefault();
    void navigator.clipboard?.writeText(text);
  }

  handleExport(format: DatabaseQueryExportFormat): void {
    const table = this.table();
    if (!table)
      return;
    const text = formatDatabaseQueryResult(table, format);
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `query.${format}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  cellText(value: DatabaseQueryCell): string {
    return value === null ? 'NULL' : String(value);
  }

  private copySelectionText(): string | null {
    const table = this.table();
    if (!table)
      return null;
    const rows = this.selectedRows();
    if (rows.length > 1) {
      const lines = rows
        .map((row) => table.rows[row])
        .filter((row): row is readonly DatabaseQueryCell[] => !!row)
        .map((row) => row.map((cell) => this.cellText(cell ?? null)).join('\t'));
      return lines.length ? lines.join('\n') : null;
    }
    const selected = this.selected();
    if (!selected)
      return null;
    const value = table.rows[selected.row]?.[selected.col];
    return value === undefined ? null : this.cellText(value ?? null);
  }

  editValue(value: DatabaseQueryCell): string {
    return value === null ? '' : String(value);
  }

  isDirty(row: number, column: string): boolean {
    return this.dirtyKeys().has(`${row}:${column}`);
  }

  rowKind(row: number): TableDataRowKind {
    return this.rowKinds()[row] ?? 'existing';
  }

  private bindResize(): void {
    if (this.dragBound)
      return;
    this.dragBound = true;
    window.addEventListener('pointermove', this.handleResizeMove);
    window.addEventListener('pointerup', this.handleResizeEnd);
    window.addEventListener('pointercancel', this.handleResizeEnd);
  }

  private unbindResize(): void {
    if (!this.dragBound)
      return;
    this.dragBound = false;
    window.removeEventListener('pointermove', this.handleResizeMove);
    window.removeEventListener('pointerup', this.handleResizeEnd);
    window.removeEventListener('pointercancel', this.handleResizeEnd);
  }

  private bindRangeDrag(): void {
    if (this.rangeBound)
      return;
    this.rangeBound = true;
    window.addEventListener('pointermove', this.handleRangeMove);
    window.addEventListener('pointerup', this.handleRangeEnd);
    window.addEventListener('pointercancel', this.handleRangeEnd);
  }

  private unbindRangeDrag(): void {
    this.rangeDragging = false;
    if (!this.rangeBound)
      return;
    this.rangeBound = false;
    window.removeEventListener('pointermove', this.handleRangeMove);
    window.removeEventListener('pointerup', this.handleRangeEnd);
    window.removeEventListener('pointercancel', this.handleRangeEnd);
  }

  private readonly handleRangeMove = (event: PointerEvent): void => {
    if (!this.rangeDragging)
      return;
    const row = this.rowFromPoint(event.clientX, event.clientY);
    if (row == null)
      return;
    const next = applyRangeSelect({
      ids: this.filteredRows().map((entry) => String(entry.index)),
      anchorId: this.selectionAnchor,
      targetId: String(row),
    });
    this.selectionAnchor = next.anchorId;
    this.selectedRows.set(next.ids.map((id) => Number(id)));
    this.selected.update((current) => ({ row, col: current?.col ?? 0 }));
    this.emitRowSelection(row);
  };

  private readonly handleRangeEnd = (): void => {
    this.unbindRangeDrag();
  };

  private rowFromPoint(x: number, y: number): number | null {
    const node = document.elementFromPoint(x, y);
    if (!(node instanceof Element))
      return null;
    const row = node.closest('[data-grid-row]');
    if (!(row instanceof HTMLElement))
      return null;
    const value = Number(row.dataset['gridRow']);
    return Number.isFinite(value) ? value : null;
  }

  private readonly handleResizeMove = (event: PointerEvent): void => {
    const column = this.resizeColumn();
    if (!column)
      return;
    const next = clampColumnWidth(this.resizeStartWidth + (event.clientX - this.resizeStartX));
    this.columnWidths.update((current) => ({ ...current, [column]: next }));
  };

  private readonly handleResizeEnd = (): void => {
    this.resizeColumn.set(null);
    this.unbindResize();
  };

  private applyFocusedRow(row: number, column?: string): void {
    const table = this.table();
    const max = (table?.rows.length ?? 0) - 1;
    if (max < 0)
      return;
    const index = Math.min(Math.max(0, row), max);
    const col = column && table ? table.columns.indexOf(column) : 0;
    this.selected.set({ row: index, col: col < 0 ? 0 : col });
    this.selectedRows.set([index]);
    this.selectionAnchor = String(index);
    this.emitRowSelection(index);
    queueMicrotask(() => {
      const node = this.host.nativeElement.querySelector(`[data-grid-row="${index}"]`);
      if (node instanceof HTMLElement)
        node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }

  private emitValue(row: number, column: string, value: string): void {
    this.cellChange.emit({ row, column, value });
  }

  private applyRowPointerSelect(
    event: { readonly shiftKey: boolean; readonly ctrlKey: boolean; readonly metaKey: boolean },
    row: number,
  ): void {
    const targetId = String(row);
    const next = applyPointerSelect({
      event,
      visibleIds: this.filteredRows().map((entry) => String(entry.index)),
      selectedIds: this.selectedRows().map(String),
      anchorId: this.selectionAnchor,
      targetId,
    });
    this.selectionAnchor = next.anchorId;
    this.selectedRows.set(next.ids.map((id) => Number(id)));
    this.emitRowSelection(row);
  }

  private emitRowSelection(row: number): void {
    this.rowSelect.emit(row);
    this.rowsSelect.emit(this.selectedRows());
  }

  private menuIndexes(kinds: 'delete' | 'restore'): number[] {
    return (this.cellMenu()?.selectedRows ?? []).filter((row) => {
      const kind = this.rowKind(row);
      return kinds === 'restore' ? kind === 'deleted' : kind !== 'deleted';
    });
  }

  private openOverlayMenu(x: number, y: number): void {
    const position = this.overlay.position().global();
    const overlayRef = this.overlay.create({
      positionStrategy: position,
      scrollStrategy: this.overlay.scrollStrategies.close(),
      panelClass: 'tx-overlay-menu',
    });
    overlayRef.attach(new TemplatePortal(this.menuTemplate(), this.vcr));
    this.menuRef = overlayRef;
    this.placeCellMenu(overlayRef, position, x, y);
    requestAnimationFrame(() => {
      if (this.menuRef === overlayRef)
        this.placeCellMenu(overlayRef, position, x, y);
    });
    overlayRef.keydownEvents().subscribe((keyEvent) => {
      if (keyEvent.key !== 'Escape')
        return;
      keyEvent.preventDefault();
      this.closeCellMenu();
    });
    window.setTimeout(() => {
      if (this.menuRef !== overlayRef)
        return;
      overlayRef.outsidePointerEvents().subscribe(() => this.closeCellMenu());
    });
  }

  private closeDatePicker(): void {
    this.pickerRef?.dispose();
    this.pickerRef = null;
  }

  private closeCellMenu(immediate = false): void {
    const overlayRef = this.menuRef;
    if (!overlayRef) {
      this.cellMenu.set(null);
      return;
    }
    const dispose = (): void => {
      overlayRef.dispose();
      if (this.menuRef === overlayRef) {
        this.menuRef = null;
        this.cellMenu.set(null);
      }
    };
    if (immediate) {
      dispose();
      return;
    }
    const menu = overlayRef.overlayElement.querySelector('.tx-menu');
    playLeaveThen(menu instanceof HTMLElement ? menu : null, dispose);
  }

  private placeCellMenu(overlayRef: OverlayRef, position: GlobalPositionStrategy, x: number, y: number): void {
    const menu = overlayRef.overlayElement.querySelector('.tx-db-grid-menu');
    const width = menu instanceof HTMLElement && menu.offsetWidth ? menu.offsetWidth : 210;
    const height = menu instanceof HTMLElement && menu.offsetHeight ? menu.offsetHeight : 220;
    const margin = 8;
    const left = x + width > window.innerWidth - margin ? Math.max(margin, x - width) : x;
    const top = y + height > window.innerHeight - margin ? Math.max(margin, y - height) : y;
    position.left(`${left}px`).top(`${top}px`);
    overlayRef.updatePosition();
  }

  handleWindowResize(): void {
    this.closeCellMenu();
    this.closeDatePicker();
  }
}
