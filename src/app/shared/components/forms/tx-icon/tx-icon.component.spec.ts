import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { TxIconService } from '../../../icons/tx-icon.service';
import { TxIconComponent } from './tx-icon.component';

describe('TxIconComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('should render a settings icon from SVG assets', async () => {
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

    const fixture = TestBed.createComponent(TxIconComponent);
    fixture.componentRef.setInput('name', 'settings');
    fixture.detectChanges();

    await fixture.whenStable();
    fixture.detectChanges();

    const svg = fixture.nativeElement.querySelector('svg.tx-icon');
    expect(svg).toBeTruthy();
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('width')).toBe('18');
    expect(svg.querySelector('g')).toBeTruthy();
  });

  it('falls back to the database icon when an asset is missing', async () => {
    const loadIconInner = vi.fn(async (name: string) => {
      if (name === 'mysql') {
        throw new Error('missing');
      }
      return '<ellipse cx="12" cy="6" rx="7" ry="3"/>';
    });
    await TestBed.configureTestingModule({
      imports: [TxIconComponent],
      providers: [{ provide: TxIconService, useValue: { loadIconInner } }],
    }).compileComponents();

    const fixture = TestBed.createComponent(TxIconComponent);
    fixture.componentRef.setInput('name', 'mysql');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(loadIconInner).toHaveBeenCalledWith('mysql');
    expect(loadIconInner).toHaveBeenCalledWith('database');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('g')).toBeTruthy();
    });
  });

  it('does not apply a currentColor stroke to filled brand icons', async () => {
    await TestBed.configureTestingModule({
      imports: [TxIconComponent],
      providers: [
        {
          provide: TxIconService,
          useValue: {
            loadIconInner: () =>
              Promise.resolve('<rect x="2" y="2" width="20" height="20" rx="5" fill="#4169E1"/>'),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(TxIconComponent);
    fixture.componentRef.setInput('name', 'postgresql');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const svg = fixture.nativeElement.querySelector('svg.tx-icon');
    expect(svg.getAttribute('stroke')).toBe('none');
    expect(svg.getAttribute('stroke-width')).toBeNull();
  });
});
