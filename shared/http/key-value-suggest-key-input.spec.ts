import { describe, expect, it } from 'vitest';

import { resolveKeyValueSuggestKeyInput } from './key-value-suggest-key-input';

describe('resolveKeyValueSuggestKeyInput', () => {
  it('keeps explicit http-headers mode', () => {
    expect(
      resolveKeyValueSuggestKeyInput('http-headers', {
        keyLabel: 'Key',
        addLabel: 'Add row',
      }),
    ).toBe('http-headers');
  });

  it('infers http-headers from add label', () => {
    expect(
      resolveKeyValueSuggestKeyInput('text', {
        keyLabel: 'Key',
        addLabel: 'Add header',
      }),
    ).toBe('http-headers');
  });

  it('infers http-headers from key label Header', () => {
    expect(
      resolveKeyValueSuggestKeyInput('text', {
        keyLabel: 'Header',
        addLabel: 'Add row',
      }),
    ).toBe('http-headers');
  });

  it('infers query-params from add label', () => {
    expect(
      resolveKeyValueSuggestKeyInput('text', {
        keyLabel: 'Key',
        addLabel: 'Add query param',
      }),
    ).toBe('query-params');
  });

  it('does not treat host overrides as headers', () => {
    expect(
      resolveKeyValueSuggestKeyInput('text', {
        keyLabel: 'Host',
        addLabel: 'Add host',
      }),
    ).toBe('text');
  });
});
