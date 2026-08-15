import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import {
  formatDatabaseQueryClipboardTsv,
  nextDatabaseQuerySort,
  normalizeDatabaseQueryCellRange,
  sortDatabaseQueryRows,
  classifySqlColumnType,
  normalizeSqlBooleanValue,
  type DatabaseQueryCellRange,
  type DatabaseQuerySortState,
  type SqlColumnEditKind,
} from '@shared/database';

import { TxContextMenuComponent } from '../../overlays/tx-context-menu/tx-context-menu.component';
import type { TxContextMenuItem, TxContextMenuPosition } from '../../overlays/tx-context-menu/tx-context-menu.types';
import { TxIconComponent } from '../../forms/tx-icon/tx-icon.component';
import { TxInlineRenameInputComponent } from '../../forms/tx-inline-rename-input/tx-inline-rename-input.component';
import { TxAutofocusDirective } from '../../../directives/tx-autofocus.directive';

import type {
  TxDataGridCell,
  TxDataGridCellCommitEvent,
  TxDataGridCopyEvent,
  TxDataGridExportEvent,
  TxDataGridRowKind,
} from './tx-data-grid.types';

/**
 * Spreadsheet-style result grid with a row-number gutter, NULL styling, and cell selection.
 */
@Component({
  selector: 'tx-data-grid',
  standalone: true,
  imports: [TxContextMenuComponent, TxIconComponent, TxInlineRenameInputComponent, TxAutofocusDirective],
  templateUrl: './tx-data-grid.component.html',
  styleUrl: './tx-data-grid.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tx-data-grid-host',
    tabindex: '0',
    role: 'grid',
    '[attr.aria-label]': "'Query results'",
  },
})
export class TxDataGridComponent {
  private readonly hostRef = inject(ElementRef<HTMLElement>);

  readonly columns = input<readonly string[]>([]);
  readonly rows = input<readonly (readonly (string | null)[])[]>([]);
  readonly columnTypes = input<readonly string[]>([]);
  /** Column names that should show a primary-key marker in the header. */
  readonly primaryKeyColumns = input<readonly string[]>([]);
  readonly emptyLabel = input('Query returned no rows.');
  readonly editable = input(false);
  readonly sortDisabled = input(false);
  readonly rowKinds = input<readonly TxDataGridRowKind[]>([]);
  readonly dirtyCells = input<ReadonlySet<string>>(new Set());

  readonly selectionChange = output<DatabaseQueryCellRange | null>();
  readonly copied = output<TxDataGridCopyEvent>();
  readonly exportRequest = output<TxDataGridExportEvent>();
  readonly cellCommit = output<TxDataGridCellCommitEvent>();
  readonly addRow = output<void>();
  readonly deleteRow = output<number>();
  readonly setNull = output<TxDataGridCellCommitEvent>();

  private readonly sort = signal<DatabaseQuerySortState | null>(null);
  private readonly anchor = signal<TxDataGridCell | null>(null);
  private readonly active = signal<TxDataGridCell | null>(null);
  protected readonly menuOpen = signal(false);
  protected readonly menuPosition = signal<TxContextMenuPosition>({ x: 0, y: 0 });
  protected readonly editing = signal<{ readonly row: number; readonly col: number; value: string } | null>(
    null,
  );

  protected readonly displayedRows = computed(() => sortDatabaseQueryRows(this.rows(), this.sort()));

  protected readonly selection = computed((): DatabaseQueryCellRange | null => {
    const start = this.anchor();
    const end = this.active();
    if (!start || !end) {
      return null;
    }
    return normalizeDatabaseQueryCellRange({
      startRow: start.row,
      startCol: start.col,
      endRow: end.row,
      endCol: end.col,
    });
  });

  protected readonly menuItems = computed((): readonly TxContextMenuItem[] => {
    const hasSelection = this.selection() !== null;
    const items: TxContextMenuItem[] = [
      { id: 'copy', label: 'Copy', icon: 'copy', disabled: !hasSelection },
      { id: 'copy-all', label: 'Copy all', icon: 'copy', disabled: this.displayedRows().length === 0 },
      { id: 'sep-export', label: '', separator: true },
      { id: 'export-selection', label: 'Export selection…', icon: 'download', disabled: !hasSelection },
      { id: 'export-all', label: 'Export all…', icon: 'download', disabled: this.displayedRows().length === 0 },
    ];
    if (!this.editable()) {
      return items;
    }
    const row = this.active()?.row ?? 0;
    const kind = this.rowKind(row);
    return [
      ...items,
      { id: 'sep-edit', label: '', separator: true },
      {
        id: 'set-null',
        label: 'Set NULL',
        icon: 'close',
        disabled: !hasSelection || kind === 'deleted',
      },
      { id: 'delete-row', label: 'Delete row', icon: 'trash', danger: true, disabled: this.displayedRows().length === 0 },
      { id: 'add-row', label: 'Add row', icon: 'plus' },
    ];
  });

