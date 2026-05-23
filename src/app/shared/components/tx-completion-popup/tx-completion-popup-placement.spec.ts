import { describe, expect, it } from 'vitest';

import {
  positionFixedCompletionPopup,
  resolveCompletionPlacement,
} from './tx-completion-popup-placement';

describe('resolveCompletionPlacement', () => {
  it('keeps above when there is enough space', () => {
    expect(
      resolveCompletionPlacement({
        placement: 'above',
        anchorTop: 200,
        anchorBottom: 236,
        panelHeight: 80,
        gapPx: 4,
        viewportMarginPx: 8,
        viewportHeight: 900,
      }),
    ).toBe('above');
  });

  it('flips below when above is preferred but lacks room', () => {
    expect(
      resolveCompletionPlacement({
        placement: 'above',
        anchorTop: 120,
        anchorBottom: 156,
        panelHeight: 180,
        gapPx: 4,
        viewportMarginPx: 8,
        viewportHeight: 900,
      }),
    ).toBe('below');
  });
});

describe('positionFixedCompletionPopup', () => {
  it('places the panel above the anchor', () => {
    const anchor = {
      getBoundingClientRect: () => ({ top: 200, bottom: 236, left: 10, width: 120 }),
    } as HTMLElement;
    const panel = {
      offsetHeight: 80,
      style: {} as CSSStyleDeclaration,
    } as HTMLElement;
    Object.assign(panel.style, { top: '', left: '', width: '' });

    const resolved = positionFixedCompletionPopup({ anchor, panel, placement: 'above', gapPx: 4 });

    expect(resolved).toBe('above');
    expect(panel.style.top).toBe('116px');
    expect(panel.style.left).toBe('10px');
    expect(panel.style.width).toBe('120px');
  });

  it('places the panel below the anchor', () => {
    const anchor = {
      getBoundingClientRect: () => ({ top: 200, bottom: 236, left: 10, width: 120 }),
    } as HTMLElement;
    const panel = {
      offsetHeight: 80,
      style: {} as CSSStyleDeclaration,
    } as HTMLElement;
    Object.assign(panel.style, { top: '', left: '', width: '' });

    const originalInnerHeight = globalThis.innerHeight;
    Object.defineProperty(globalThis, 'innerHeight', { value: 900, configurable: true });
    try {
      const resolved = positionFixedCompletionPopup({ anchor, panel, placement: 'below', gapPx: 4 });
      expect(resolved).toBe('below');
    } finally {
      Object.defineProperty(globalThis, 'innerHeight', {
        value: originalInnerHeight,
        configurable: true,
      });
    }

    expect(panel.style.top).toBe('240px');
  });

  it('flips below when above would clamp into the toolbar area', () => {
    const anchor = {
      getBoundingClientRect: () => ({ top: 120, bottom: 156, left: 24, width: 180 }),
    } as HTMLElement;
    const panel = {
      offsetHeight: 180,
      style: {} as CSSStyleDeclaration,
    } as HTMLElement;
    Object.assign(panel.style, { top: '', left: '', width: '' });

    const originalInnerHeight = globalThis.innerHeight;
    Object.defineProperty(globalThis, 'innerHeight', { value: 900, configurable: true });
    try {
      const resolved = positionFixedCompletionPopup({ anchor, panel, placement: 'above', gapPx: 4 });
      expect(resolved).toBe('below');
      expect(panel.style.top).toBe('160px');
    } finally {
      Object.defineProperty(globalThis, 'innerHeight', {
        value: originalInnerHeight,
        configurable: true,
      });
    }
  });
});
