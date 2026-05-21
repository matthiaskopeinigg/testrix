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
});
