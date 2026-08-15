import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { TxIconService } from '@app/shared/icons/tx-icon.service';

import { TxSuggestInputComponent } from './tx-suggest-input.component';

describe('TxSuggestInputComponent auto-close', () => {
  let fixture: ComponentFixture<TxSuggestInputComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TxSuggestInputComponent],
      providers: [
        {
          provide: TxIconService,
          useValue: { loadIconInner: () => Promise.resolve('<path d="M0 0"/>') },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TxSuggestInputComponent);
    fixture.componentRef.setInput('autoClose', true);
    fixture.detectChanges();
  });

  it('places the caret between paired quotes', async () => {
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: "'", bubbles: true, cancelable: true }));
    fixture.detectChanges();
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });

    expect(input.value).toBe("''");
    expect(input.selectionStart).toBe(1);
    expect(input.selectionEnd).toBe(1);
  });

  it('places the caret between paired double quotes', async () => {
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: '"', bubbles: true, cancelable: true }));
    fixture.detectChanges();
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });

    expect(input.value).toBe('""');
    expect(input.selectionStart).toBe(1);
    expect(input.selectionEnd).toBe(1);
  });
});

describe('TxSuggestInputComponent Enter', () => {
  let fixture: ComponentFixture<TxSuggestInputComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TxSuggestInputComponent],
      providers: [
        {
          provide: TxIconService,
          useValue: { loadIconInner: () => Promise.resolve('<path d="M0 0"/>') },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TxSuggestInputComponent);
    fixture.componentRef.setInput('suggestions', ['id', 'name', 'email']);
    fixture.componentRef.setInput('matchMode', 'token');
    fixture.detectChanges();
  });

  it('submits an empty value on Enter instead of inserting a column', () => {
    const submitted: number[] = [];
    fixture.componentInstance.submitted.subscribe(() => submitted.push(1));
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.focus();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.tx-suggest-input__completion')).not.toBeNull();

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(input.value).toBe('');
    expect(submitted).toEqual([1]);
    expect(fixture.nativeElement.querySelector('.tx-suggest-input__completion')).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it('applies the highlighted suggestion on Enter when the field has a token', () => {
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'na';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(input.value).toBe('name');
  });
});

describe('TxSuggestInputComponent inline completion', () => {
  let fixture: ComponentFixture<TxSuggestInputComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TxSuggestInputComponent],
      providers: [
        {
          provide: TxIconService,
          useValue: { loadIconInner: () => Promise.resolve('<path d="M0 0"/>') },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TxSuggestInputComponent);
    fixture.componentRef.setInput('suggestions', ['users', 'email']);
    fixture.componentRef.setInput('matchMode', 'token');
    fixture.componentRef.setInput('completionStyle', 'inline');
    fixture.detectChanges();
  });

  it('previews the remainder as ghost text instead of a popup', () => {
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'u';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.tx-suggest-input__completion')).toBeNull();
    expect(fixture.nativeElement.querySelector('.tx-suggest-input__ghost')?.textContent).toBe('sers');
  });

  it('accepts the preview on Tab', () => {
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'u';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(input.value).toBe('users');
    expect(fixture.nativeElement.querySelector('.tx-suggest-input__ghost')).toBeNull();
  });
});
