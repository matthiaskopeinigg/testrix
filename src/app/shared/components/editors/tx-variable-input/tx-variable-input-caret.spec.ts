// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { caretIndexFromClientX, ensureInputCaretVisible } from './tx-variable-input-caret';

/** Fixed-width mock so caret helpers run without a real Canvas 2D context (unavailable in some CI runners). */
function mockCanvasContext(charWidthPx: number): CanvasRenderingContext2D {
  return {
    font: '',
    measureText(text: string) {
      return { width: text.length * charWidthPx };
    },
  } as CanvasRenderingContext2D;
}

function installCanvasMeasureMock(charWidthPx: number): void {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((type) => {
    if (type === '2d') {
      return mockCanvasContext(charWidthPx);
    }
    return null;
  });
}

describe('caretIndexFromClientX', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps click offset to caret index', () => {
    installCanvasMeasureMock(8);

    const input = document.createElement('input');
    input.value = '$uuid-test';
    input.style.position = 'absolute';
    input.style.left = '0';
    input.style.top = '0';
    input.style.width = '320px';
    input.style.padding = '8px 12px';
    input.style.font = '400 14px Inter, sans-serif';
    document.body.appendChild(input);

    const paddingLeft = Number.parseFloat(getComputedStyle(input).paddingLeft) || 0;
    const nearEnd = caretIndexFromClientX(input, paddingLeft + 7 * 8);
    expect(nearEnd).toBeGreaterThan(4);

    document.body.removeChild(input);
  });
});

describe('ensureInputCaretVisible', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('scrolls long values so the caret is not flush against the right edge', () => {
    const charWidthPx = 8;
    installCanvasMeasureMock(charWidthPx);

    const input = document.createElement('input');
    input.value = 'a'.repeat(200);
    input.style.position = 'absolute';
    input.style.left = '0';
    input.style.top = '0';
    input.style.width = '240px';
    input.style.padding = '8px 12px';
    input.style.font = '400 14px Inter, sans-serif';
    document.body.appendChild(input);

    input.scrollLeft = 9999;
    input.setSelectionRange(input.value.length, input.value.length);

    ensureInputCaretVisible(input, 12);

    const style = getComputedStyle(input);
    const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
    const paddingRight = Number.parseFloat(style.paddingRight) || 0;
    const innerWidth = input.clientWidth - paddingLeft - paddingRight;
    const caretX = input.value.length * charWidthPx;
    const visibleRight = input.scrollLeft + innerWidth - 12;

    expect(caretX).toBeLessThanOrEqual(visibleRight + 0.5);

    document.body.removeChild(input);
  });
});
