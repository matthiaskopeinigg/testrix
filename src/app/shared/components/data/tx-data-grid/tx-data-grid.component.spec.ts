import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { TxIconService } from '@app/shared/icons/tx-icon.service';

import { TxDataGridComponent } from './tx-data-grid.component';
import { TX_DATA_GRID_DEMO_COLUMNS, TX_DATA_GRID_DEMO_ROWS } from './tx-data-grid.types';

describe('TxDataGridComponent', () => {
  let fixture: ComponentFixture<TxDataGridComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TxDataGridComponent],
      providers: [
        {
          provide: TxIconService,
          useValue: { loadIconInner: () => Promise.resolve('<path d="M0 0"/>') },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TxDataGridComponent);
    fixture.componentRef.setInput('columns', TX_DATA_GRID_DEMO_COLUMNS);
    fixture.componentRef.setInput('rows', TX_DATA_GRID_DEMO_ROWS);
    fixture.detectChanges();
  });

  it('renders a row-number gutter and NULL placeholder', () => {
    const host = fixture.nativeElement as HTMLElement;
    const gutters = host.querySelectorAll('tbody .tx-data-grid__gutter');
    expect(gutters.length).toBe(TX_DATA_GRID_DEMO_ROWS.length);
    expect(gutters[0]?.textContent?.trim()).toBe('1');
    expect(host.querySelector('.tx-data-grid__null')?.textContent).toBe('<null>');
  });

  it('selects a cell on click', () => {
    const host = fixture.nativeElement as HTMLElement;
    const cell = host.querySelector('tbody td') as HTMLTableCellElement;
    cell.click();
    fixture.detectChanges();
    expect(host.querySelector('.tx-data-grid__cell--active')).not.toBeNull();
    expect(fixture.componentInstance.currentSelection()).toEqual({
      startRow: 0,
      startCol: 0,
      endRow: 0,
      endCol: 0,
    });
  });

  it('cycles header sort on click and keeps column select on Shift+click', () => {
    const host = fixture.nativeElement as HTMLElement;
    const header = host.querySelectorAll('thead th')[1] as HTMLTableCellElement;
    header.click();
    fixture.detectChanges();
    expect(host.querySelector('.tx-data-grid__header tx-icon')).not.toBeNull();

    header.dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.currentSelection()).toEqual({
      startRow: 0,
      startCol: 0,
      endRow: TX_DATA_GRID_DEMO_ROWS.length - 1,
      endCol: 0,
    });
  });

  it('copies the selection as TSV without a header', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const host = fixture.nativeElement as HTMLElement;
    (host.querySelector('tbody td') as HTMLTableCellElement).click();
    fixture.detectChanges();
    await fixture.componentInstance.copySelection();
    expect(writeText).toHaveBeenCalledWith('1');
  });

  it('starts an editor on double-click when editable', () => {
    fixture.componentRef.setInput('editable', true);
    fixture.detectChanges();
    const cell = (fixture.nativeElement as HTMLElement).querySelector('tbody td') as HTMLTableCellElement;
    cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    fixture.detectChanges();
    const editor = (fixture.nativeElement as HTMLElement).querySelector(
      'tx-inline-rename-input',
    ) as HTMLElement;
    expect(editor).not.toBeNull();
    expect(editor.classList.contains('tx-inline-rename-input-host--cell')).toBe(true);
    expect(cell.classList.contains('tx-data-grid__cell--active')).toBe(true);
    expect(cell.classList.contains('tx-data-grid__cell--editing')).toBe(true);
    const input = editor.querySelector('input') as HTMLInputElement;
    expect(input.getAttribute('size')).toBe('1');
  });

  it('keeps editing after a click inside the cell editor', async () => {
    fixture.componentRef.setInput('editable', true);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const cell = host.querySelector('tbody td') as HTMLTableCellElement;
    cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    fixture.detectChanges();
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
    fixture.detectChanges();

    const editor = host.querySelector('tx-inline-rename-input') as HTMLElement;
    const input = editor.querySelector('input') as HTMLInputElement;
    expect(document.activeElement).toBe(input);

    input.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    input.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(host.querySelector('tx-inline-rename-input')).not.toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it('truncates long displayed cells and keeps the full value on title', () => {
    fixture.componentRef.setInput('columns', ['password']);
    fixture.componentRef.setInput('rows', [['a'.repeat(80)]]);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).querySelector(
      '.tx-data-grid__cell-text',
    ) as HTMLElement;
    expect(text.title.length).toBe(80);
    expect(text.classList.contains('tx-data-grid__cell-text')).toBe(true);
  });

  it('edits boolean columns with a true/false select', () => {
    fixture.componentRef.setInput('editable', true);
    fixture.componentRef.setInput('columns', ['is_active']);
    fixture.componentRef.setInput('columnTypes', ['bool']);
    fixture.componentRef.setInput('rows', [['true']]);
    fixture.detectChanges();
    const cell = (fixture.nativeElement as HTMLElement).querySelector('tbody td') as HTMLTableCellElement;
    cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    fixture.detectChanges();
    const select = (fixture.nativeElement as HTMLElement).querySelector(
      '.tx-data-grid__bool-select',
    ) as HTMLSelectElement;
    expect(select).not.toBeNull();
    expect([...select.options].map((option) => option.value).filter(Boolean)).toEqual(['true', 'false']);
    expect((fixture.nativeElement as HTMLElement).querySelector('tx-inline-rename-input')).toBeNull();
  });

  it('renders column headers when there are no rows', () => {
    fixture.componentRef.setInput('columns', ['id', 'email']);
    fixture.componentRef.setInput('rows', []);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.tx-data-grid__empty')).toBeNull();
    const headers = [...host.querySelectorAll('thead .tx-data-grid__header-label')].map((el) =>
      el.textContent?.trim(),
    );
    expect(headers).toEqual(['id', 'email']);
    expect(host.querySelectorAll('tbody tr').length).toBe(0);
  });
});
