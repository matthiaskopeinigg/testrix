import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('uses the danger button variant for destructive confirmations', async () => {
    const fixture = TestBed.createComponent(TxConfirmDialogComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('message', 'Delete item?');
    fixture.componentRef.setInput('variant', 'danger');
    fixture.detectChanges();
    await fixture.whenStable();

    const confirmButton = document.body.querySelector(
      '.tx-confirm-dialog__actions tx-button button[data-variant="danger"]',
    );
    expect(confirmButton).toBeTruthy();
  });
});
