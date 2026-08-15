import { describe, expect, it } from 'vitest';

import {
  positionFixedCompletionPopup,
  resolveCompletionPlacement,
} from './tx-completion-popup-placement';

function stubPanel(height: number): HTMLElement {
  const style = { top: '', left: '', width: '', maxHeight: '' } as CSSStyleDeclaration;
  return {
    offsetHeight: height,
    style,
  } as HTMLElement;
}

function stubAnchor(rect: { top: number; bottom: number; left: number; width: number }): HTMLElement {
  return {
    getBoundingClientRect: () => rect,
    parentElement: null,
  } as unknown as HTMLElement;
}

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

  it('flips below when a clipping pane leaves no room above', () => {
    expect(
      resolveCompletionPlacement({
        placement: 'above',
        anchorTop: 280,
        anchorBottom: 316,
        panelHeight: 180,
        gapPx: 4,
        viewportMarginPx: 8,
        viewportHeight: 900,
        clipTop: 220,
        clipBottom: 880,
      }),
    ).toBe('below');
  });

  it('keeps below when preferred and there is room under the field', () => {
    expect(
      resolveCompletionPlacement({
        placement: 'below',
        anchorTop: 280,
        anchorBottom: 316,
        panelHeight: 180,
        gapPx: 4,
        viewportMarginPx: 8,
        viewportHeight: 900,
        clipTop: 140,
        clipBottom: 880,
      }),
    ).toBe('below');
  });
});

describe('positionFixedCompletionPopup', () => {
  it('places the panel above the anchor', () => {
    const anchor = stubAnchor({ top: 200, bottom: 236, left: 10, width: 120 });
    const panel = stubPanel(80);

    const resolved = positionFixedCompletionPopup({
      anchor,
      panel,
      placement: 'above',
      gapPx: 4,
      clipRect: { top: 0, bottom: 900, left: 0, right: 1200 },
    });

    expect(resolved).toBe('above');
    expect(panel.style.top).toBe('116px');
    expect(panel.style.left).toBe('10px');
    expect(panel.style.width).toBe('120px');
  });

  it('places the panel below the anchor', () => {
    const anchor = stubAnchor({ top: 200, bottom: 236, left: 10, width: 120 });
    const panel = stubPanel(80);
    const originalInnerHeight = globalThis.innerHeight;
    Object.defineProperty(globalThis, 'innerHeight', { value: 900, configurable: true });
    try {
      const resolved = positionFixedCompletionPopup({
        anchor,
        panel,
        placement: 'below',
        gapPx: 4,
        clipRect: { top: 0, bottom: 900, left: 0, right: 1200 },
      });
      expect(resolved).toBe('below');
    } finally {
      Object.defineProperty(globalThis, 'innerHeight', {
        value: originalInnerHeight,
        configurable: true,
      });
    }

    expect(panel.style.top).toBe('240px');
  });

  it('flips below when above would clamp into a clipping pane', () => {
    const anchor = stubAnchor({ top: 280, bottom: 316, left: 24, width: 180 });
    const panel = stubPanel(180);
    const originalInnerHeight = globalThis.innerHeight;
    Object.defineProperty(globalThis, 'innerHeight', { value: 900, configurable: true });
    try {
      const resolved = positionFixedCompletionPopup({
        anchor,
        panel,
        placement: 'above',
        gapPx: 4,
        clipRect: { top: 220, bottom: 880, left: 0, right: 1200 },
      });
      expect(resolved).toBe('below');
      expect(panel.style.top).toBe('320px');
    } finally {
      Object.defineProperty(globalThis, 'innerHeight', {
        value: originalInnerHeight,
        configurable: true,
      });
    }
  });
});
