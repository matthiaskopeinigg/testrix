import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';

import { TxButtonComponent } from './tx-button.component';

describe('TxButtonComponent', () => {
  let fixture: ComponentFixture<TxButtonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TxButtonComponent],
      providers: [
        {
          provide: UiPreferencesService,
          useValue: { showIconTooltips: () => true },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TxButtonComponent);
    fixture.componentRef.setInput('loading', false);
    fixture.detectChanges();
  });

  it('renders projected label', () => {
    fixture.nativeElement.textContent = 'Save';
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Save');
  });

  it('shows spinner and aria-busy when loading', () => {
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button');
    expect(button.classList.contains('is-loading')).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('tx-spinner')).toBeTruthy();
  });

  it('does not emit pressed while loading', () => {
    const pressed = vi.fn();
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    fixture.componentInstance.pressed.subscribe(pressed);

    fixture.nativeElement.querySelector('button').click();
    expect(pressed).not.toHaveBeenCalled();
  });
});
