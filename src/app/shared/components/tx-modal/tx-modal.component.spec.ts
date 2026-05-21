import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { TxModalComponent } from './tx-modal.component';

describe('TxModalComponent', () => {
  it('portals the modal root to document.body when open', async () => {
    await TestBed.configureTestingModule({
      imports: [TxModalComponent],
    }).compileComponents();

    const fixture: ComponentFixture<TxModalComponent> = TestBed.createComponent(TxModalComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('title', 'Delete item');
    fixture.detectChanges();
    await fixture.whenStable();

    const root = document.body.querySelector('.tx-modal-root');
    expect(root).toBeTruthy();
    expect(root?.textContent).toContain('Delete item');
  });
});
