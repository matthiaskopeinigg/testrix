import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TxSliderComponent } from './tx-slider.component';

describe('TxSliderComponent', () => {
  let fixture: ComponentFixture<TxSliderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TxSliderComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TxSliderComponent);
    fixture.detectChanges();
  });

  it('renders a range input', () => {
    const input = fixture.nativeElement.querySelector('input[type="range"]') as HTMLInputElement;
    expect(input).toBeTruthy();
  });
});
