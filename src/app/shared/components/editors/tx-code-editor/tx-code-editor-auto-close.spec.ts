import { describe, expect, it } from 'vitest';

import {
  resolveTxCodeEditorAutoClose,
  resolveTxCodeEditorAutoCloseBackspace,
} from './tx-code-editor-auto-close';

const sel = (pos: number) => ({ start: pos, end: pos });

describe('resolveTxCodeEditorAutoClose JSON', () => {
  it('pairs quotes after trailing comma on new line', () => {
    const before = `{
  "dummy": "$uuid",
  "dummy2": "{{env1}}",
  `;
    const caret = before.length;
    const result = resolveTxCodeEditorAutoClose({
      key: '"',
      value: before,
      selection: sel(caret),
      language: 'json',
    });
    expect(result?.value).toBe(`${before}""`);
    expect(result?.selectionStart).toBe(caret + 1);
  });

  it('pairs braces and brackets in body-like JSON', () => {
    const base = `{
  "dummy": "$uuid",
  "dummy2": "{{env1}}",
  `;
    expect(
      resolveTxCodeEditorAutoClose({ key: '{', value: base, selection: sel(base.length), language: 'json' })
        ?.value,
    ).toBe(`${base}{}`);
    expect(
      resolveTxCodeEditorAutoClose({ key: '[', value: base, selection: sel(base.length), language: 'json' })
        ?.value,
    ).toBe(`${base}[]`);
  });

  it('closes an unclosed opening quote', () => {
    const value = '{\n  "k": "';
    const caret = value.length;
    const result = resolveTxCodeEditorAutoClose({
      key: '"',
      value,
      selection: sel(caret),
      language: 'json',
    });
    expect(result?.value).toBe('{\n  "k": ""');
    expect(result?.selectionStart).toBe(caret + 1);
  });

  it('pairs double quotes', () => {
    const result = resolveTxCodeEditorAutoClose({
      key: '"',
      value: '{ "a": ',
      selection: sel(8),
      language: 'json',
    });
    expect(result?.value).toBe('{ "a": ""');
    expect(result?.selectionStart).toBe(9);
  });

  it('pairs braces and brackets', () => {
    expect(
      resolveTxCodeEditorAutoClose({
        key: '{',
        value: '',
        selection: sel(0),
        language: 'json',
      })?.value,
    ).toBe('{}');
    expect(
      resolveTxCodeEditorAutoClose({
        key: '[',
        value: '',
        selection: sel(0),
        language: 'json',
      })?.value,
    ).toBe('[]');
  });

  it('skips over an existing closing quote', () => {
    const result = resolveTxCodeEditorAutoClose({
      key: '"',
      value: '{ "a": ""',
      selection: sel(8),
      language: 'json',
    });
    expect(result?.value).toBe('{ "a": ""');
    expect(result?.selectionStart).toBe(9);
  });
});

describe('resolveTxCodeEditorAutoClose markup', () => {
  it('closes XML tags on >', () => {
    const result = resolveTxCodeEditorAutoClose({
      key: '>',
      value: '<test',
      selection: sel(5),
      language: 'xml',
    });
    expect(result?.value).toBe('<test></test>');
    expect(result?.selectionStart).toBe(6);
  });

  it('closes HTML tags on >', () => {
    const result = resolveTxCodeEditorAutoClose({
      key: '>',
      value: '<payload user="x"',
      selection: sel(20),
      language: 'html',
    });
    expect(result?.value).toBe('<payload user="x"></payload>');
    expect(result?.selectionStart).toBe(21);
  });

  it('uses void-element syntax for br in HTML', () => {
    const result = resolveTxCodeEditorAutoClose({
      key: '>',
      value: '<br',
      selection: sel(3),
      language: 'html',
    });
    expect(result?.value).toBe('<br />');
    expect(result?.selectionStart).toBe(4);
  });
});

describe('resolveTxCodeEditorAutoCloseBackspace', () => {
  it('removes empty JSON quote pair', () => {
    const result = resolveTxCodeEditorAutoCloseBackspace('{ "a": ""', 8, 'json');
    expect(result?.value).toBe('{ "a": ');
    expect(result?.selectionStart).toBe(7);
  });

  it('removes empty markup element pair', () => {
    const result = resolveTxCodeEditorAutoCloseBackspace('<test></test>', 6, 'xml');
    expect(result?.value).toBe('<test');
    expect(result?.selectionStart).toBe(5);
  });
});
