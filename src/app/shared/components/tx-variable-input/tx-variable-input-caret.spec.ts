import { describe, expect, it } from 'vitest';

import { caretIndexFromClientX } from './tx-variable-input-caret';

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
