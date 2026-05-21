import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TxDividerComponent } from './tx-divider.component';

describe('TxDividerComponent', () => {
  let fixture: ComponentFixture<TxDividerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TxDividerComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TxDividerComponent);
    fixture.detectChanges();
  });

  it('renders hr divider', () => {
    expect(fixture.nativeElement.querySelector('hr.tx-divider')).toBeTruthy();
  });
});
