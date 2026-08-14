import { ComponentFixture, TestBed } from '@angular/core/testing';

import { findThemePalette } from '@shared/theme';

import { TxThemeLayoutPreviewComponent } from './tx-theme-layout-preview.component';

describe('TxThemeLayoutPreviewComponent', () => {
  let fixture: ComponentFixture<TxThemeLayoutPreviewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TxThemeLayoutPreviewComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TxThemeLayoutPreviewComponent);
    const palette = findThemePalette('dracula');
    expect(palette).toBeDefined();
    if (!palette) {
      return;
    }
    fixture.componentRef.setInput('palette', palette);
    fixture.detectChanges();
  });

  it('renders preview chrome with palette label', () => {
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.tx-theme-layout-preview')).toBeTruthy();
    const preview = root.querySelector('.tx-theme-layout-preview') as HTMLElement;
    expect(preview.getAttribute('aria-label')).toContain('Dracula');
  });

  it('applies compact host class when compact is true', () => {
    fixture.componentRef.setInput('compact', true);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.classList.contains('tx-theme-layout-preview-host--compact')).toBe(true);
    expect(host.querySelector('.tx-theme-layout-preview__titlebar')).toBeTruthy();
  });

  it('renders swatch stripes when variant is swatch', () => {
    fixture.componentRef.setInput('variant', 'swatch');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.tx-theme-layout-preview--swatch')).toBeTruthy();
    expect(root.querySelectorAll('.tx-theme-layout-preview__swatch').length).toBe(4);
  });
});
