import { describe, expect, it } from 'vitest';

import {
  resolveTxCodeEditorSmartEdit,
  resolveTxCodeEditorSmartEditWithModifiers,
  shouldOfferJsonClosingQuote,
} from './tx-code-editor-smart-edit';

const sel = (pos: number) => ({ start: pos, end: pos });

describe('resolveTxCodeEditorSmartEdit JSON', () => {
  it('does not intercept comma (native typing)', () => {
    const result = resolveTxCodeEditorSmartEdit({
      key: ',',
      value: '{ "name": "asd"',
      selection: sel(15),
      language: 'json',
    });
    expect(result).toBeNull();
  });

  it('indents after Enter inside object', () => {
    const result = resolveTxCodeEditorSmartEdit({
      key: 'Enter',
      value: '{',
      selection: sel(1),
      language: 'json',
    });
    expect(result?.value).toBe('{\n  \n}');
    expect(result?.selectionStart).toBe(4);
  });

  it('indents after Enter on array value line without existing closer', () => {
    const line = '  "items": [';
    const caret = line.length;
    const result = resolveTxCodeEditorSmartEdit({
      key: 'Enter',
      value: `{\n${line}`,
      selection: sel(2 + caret),
      language: 'json',
    });
    expect(result?.value).toBe(`{\n${line}\n    \n  ]`);
    expect(result?.selectionStart).toBe(2 + caret + 5);
  });

  it('does not add a second ] when array already has a closer', () => {
    const value = `{
  "dummy": "$uuid",
  "asidun": [
  ]
}`;
    const caret = value.indexOf('[') + 1;
    const result = resolveTxCodeEditorSmartEdit({
      key: 'Enter',
      value,
      selection: sel(caret),
      language: 'json',
    });
    expect(result?.value).toContain('[\n    \n  ]');
    expect(result?.value).not.toMatch(/\n {4}\]/);
    expect((result?.value.match(/\]/g) ?? []).length).toBe(1);
    expect(result?.selectionStart).toBe(caret + 5);
  });

  it('preserves line indent for sibling properties (no double indent)', () => {
    const line = '  "test": "",';
    const result = resolveTxCodeEditorSmartEdit({
      key: 'Enter',
      value: `{\n${line}`,
      selection: sel(2 + line.length),
      language: 'json',
    });
    expect(result?.value).toBe(`{\n${line}\n  `);
    expect(result?.selectionStart).toBe(2 + line.length + 3);
  });
});

describe('shouldOfferJsonClosingQuote', () => {
  it('offers after colon before opening quote', () => {
    expect(shouldOfferJsonClosingQuote('{ "a": "', 8)).toBe(true);
  });

  it('does not offer when closing quote already present', () => {
    expect(shouldOfferJsonClosingQuote('{ "a": ""', 9)).toBe(false);
  });
});

describe('resolveTxCodeEditorSmartEdit XML', () => {
  it('expands block after opening tag when no closer exists', () => {
    const value = '<dummy>';
    const result = resolveTxCodeEditorSmartEdit({
      key: 'Enter',
      value,
      selection: sel(value.length),
      language: 'xml',
    });
    expect(result?.value).toBe('<dummy>\n  \n</dummy>');
    expect(result?.value).not.toMatch(/\n {2}<\/dummy>/);
  });

  it('realigns closing tag to opener indent on Enter', () => {
    const value = '<dummy>\n  </dummy>';
    const caret = value.indexOf('>') + 1;
    const result = resolveTxCodeEditorSmartEdit({
      key: 'Enter',
      value,
      selection: sel(caret),
      language: 'xml',
    });
    expect(result?.value).toBe('<dummy>\n  \n</dummy>');
  });
});

describe('resolveTxCodeEditorSmartEdit plaintext', () => {
  it('preserves line indent on Enter', () => {
    const result = resolveTxCodeEditorSmartEdit({
      key: 'Enter',
      value: '  line',
      selection: sel(6),
      language: 'plaintext',
    });
    expect(result?.value).toBe('  line\n  ');
  });
});

describe('resolveTxCodeEditorSmartEditWithModifiers', () => {
  it('returns null for Shift+Enter', () => {
    const result = resolveTxCodeEditorSmartEditWithModifiers({
      key: 'Enter',
      value: '{',
      selection: sel(1),
      language: 'json',
      shiftKey: true,
    });
    expect(result).toBeNull();
  });
});
