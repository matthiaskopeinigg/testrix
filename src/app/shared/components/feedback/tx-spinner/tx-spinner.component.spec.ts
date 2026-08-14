import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TxSpinnerComponent } from './tx-spinner.component';

describe('TxSpinnerComponent', () => {
  let fixture: ComponentFixture<TxSpinnerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TxSpinnerComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TxSpinnerComponent);
    fixture.detectChanges();
  });

  it('renders spinner element with status role on host', () => {
    expect(fixture.nativeElement.querySelector('.tx-spinner')).toBeTruthy();
    expect(fixture.nativeElement.getAttribute('role')).toBe('status');
  });
});
