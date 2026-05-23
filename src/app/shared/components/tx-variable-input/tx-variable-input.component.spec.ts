import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';

import { TxVariableInputComponent } from './tx-variable-input.component';

describe('TxVariableInputComponent', () => {
  let fixture: ComponentFixture<TxVariableInputComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TxVariableInputComponent],
      providers: [
        {
          provide: UiPreferencesService,
          useValue: { showIconTooltips: () => true },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TxVariableInputComponent);
    fixture.detectChanges();
  });

  it('creates a text input', () => {
    const input = fixture.nativeElement.querySelector(
      'input.tx-variable-input__control',
    ) as HTMLInputElement;
    expect(input).toBeTruthy();
  });

  it('opens completion when typing a dollar-prefixed token', () => {
    const input = fixture.nativeElement.querySelector(
      'input.tx-variable-input__control',
    ) as HTMLInputElement;
    input.value = '$uu';
    input.selectionStart = 3;
    input.selectionEnd = 3;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.tx-variable-input__completion')).toBeTruthy();
  });

  it('highlights parenthetical parameters in the mirror layer', () => {
    fixture.componentInstance.writeValue('$randomInt(6)');
    fixture.detectChanges();

    const param = fixture.nativeElement.querySelector('.tx-variable-input__mirror .tx-var-param');
    expect(param?.textContent).toBe('(6)');
  });

  it('masks the mirror layer when maskValue is enabled and value is hidden', () => {
    fixture.componentRef.setInput('maskValue', true);
    fixture.componentRef.setInput('valueRevealed', false);
    fixture.componentInstance.writeValue('secret-token');
    fixture.detectChanges();

    const mirror = fixture.nativeElement.querySelector('.tx-variable-input__mirror code');
    expect(mirror?.textContent).toBe('************');
    expect(fixture.nativeElement.querySelector('.tx-variable-input__field--masked')).toBeTruthy();
  });
});
