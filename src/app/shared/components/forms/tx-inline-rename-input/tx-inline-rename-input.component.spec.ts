import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { TxInlineRenameInputComponent } from './tx-inline-rename-input.component';

describe('TxInlineRenameInputComponent', () => {
  it('selects the full value when rename starts', async () => {
    await TestBed.configureTestingModule({
      imports: [TxInlineRenameInputComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(TxInlineRenameInputComponent);
    fixture.componentRef.setInput('value', 'Local environment');
    fixture.detectChanges();

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe('Local environment'.length);
  });

  it('commits an empty value when allowEmpty is set', async () => {
    await TestBed.configureTestingModule({
      imports: [TxInlineRenameInputComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(TxInlineRenameInputComponent);
    fixture.componentRef.setInput('value', 'kept');
    fixture.componentRef.setInput('allowEmpty', true);
    fixture.componentRef.setInput('trimValue', false);
    fixture.detectChanges();

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });

    const committed: string[] = [];
    fixture.componentInstance.committed.subscribe((value) => committed.push(value));
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(committed).toEqual(['']);
  });

  it('blocks non-integer characters when sqlType is int4', async () => {
    await TestBed.configureTestingModule({
      imports: [TxInlineRenameInputComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(TxInlineRenameInputComponent);
    fixture.componentRef.setInput('value', '12');
    fixture.componentRef.setInput('sqlType', 'int4');
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.setSelectionRange(2, 2);
    const blocked = new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      data: 'a',
      inputType: 'insertText',
    });
    expect(input.dispatchEvent(blocked)).toBe(false);

    const allowed = new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      data: '3',
      inputType: 'insertText',
    });
    expect(input.dispatchEvent(allowed)).toBe(true);
  });
});
