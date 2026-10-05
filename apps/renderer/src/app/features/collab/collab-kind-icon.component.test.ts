import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { CollabKindIconComponent } from './collab-kind-icon.component';

describe('CollabKindIconComponent', () => {
  function render(kind: string): HTMLElement {
    const fixture = TestBed.createComponent(CollabKindIconComponent);
    fixture.componentRef.setInput('kind', kind);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('draws a distinct glyph per change kind', () => {
    // Act
    const folder = render('folder').innerHTML;
    const database = render('database').innerHTML;

    // Assert
    expect(folder).toContain('<path');
    expect(database).toContain('<ellipse');
    expect(folder).not.toEqual(database);
  });

  it('falls back to a neutral square and hides the glyph from screen readers', () => {
    // Act
    const element = render('workspace');
    const svg = element.querySelector('svg');

    // Assert
    expect(svg?.querySelector('rect')).not.toBeNull();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });
});