  constructor() {
    effect(() => {
      this.columns();
      this.rows();
      this.sort.set(null);
      this.anchor.set(null);
      this.active.set(null);
      this.menuOpen.set(false);
      this.editing.set(null);
    });
  }

  protected isSelected(row: number, col: number): boolean {
    const range = this.selection();
    if (!range) {
      return false;
    }
    return row >= range.startRow && row <= range.endRow && col >= range.startCol && col <= range.endCol;
  }

  protected isActive(row: number, col: number): boolean {
    const cell = this.active();
    return cell?.row === row && cell?.col === col;
  }

  protected handleCellClick(event: MouseEvent, row: number, col: number): void {
    if (this.isEditing(row, col)) {
      return;
    }
    this.selectCell(row, col, event.shiftKey);
  }

  protected handleCellDblClick(event: MouseEvent, row: number, col: number): void {
    event.preventDefault();
    this.selectCell(row, col, false);
    this.beginEdit(row, col);
  }

  protected handleHeaderClick(event: MouseEvent, col: number): void {
    this.hostRef.nativeElement.focus();
    const lastRow = this.displayedRows().length - 1;
    if (event.shiftKey) {
      if (lastRow < 0) {
        return;
      }
      if (this.anchor()) {
        this.active.set({ row: lastRow, col });
      } else {
        this.anchor.set({ row: 0, col });
        this.active.set({ row: lastRow, col });
      }
      this.emitSelection();
      return;
    }
    if (this.sortDisabled()) {
      return;
    }
    this.sort.set(nextDatabaseQuerySort(this.sort(), col));
  }

  protected handleRowGutterClick(event: MouseEvent, row: number): void {
    this.hostRef.nativeElement.focus();
    const lastCol = this.columns().length - 1;
    if (lastCol < 0) {
      return;
    }
    if (event.shiftKey && this.anchor()) {
      this.active.set({ row, col: lastCol });
    } else {
      this.anchor.set({ row, col: 0 });
      this.active.set({ row, col: lastCol });
    }
    this.emitSelection();
  }

  protected handleContextMenu(event: MouseEvent): void {
    event.preventDefault();
    if (!this.selection() && this.displayedRows().length > 0 && this.columns().length > 0) {
      this.selectCell(0, 0, false);
    }
    this.menuPosition.set({ x: event.clientX, y: event.clientY });
    this.menuOpen.set(true);
  }

  protected handleMenuClosed(): void {
    this.menuOpen.set(false);
  }

  protected handleMenuSelect(id: string): void {
    this.menuOpen.set(false);
    if (id === 'copy') {
      void this.copySelection();
      return;
    }
    if (id === 'copy-all') {
      void this.copyAll();
      return;
    }
    if (id === 'export-selection') {
      this.exportRequest.emit({ scope: 'selection', position: this.menuPosition() });
      return;
    }
    if (id === 'export-all') {
      this.exportRequest.emit({ scope: 'all', position: this.menuPosition() });
      return;
    }
    if (id === 'set-null') {
      const cell = this.active();
      if (!cell) {
        return;
      }
      this.setNull.emit({ row: cell.row, col: cell.col, value: null });
      return;
    }
    if (id === 'delete-row') {
      const row = this.active()?.row ?? 0;
      this.deleteRow.emit(row);
      return;
    }
    if (id === 'add-row') {
      this.addRow.emit();
    }
  }

