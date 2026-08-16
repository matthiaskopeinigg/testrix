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

  it('previews literal value suggestions as ghost text instead of a popup', () => {
    fixture.componentRef.setInput('valueSuggestions', ['application/json', 'application/xml']);
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector(
      'input.tx-variable-input__control',
    ) as HTMLInputElement;
    input.value = 'application/j';
    input.selectionStart = input.value.length;
    input.selectionEnd = input.value.length;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.tx-variable-input__completion')).toBeNull();
    expect(fixture.nativeElement.querySelector('.tx-variable-input__ghost')?.textContent).toBe(
      'son',
    );
  });

  it('highlights parenthetical parameters in the mirror layer', () => {
    fixture.componentInstance.writeValue('$randomInt(6)');
    fixture.detectChanges();

    const param = fixture.nativeElement.querySelector('.tx-variable-input__mirror .tx-var-param');
    expect(param?.textContent).toBe('(6)');
  });

  it('uses native secure text when maskValue hides the value', () => {
    fixture.componentRef.setInput('maskValue', true);
    fixture.componentRef.setInput('valueRevealed', false);
    fixture.componentInstance.writeValue('secret-token');
    fixture.detectChanges();

    const field = fixture.nativeElement.querySelector('.tx-variable-input__field--masked');
    expect(field).toBeTruthy();
    const input = fixture.nativeElement.querySelector(
      'input.tx-variable-input__control',
    ) as HTMLInputElement;
    expect(input.value).toBe('secret-token');
  });

  it('keeps mirror text aligned when the native input scrolls horizontally', async () => {
    const longValue = `Bearer ${'a'.repeat(240)}`;
    fixture.componentInstance.writeValue(longValue);
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector(
      'input.tx-variable-input__control',
    ) as HTMLInputElement;
    Object.defineProperty(input, 'clientWidth', { configurable: true, value: 120 });
    input.scrollLeft = 80;
    input.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    const mirrorCode = fixture.nativeElement.querySelector(
      '.tx-variable-input__mirror code',
    ) as HTMLElement;
    const hitCode = fixture.nativeElement.querySelector(
      '.tx-variable-input__hit code',
    ) as HTMLElement;
    expect(mirrorCode.style.transform).toBe('translateX(-80px)');
    expect(hitCode.style.transform).toBe('translateX(-80px)');
  });
});
