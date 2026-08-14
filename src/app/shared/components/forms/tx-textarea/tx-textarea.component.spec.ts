import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TxTextareaComponent } from './tx-textarea.component';

describe('TxTextareaComponent', () => {
  let fixture: ComponentFixture<TxTextareaComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TxTextareaComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TxTextareaComponent);
    fixture.detectChanges();
  });

  it('renders a textarea', () => {
    expect(fixture.nativeElement.querySelector('textarea.tx-textarea')).toBeTruthy();
  });

  it('does not rewrite value when writeValue receives the same string', () => {
    const component = fixture.componentInstance;
    component.writeValue('hello ');
    fixture.detectChanges();
    const before = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    before.setSelectionRange(6, 6);

    component.writeValue('hello ');
    fixture.detectChanges();

    const after = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    expect(after.value).toBe('hello ');
    expect(after.selectionStart).toBe(6);
    expect(after.selectionEnd).toBe(6);
  });
});
