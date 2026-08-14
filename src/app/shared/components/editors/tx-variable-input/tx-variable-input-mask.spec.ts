import { describe, expect, it } from 'vitest';

import {
  escapeVariableInputMaskHtml,
  maskVariableInputDisplay,
} from './tx-variable-input-mask';

describe('tx-variable-input-mask', () => {
  it('masks values with asterisks', () => {
    expect(maskVariableInputDisplay('secret')).toBe('******');
    expect(maskVariableInputDisplay('')).toBe('');
  });

  it('escapes masked html', () => {
    expect(escapeVariableInputMaskHtml('a<b')).toBe('a&lt;b');
  });
});
