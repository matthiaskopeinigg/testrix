import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { TxIconService } from '@app/shared/icons/tx-icon.service';

import { TxKeyValueListComponent } from './tx-key-value-list.component';

describe('TxKeyValueListComponent', () => {
  it('adds and removes rows', async () => {
    await TestBed.configureTestingModule({
      imports: [TxKeyValueListComponent],
      providers: [
        {
          provide: TxIconService,
          useValue: { loadIconInner: () => Promise.resolve('<path d="M0 0"/>') },
        },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<TxKeyValueListComponent> = TestBed.createComponent(TxKeyValueListComponent);
    fixture.componentRef.setInput('rows', []);
    fixture.detectChanges();

    const emitted: unknown[][] = [];
    fixture.componentInstance.rowsChange.subscribe((rows) => emitted.push([...rows]));

    fixture.componentInstance['handleAdd']();
    expect(emitted[0]?.length).toBe(1);

    const id = (emitted[0]?.[0] as { id: string } | undefined)?.id;
    expect(id).toBeTruthy();
    fixture.componentInstance['handleKeyChange'](id!, 'X-Test');
    fixture.componentInstance['handleRemove'](id!);
    expect(emitted.at(-1)?.length).toBe(0);
  });

  it('renders compact rows without per-row Key/Value labels', async () => {
    await TestBed.configureTestingModule({
      imports: [TxKeyValueListComponent],
      providers: [
        {
          provide: TxIconService,
          useValue: { loadIconInner: () => Promise.resolve('<path d="M0 0"/>') },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(TxKeyValueListComponent);
    fixture.componentRef.setInput('compact', true);
    fixture.componentRef.setInput('rows', [
      { id: 'h1', enabled: true, key: 'X-Custom', value: '$uuid' },
    ]);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.tx-key-value-list__compact-list')).not.toBeNull();
    expect(host.querySelector('.tx-field__label')).toBeNull();
    expect(host.querySelectorAll('.tx-key-value-list__sr-only').length).toBe(2);
  });

  it('infers http header suggest input from add label', async () => {
    await TestBed.configureTestingModule({
      imports: [TxKeyValueListComponent],
      providers: [
        {
          provide: TxIconService,
          useValue: { loadIconInner: () => Promise.resolve('<path d="M0 0"/>') },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(TxKeyValueListComponent);
    fixture.componentRef.setInput('addLabel', 'Add header');
    fixture.componentRef.setInput('rows', [{ id: 'h1', enabled: true, key: '', value: '' }]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('tx-suggest-input')).toBeTruthy();
  });

  it('uses suggest input for http header keys', async () => {
    await TestBed.configureTestingModule({
      imports: [TxKeyValueListComponent],
      providers: [
        {
          provide: TxIconService,
          useValue: { loadIconInner: () => Promise.resolve('<path d="M0 0"/>') },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(TxKeyValueListComponent);
    fixture.componentRef.setInput('keyInput', 'http-headers');
    fixture.componentRef.setInput('rows', [{ id: 'h1', enabled: true, key: '', value: '' }]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('tx-suggest-input')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('tx-input')).toBeNull();
  });
});
