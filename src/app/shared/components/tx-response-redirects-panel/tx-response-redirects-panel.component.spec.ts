import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { ElectronService } from '@app/core/electron/electron.service';
import { TxIconService } from '@app/shared/icons/tx-icon.service';

import { TxResponseRedirectsPanelComponent } from './tx-response-redirects-panel.component';

describe('TxResponseRedirectsPanelComponent', () => {
  it('renders redirect hops', async () => {
    await TestBed.configureTestingModule({
      imports: [TxResponseRedirectsPanelComponent],
      providers: [
        {
          provide: ElectronService,
          useValue: { bridge: () => ({ openExternal: vi.fn() }) },
        },
        {
          provide: TxIconService,
          useValue: { loadIconInner: () => Promise.resolve('') },
        },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<TxResponseRedirectsPanelComponent> =
      TestBed.createComponent(TxResponseRedirectsPanelComponent);
    fixture.componentRef.setInput('redirects', [
      { from: 'https://a.test', to: 'https://b.test', statusCode: 302, timeMs: 12 },
    ]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('302');
    expect(el.textContent).toContain('https://a.test');
    expect(el.textContent).toContain('https://b.test');
  });
});
