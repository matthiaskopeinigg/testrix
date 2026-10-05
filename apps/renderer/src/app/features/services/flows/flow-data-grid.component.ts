import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FLOW_SCENARIO_MAX_ROWS, type FlowScenarioData } from '@testrix/contracts';
import { TxCheckComponent, TxEmptyStateComponent, TxHintComponent, TxInputComponent } from '@testrix/ui';

import { TokenFieldComponent } from '../../workbench/request/token-field.component';
import { parseScenarioTable } from './flow-data-table';

@Component({
  selector: 'tx-flow-data-grid',
  standalone: true,
  imports: [TxCheckComponent, TxEmptyStateComponent, TxHintComponent, TxInputComponent, TokenFieldComponent],
  templateUrl: './flow-data-grid.component.html',
  styleUrl: './flow-data-grid.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlowDataGridComponent {
  readonly data = input.required<FlowScenarioData>();
  readonly scenarioName = input('Scenario');
  readonly variables = input<readonly string[]>([]);
  readonly changed = output<Partial<FlowScenarioData>>();

  readonly importText = signal('');
  readonly selectedRow = signal<number | null>(null);
  readonly selectedColumn = signal<string | null>(null);

  readonly runCount = computed(() => {
    const data = this.data();
    return data.enabled && data.rows.length > 0 ? data.rows.length : 1;
  });
  readonly cellVariables = computed(() => {
    const known = new Set(this.variables());
    for (const column of this.data().columns)
      known.add(column);
    return [...known];
  });
  readonly canAddRow = computed(() => this.data().rows.length < FLOW_SCENARIO_MAX_ROWS);
  readonly hasRowSelection = computed(() => {
    const row = this.selectedRow();
    return row !== null && row >= 0 && row < this.data().rows.length;
  });
  readonly hasColumnSelection = computed(() => {
    const column = this.selectedColumn();
    return !!column && this.data().columns.includes(column);
  });
  readonly selectionHint = computed(() => {
    const row = this.selectedRow();
    const column = this.selectedColumn();
    const parts: string[] = [];
    if (row !== null && row >= 0 && row < this.data().rows.length)
      parts.push(`Row ${row + 1}`);
    if (column && this.data().columns.includes(column))
      parts.push(column);
    return parts.length > 0 ? parts.join(' · ') : 'Select a row or column';
  });

  cell(rowIndex: number, column: string): string {
    return this.data().rows[rowIndex]?.[column] ?? '';
  }

  setEnabled(enabled: boolean): void {
    this.changed.emit({ enabled });
  }

  setCell(rowIndex: number, column: string, value: string): void {
    this.selectCell(rowIndex, column);
    const rows = this.data().rows.map((row, index) => (index === rowIndex ? { ...row, [column]: value } : row));
    this.changed.emit({ rows });
  }

  selectRow(index: number, event?: Event): void {
    event?.stopPropagation();
    this.selectedRow.set(index);
    this.selectedColumn.set(null);
  }

  selectColumn(column: string, event?: Event): void {
    event?.stopPropagation();
    this.selectedColumn.set(column);
    this.selectedRow.set(null);
  }

  selectCell(rowIndex: number, column: string): void {
    this.selectedRow.set(rowIndex);
    this.selectedColumn.set(column);
  }

  renameColumn(oldName: string, nextName: string): void {
    const name = nextName.trim();
    const data = this.data();
    if (!name || name === oldName || data.columns.includes(name))
      return;
    this.changed.emit({
      columns: data.columns.map((column) => (column === oldName ? name : column)),
      rows: data.rows.map((row) => {
        const next: Record<string, string> = {};
        for (const [key, value] of Object.entries(row))
          next[key === oldName ? name : key] = value;
        return next;
      }),
    });
    if (this.selectedColumn() === oldName)
      this.selectedColumn.set(name);
  }

  addColumn(afterColumn?: string | null): void {
    const data = this.data();
    const name = this.nextColumnName(data.columns);
    const anchor = afterColumn ?? this.selectedColumn();
    const at = anchor ? data.columns.indexOf(anchor) : -1;
    const columns =
      at >= 0
        ? [...data.columns.slice(0, at + 1), name, ...data.columns.slice(at + 1)]
        : [...data.columns, name];
    this.changed.emit({
      columns,
      rows: data.rows.map((row) => ({ ...row, [name]: '' })),
    });
    this.selectedColumn.set(name);
    this.selectedRow.set(null);
  }

  insertColumnBefore(): void {
    const data = this.data();
    const selected = this.selectedColumn();
    if (!selected)
      return;
    const at = data.columns.indexOf(selected);
    if (at < 0)
      return;
    const name = this.nextColumnName(data.columns);
    this.changed.emit({
      columns: [...data.columns.slice(0, at), name, ...data.columns.slice(at)],
      rows: data.rows.map((row) => ({ ...row, [name]: '' })),
    });
    this.selectedColumn.set(name);
    this.selectedRow.set(null);
  }

  removeSelectedColumn(): void {
    const column = this.selectedColumn();
    if (!column)
      return;
    this.removeColumn(column);
  }

  removeColumn(column: string): void {
    const data = this.data();
    const index = data.columns.indexOf(column);
    const columns = data.columns.filter((item) => item !== column);
    this.changed.emit({
      columns,
      rows: data.rows.map((row) => {
        const next = { ...row };
        delete next[column];
        return next;
      }),
    });
    if (this.selectedColumn() === column) {
      const fallback = columns[Math.min(index, columns.length - 1)] ?? null;
      this.selectedColumn.set(fallback);
    }
  }

  addRow(afterIndex?: number | null): void {
    const data = this.data();
    if (data.rows.length >= FLOW_SCENARIO_MAX_ROWS)
      return;
    if (data.columns.length === 0) {
      const name = this.nextColumnName([]);
      this.changed.emit({
        columns: [name],
        rows: [{ [name]: '' }],
        enabled: true,
      });
      this.selectedRow.set(0);
      this.selectedColumn.set(name);
      return;
    }
    const row = this.emptyRow(data.columns);
    const anchor = afterIndex ?? this.selectedRow();
    const at = anchor !== null && anchor >= 0 ? anchor : data.rows.length - 1;
    const rows =
      data.rows.length === 0
        ? [row]
        : [...data.rows.slice(0, at + 1), row, ...data.rows.slice(at + 1)];
    this.changed.emit({ rows, enabled: true });
    this.selectedRow.set(Math.min(at + 1, rows.length - 1));
    this.selectedColumn.set(null);
  }

  insertRowAbove(): void {
    const data = this.data();
    const selected = this.selectedRow();
    if (selected === null || data.rows.length >= FLOW_SCENARIO_MAX_ROWS)
      return;
    if (data.columns.length === 0)
      return;
    const row = this.emptyRow(data.columns);
    const rows = [...data.rows.slice(0, selected), row, ...data.rows.slice(selected)];
    this.changed.emit({ rows, enabled: true });
    this.selectedRow.set(selected);
    this.selectedColumn.set(null);
  }

  duplicateSelectedRow(): void {
    const data = this.data();
    const selected = this.selectedRow();
    if (selected === null || data.rows.length >= FLOW_SCENARIO_MAX_ROWS)
      return;
    const source = data.rows[selected];
    if (!source)
      return;
    const rows = [...data.rows.slice(0, selected + 1), { ...source }, ...data.rows.slice(selected + 1)];
    this.changed.emit({ rows, enabled: true });
    this.selectedRow.set(selected + 1);
    this.selectedColumn.set(null);
  }

  removeSelectedRow(): void {
    const selected = this.selectedRow();
    if (selected === null)
      return;
    this.removeRow(selected);
  }

  removeRow(index: number): void {
    const data = this.data();
    const rows = data.rows.filter((_row, i) => i !== index);
    this.changed.emit({ rows });
    if (rows.length === 0) {
      this.selectedRow.set(null);
      return;
    }
    this.selectedRow.set(Math.min(index, rows.length - 1));
  }

  clearSelectedRow(): void {
    const selected = this.selectedRow();
    const data = this.data();
    if (selected === null)
      return;
    const rows = data.rows.map((row, index) => {
      if (index !== selected)
        return row;
      const next: Record<string, string> = {};
      for (const column of data.columns)
        next[column] = '';
      return next;
    });
    this.changed.emit({ rows });
  }

  handleImport(text: string): void {
    this.importText.set(text);
    const parsed = parseScenarioTable(text);
    if (!parsed)
      return;
    this.changed.emit({ ...parsed, enabled: true });
    this.selectedRow.set(parsed.rows.length > 0 ? 0 : null);
    this.selectedColumn.set(parsed.columns[0] ?? null);
  }

  private emptyRow(columns: readonly string[]): Record<string, string> {
    const row: Record<string, string> = {};
    for (const column of columns)
      row[column] = '';
    return row;
  }

  private nextColumnName(columns: readonly string[]): string {
    let name = 'column';
    let counter = 1;
    while (columns.includes(name)) {
      counter += 1;
      name = `column${counter}`;
    }
    return name;
  }
}
