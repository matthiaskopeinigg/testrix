import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TxIconService } from '@app/shared/icons/tx-icon.service';

import { TxBannerComponent } from './tx-banner.component';

describe('TxBannerComponent', () => {
  let fixture: ComponentFixture<TxBannerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TxBannerComponent],
      providers: [
        {
          provide: TxIconService,
          useValue: {
            loadIconInner: () => Promise.resolve('<circle cx="12" cy="12" r="3"/>'),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TxBannerComponent);
    fixture.componentRef.setInput('title', 'Heads up');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('renders banner with variant and title', () => {
    fixture.componentRef.setInput('variant', 'warning');
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.getAttribute('data-variant')).toBe('warning');
    expect(host.getAttribute('role')).toBe('alert');
    expect(host.querySelector('.tx-banner__title')?.textContent).toContain('Heads up');
  });

  it('dismisses when dismissible', async () => {
    fixture.componentRef.setInput('dismissible', true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const dismiss = fixture.nativeElement.querySelector(
      '.tx-banner__dismiss',
    ) as HTMLButtonElement;
    dismiss.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.tx-banner')).toBeFalsy();
  });
});
