import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { TxIconService } from '@app/shared/icons/tx-icon.service';

import { TxTabBarComponent } from './tx-tab-bar.component';

describe('TxTabBarComponent', () => {
  it('emits tabActivate when a tab is selected', async () => {
    await TestBed.configureTestingModule({
      imports: [TxTabBarComponent],
      providers: [
        {
          provide: TxIconService,
          useValue: {
            loadIconInner: () => Promise.resolve('<path d="M6 6l12 12"/>'),
          },
        },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<TxTabBarComponent> = TestBed.createComponent(TxTabBarComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('tabs', [
      { id: 'a', label: 'Tab A', active: true },
      { id: 'b', label: 'Tab B' },
    ]);
    fixture.detectChanges();

    const spy = vi.fn();
    component.tabActivate.subscribe(spy);

    const tab = fixture.nativeElement.querySelector('.tx-tab') as HTMLButtonElement;
    tab?.click();
    await fixture.whenStable();

    expect(spy).toHaveBeenCalledWith('a');
  });
});
