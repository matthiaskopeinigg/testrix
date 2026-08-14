import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TxToggleComponent } from './tx-toggle.component';

describe('TxToggleComponent', () => {
  let fixture: ComponentFixture<TxToggleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TxToggleComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TxToggleComponent);
    fixture.detectChanges();
  });

  it('renders a switch input', () => {
    const input = fixture.nativeElement.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.getAttribute('role')).toBe('switch');
  });
});
