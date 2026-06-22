import { describe, expect, it } from 'vitest';

import { caretIndexFromClientX, ensureInputCaretVisible } from './tx-variable-input-caret';

describe('caretIndexFromClientX', () => {
  it('maps click offset to caret index', () => {
    const input = document.createElement('input');
    input.value = '$uuid-test';
    input.style.position = 'absolute';
    input.style.left = '0';
    input.style.top = '0';
    input.style.width = '320px';
    input.style.padding = '8px 12px';
    input.style.font = '400 14px Inter, sans-serif';
    document.body.appendChild(input);

    const rect = input.getBoundingClientRect();
    const nearEnd = caretIndexFromClientX(input, rect.right - 20);
    expect(nearEnd).toBeGreaterThan(4);

    document.body.removeChild(input);
  });
});

describe('ensureInputCaretVisible', () => {
  it('scrolls long values so the caret is not flush against the right edge', () => {
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
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    context.font = '400 14px Inter, sans-serif';
    const caretX = context.measureText(input.value).width;
    const visibleRight = input.scrollLeft + innerWidth - 12;

    expect(caretX).toBeLessThanOrEqual(visibleRight + 0.5);

    document.body.removeChild(input);
  });
});
