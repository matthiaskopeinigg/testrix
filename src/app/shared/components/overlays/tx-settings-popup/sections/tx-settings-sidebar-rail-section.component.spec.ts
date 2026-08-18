import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { TxIconService } from '@app/shared/icons/tx-icon.service';
import { DEFAULT_WORKSPACE_SIDEBAR_ITEM_ORDER } from '@shared/config';

import { TxSettingsSidebarRailSectionComponent } from './tx-settings-sidebar-rail-section.component';

describe('TxSettingsSidebarRailSectionComponent', () => {
  let fixture: ComponentFixture<TxSettingsSidebarRailSectionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TxSettingsSidebarRailSectionComponent],
      providers: [
        {
          provide: TxIconService,
          useValue: {
            loadIconInner: () => Promise.resolve('<path d="M6 6l12 12"/>'),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TxSettingsSidebarRailSectionComponent);
    fixture.componentRef.setInput('order', [...DEFAULT_WORKSPACE_SIDEBAR_ITEM_ORDER]);
    fixture.componentRef.setInput('hidden', ['development']);
    fixture.detectChanges();
  });

  it('renders configurable sidebar items', () => {
    const labels = [...fixture.nativeElement.querySelectorAll('.tx-settings-sidebar-rail__label')].map(
      (el: HTMLElement) => el.textContent?.trim(),
    );
    expect(labels).toEqual(['Collections', 'Environments', 'Testing', 'Database', 'Development', 'History']);
  });

  it('emits a moved order', () => {
    const handler = vi.fn();
    fixture.componentInstance.orderChange.subscribe(handler);
    fixture.componentInstance['handleMove']('collections', 1);
    expect(handler).toHaveBeenCalledWith([
      'environments',
      'collections',
      'testing',
      'data',
      'development',
      'history',
    ]);
  });

  it('emits hidden items when visibility changes', () => {
    const handler = vi.fn();
    fixture.componentInstance.hiddenChange.subscribe(handler);
    fixture.componentInstance['handleVisibleChange']('development', true);
    expect(handler).toHaveBeenCalledWith([]);
  });
});