  @HostListener('keydown', ['$event'])
  protected handleKeydown(event: KeyboardEvent): void {
    if (this.menuOpen() || this.editing()) {
      return;
    }
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      void this.copySelection();
      return;
    }
    if (mod && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      this.selectAll();
      return;
    }
    if (this.editable() && (event.key === 'F2' || event.key === 'Enter')) {
      const cell = this.active();
      if (cell) {
        event.preventDefault();
        this.beginEdit(cell.row, cell.col);
      }
      return;
    }
    const delta = keyDelta(event.key);
    if (!delta) {
      return;
    }
    event.preventDefault();
    const current = this.active() ?? { row: 0, col: 0 };
    const next = {
      row: clamp(current.row + delta.row, 0, Math.max(0, this.displayedRows().length - 1)),
      col: clamp(current.col + delta.col, 0, Math.max(0, this.columns().length - 1)),
    };
    this.selectCell(next.row, next.col, event.shiftKey);
  }

  protected isEditing(row: number, col: number): boolean {
    const current = this.editing();
    return current?.row === row && current?.col === col;
  }

  protected isDirty(row: number, col: number): boolean {
    return this.dirtyCells().has(`${row}:${col}`);
  }

  protected rowKind(row: number): TxDataGridRowKind {
    return this.rowKinds()[row] ?? 'existing';
  }

  protected handleEditCommitted(value: string): void {
    const current = this.editing();
    if (!current) {
      return;
    }
    this.editing.set(null);
    this.cellCommit.emit({ row: current.row, col: current.col, value });
    this.hostRef.nativeElement.focus();
  }

  protected handleEditCancel(): void {
    this.editing.set(null);
    this.hostRef.nativeElement.focus();
  }

  protected columnEditKind(index: number): SqlColumnEditKind {
    return classifySqlColumnType(this.columnType(index));
  }

  protected booleanDraft(): string {
    return normalizeSqlBooleanValue(this.editing()?.value) ?? '';
  }

  protected handleBoolChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value !== 'true' && value !== 'false') {
      return;
    }
    this.handleEditCommitted(value);
  }

  protected handleBoolKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      this.handleEditCancel();
    }
  }

  private beginEdit(row: number, col: number): void {
    if (!this.editable() || this.rowKind(row) === 'deleted') {
      return;
    }
    const cell = this.displayedRows()[row]?.[col];
    const kind = this.columnEditKind(col);
    const value =
      kind === 'boolean' ? (normalizeSqlBooleanValue(cell) ?? '') : (cell ?? '');
    this.editing.set({ row, col, value });
  }

  /**
   * Copies the current selection as TSV. Used by the Query tab Copy all control.
   */
  async copySelection(): Promise<boolean> {
    const range = this.selection();
    if (!range) {
      return false;
    }
    return this.writeClipboard(range);
  }

  /**
   * Selects every cell and copies TSV.
   */
  async copyAll(): Promise<boolean> {
    this.selectAll();
    const range = this.selection();
    if (!range) {
      return false;
    }
    return this.writeClipboard(range);
  }

  /**
   * Returns the current inclusive cell range, or `null` when nothing is selected.
   */
  currentSelection(): DatabaseQueryCellRange | null {
    return this.selection();
  }

  protected columnType(index: number): string {
    return this.columnTypes()[index] ?? '';
  }

  /** True when this column is listed as a primary key. */
  protected isPrimaryKey(index: number): boolean {
    const name = this.columns()[index];
    return Boolean(name && this.primaryKeyColumns().includes(name));
  }

  /** True when PK metadata is present so headers can show column glyphs. */
  protected showColumnGlyphs(): boolean {
    return this.primaryKeyColumns().length > 0;
  }

  protected sortDirection(index: number): 'asc' | 'desc' | null {
    const sort = this.sort();
    return sort?.columnIndex === index ? sort.direction : null;
  }

  private selectAll(): void {
    const lastRow = this.displayedRows().length - 1;
    const lastCol = this.columns().length - 1;
    if (lastRow < 0 || lastCol < 0) {
      return;
    }
    this.anchor.set({ row: 0, col: 0 });
    this.active.set({ row: lastRow, col: lastCol });
    this.emitSelection();
  }

  private selectCell(row: number, col: number, extend: boolean): void {
    const editing = this.editing();
    if (editing && (editing.row !== row || editing.col !== col)) {
      this.editing.set(null);
    }
    this.hostRef.nativeElement.focus();
    if (!extend || !this.anchor()) {
      this.anchor.set({ row, col });
    }
    this.active.set({ row, col });
    this.emitSelection();
  }

  private emitSelection(): void {
    this.selectionChange.emit(this.selection());
  }

  private async writeClipboard(range: DatabaseQueryCellRange): Promise<boolean> {
    const text = formatDatabaseQueryClipboardTsv(
      { columns: this.columns(), rows: this.displayedRows() },
      range,
    );
    try {
      await navigator.clipboard.writeText(text);
      this.copied.emit({ text, range });
      return true;
    } catch {
      return false;
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function keyDelta(key: string): TxDataGridCell | null {
  switch (key) {
    case 'ArrowUp':
      return { row: -1, col: 0 };
    case 'ArrowDown':
      return { row: 1, col: 0 };
    case 'ArrowLeft':
      return { row: 0, col: -1 };
    case 'ArrowRight':
      return { row: 0, col: 1 };
    default:
      return null;
  }
}
