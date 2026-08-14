import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TxTagComponent } from './tx-tag.component';

describe('TxTagComponent', () => {
  let fixture: ComponentFixture<TxTagComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TxTagComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TxTagComponent);
    fixture.detectChanges();
  });

  it('renders tag shell', () => {
    expect(fixture.nativeElement.querySelector('.tx-tag')).toBeTruthy();
    expect(fixture.nativeElement.classList.contains('tx-tag-host')).toBe(true);
  });
});
