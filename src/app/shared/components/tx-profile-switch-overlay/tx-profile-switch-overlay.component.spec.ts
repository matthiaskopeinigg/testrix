import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TxIconService } from '../../icons/tx-icon.service';

import { TxProfileSwitchOverlayComponent } from './tx-profile-switch-overlay.component';

describe('TxProfileSwitchOverlayComponent', () => {
  let fixture: ComponentFixture<TxProfileSwitchOverlayComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TxProfileSwitchOverlayComponent],
      providers: [
        {
          provide: TxIconService,
          useValue: {
            loadIconInner: () => Promise.resolve('<circle cx="12" cy="12" r="3"/>'),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TxProfileSwitchOverlayComponent);
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('title', 'Switching to Demo');
    fixture.detectChanges();
  });

  it('renders the switching title', () => {
    const title = fixture.nativeElement.querySelector('#tx-profile-switch-title');
    expect(title?.textContent?.trim()).toBe('Switching to Demo');
  });
});
