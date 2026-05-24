import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TxModalComponent } from './tx-modal.component';

describe('TxModalComponent', () => {
  let fixture: ComponentFixture<TxModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TxModalComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TxModalComponent);
    fixture.componentRef.setInput('title', 'Delete item');
  });

  afterEach(() => {
    document.body.querySelectorAll('.tx-modal-root').forEach((node) => node.remove());
    vi.useRealTimers();
  });

  it('portals the modal root to document.body when open', async () => {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    await fixture.whenStable();

    const root = document.body.querySelector('.tx-modal-root');
    expect(root).toBeTruthy();
    expect(root?.textContent).toContain('Delete item');
  });

  it('plays a close transition before removing the modal from the DOM', async () => {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    await flushFrame();
    await flushFrame();

    vi.useFakeTimers();

    const root = document.body.querySelector('.tx-modal-root');
    expect(root?.classList.contains('tx-modal-root--shown')).toBe(true);

    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();

    expect(document.body.querySelector('.tx-modal-root')).toBeTruthy();
    expect(root?.classList.contains('tx-modal-root--shown')).toBe(false);

    vi.advanceTimersByTime(180);
    fixture.detectChanges();

    expect(document.body.querySelector('.tx-modal-root')).toBeNull();
  });
});

function flushFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}
