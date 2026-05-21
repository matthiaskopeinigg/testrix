import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';

import { TxIconService } from '@app/shared/icons/tx-icon.service';

import { TxKeyValueDescriptionListComponent } from './tx-key-value-description-list.component';

describe('TxKeyValueDescriptionListComponent', () => {
  let fixture: ComponentFixture<TxKeyValueDescriptionListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TxKeyValueDescriptionListComponent],
      providers: [
        { provide: TxIconService, useValue: { loadIconInner: () => Promise.resolve('<path d="M0 0"/>') } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TxKeyValueDescriptionListComponent);
    fixture.detectChanges();
  });

  it('shows empty state', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('No rows yet');
  });

  it('renders description column and value help when using variables', () => {
    fixture.componentRef.setInput('rows', [{ id: 'r1', key: 'k', value: 'v', description: 'my note' }]);
    fixture.componentRef.setInput('valueInput', 'variables');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.tx-kv-desc-list__value-hint')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Description');
    expect(fixture.nativeElement.querySelector('#kvdd-r1, [id="kvdd-r1"]')).toBeTruthy();
  });

  it('emits a new row on add', () => {
    const emitted: unknown[] = [];
    fixture.componentRef.setInput('rows', []);
    fixture.componentInstance.rowsChange.subscribe((rows) => emitted.push(rows));
    fixture.detectChanges();

    fixture.componentInstance['handleAdd']();

    expect(emitted.length).toBe(1);
    expect((emitted[0] as { length: number }).length).toBe(1);
  });
});
