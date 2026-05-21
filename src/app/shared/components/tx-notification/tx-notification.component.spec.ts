import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TxIconService } from '../../icons/tx-icon.service';

import { TxNotificationComponent } from './tx-notification.component';

describe('TxNotificationComponent', () => {
  let fixture: ComponentFixture<TxNotificationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TxNotificationComponent],
      providers: [
        {
          provide: TxIconService,
          useValue: {
            loadIconInner: () => Promise.resolve('<circle cx="12" cy="12" r="3"/>'),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TxNotificationComponent);
    fixture.componentRef.setInput('message', 'Theme updated');
    fixture.componentRef.setInput('tone', 'success');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('renders the message and success tone', () => {
    const host = fixture.nativeElement as HTMLElement;
    expect(host.getAttribute('data-tone')).toBe('success');
    expect(host.textContent).toContain('Theme updated');
  });
});
