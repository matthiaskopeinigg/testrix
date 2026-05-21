import { TestBed } from '@angular/core/testing';

import { TxIconService } from '../../icons/tx-icon.service';
import { TxIconComponent } from './tx-icon.component';

describe('TxIconComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TxIconComponent],
      providers: [
        {
          provide: TxIconService,
          useValue: {
            loadIconInner: () => Promise.resolve('<circle cx="12" cy="12" r="3"/>'),
          },
        },
      ],
    }).compileComponents();
  });

  it('should render a settings icon from SVG assets', async () => {
    const fixture = TestBed.createComponent(TxIconComponent);
    fixture.componentRef.setInput('name', 'settings');
    fixture.detectChanges();

    await fixture.whenStable();
    fixture.detectChanges();

    const svg = fixture.nativeElement.querySelector('svg.tx-icon');
    expect(svg).toBeTruthy();
    expect(svg.getAttribute('width')).toBe('18');
    expect(svg.querySelector('g')).toBeTruthy();
  });
});
