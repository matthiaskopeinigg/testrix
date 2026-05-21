import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TxIconService } from '@app/shared/icons/tx-icon.service';

import { TxInputComponent } from './tx-input.component';

describe('TxInputComponent', () => {
  let fixture: ComponentFixture<TxInputComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TxInputComponent],
      providers: [
        {
          provide: TxIconService,
          useValue: {
            loadIconInner: () => Promise.resolve('<path d="M6 6l12 12"/>'),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TxInputComponent);
    fixture.detectChanges();
  });

  it('creates a text input', () => {
    const input = fixture.nativeElement.querySelector('input.tx-input') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.type).toBe('text');
  });

  it('shows clear control for search inputs with a value', async () => {
    fixture.componentRef.setInput('type', 'search');
    fixture.componentInstance.writeValue('query');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.tx-input__clear')).toBeTruthy();
  });

  it('clears value when clear is pressed', async () => {
    const cleared = vi.fn();
    fixture.componentRef.setInput('type', 'search');
    fixture.componentInstance.writeValue('query');
    fixture.componentInstance.cleared.subscribe(cleared);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const clear = fixture.nativeElement.querySelector('.tx-input__clear') as HTMLButtonElement;
    clear.click();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input.tx-input') as HTMLInputElement;
    expect(input.value).toBe('');
    expect(cleared).toHaveBeenCalled();
  });
});
