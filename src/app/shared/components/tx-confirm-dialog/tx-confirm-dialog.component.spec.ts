import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { TxConfirmDialogComponent } from './tx-confirm-dialog.component';

describe('TxConfirmDialogComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TxConfirmDialogComponent],
    }).compileComponents();
  });

  it('emits confirmed when confirm handler runs', async () => {
    const fixture = TestBed.createComponent(TxConfirmDialogComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('message', 'Delete all logs?');
    fixture.detectChanges();
    await fixture.whenStable();

    const modal = document.body.querySelector('.tx-modal-root');
    expect(modal?.textContent).toContain('Delete all logs?');

    const confirmed = vi.fn();
    fixture.componentInstance.confirmed.subscribe(confirmed);

    fixture.componentInstance['handleConfirm']();
    expect(confirmed).toHaveBeenCalled();
  });

  it('emits cancelled when the backdrop is clicked', async () => {
    const fixture = TestBed.createComponent(TxConfirmDialogComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('message', 'Delete item?');
    fixture.detectChanges();
    await fixture.whenStable();

    const cancelled = vi.fn();
    const closed = vi.fn();
    fixture.componentInstance.cancelled.subscribe(cancelled);
    fixture.componentInstance.closed.subscribe(closed);

    const backdrop = document.body.querySelector('.tx-modal-backdrop') as HTMLButtonElement;
    backdrop.click();
    fixture.detectChanges();

    expect(cancelled).toHaveBeenCalled();
    expect(closed).toHaveBeenCalled();
  });
});
