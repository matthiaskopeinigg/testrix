import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { TxIconService } from '@app/shared/icons/tx-icon.service';

import { TxContextMenuComponent } from './tx-context-menu.component';

describe('TxContextMenuComponent', () => {
  it('renders menu items when open', async () => {
    await TestBed.configureTestingModule({
      imports: [TxContextMenuComponent],
      providers: [
        {
          provide: TxIconService,
          useValue: { loadIconInner: () => Promise.resolve('<path d="M0 0"/>') },
        },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<TxContextMenuComponent> = TestBed.createComponent(TxContextMenuComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('items', [{ id: 'a', label: 'Action A' }]);
    fixture.detectChanges();
    await fixture.whenStable();

    const panel = document.body.querySelector('.tx-context-menu');
    expect(panel?.textContent).toContain('Action A');
  });
});
