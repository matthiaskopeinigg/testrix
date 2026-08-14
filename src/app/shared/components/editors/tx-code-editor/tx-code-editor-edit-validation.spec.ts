import { describe, expect, it } from 'vitest';

import {
  applyJsonLineBreakWithCloser,
  applyMarkupEnterPlan,
  canAutoCloseDelimiterPair,
  canSkipClosingDelimiterAtCaret,
  delimiterCloserAhead,
  hasJsonCloserAhead,
  planJsonEnter,
  planMarkupEnter,
} from './tx-code-editor-edit-validation';

describe('tx-code-editor-edit-validation', () => {
  it('detects closer already ahead', () => {
    const withCloser = '  "a": []';
    const openOnly = '  "a": [';
    expect(delimiterCloserAhead(withCloser, withCloser.indexOf('[') + 1, ']')).toBe(true);
    expect(delimiterCloserAhead(openOnly, openOnly.length, ']')).toBe(false);
  });

  it('blocks auto-close pair when closer exists', () => {
    const withCloser = '  "k": []';
    const openOnly = '  "k": [';
    expect(
      canAutoCloseDelimiterPair(withCloser, withCloser.indexOf('[') + 1, 'json', '[', ']'),
    ).toBe(false);
    expect(canAutoCloseDelimiterPair(openOnly, openOnly.length, 'json', '[', ']')).toBe(true);
  });

  it('only skips ] when inside a matching array', () => {
    const value = '{\n  "k": [\n  ]\n}';
    const closeBracket = value.indexOf(']');
    expect(canSkipClosingDelimiterAtCaret(value, closeBracket, 'json', ']')).toBe(true);
    expect(canSkipClosingDelimiterAtCaret(value, 0, 'json', ']')).toBe(false);
  });

  it('plans line-break Enter when closer already exists', () => {
    const value = `{
  "asidun": [
  ]
}`;
    const caret = value.indexOf('[') + 1;
    const lineStart = value.lastIndexOf('\n', caret - 1) + 1;
    const plan = planJsonEnter(value, caret, value.slice(lineStart, caret));
    expect(plan).toEqual({
      type: 'line-break',
      contentIndent: '    ',
      closeIndent: '  ',
      close: ']',
    });
  });

  it('moves inline ] from auto-close [] onto its own line on Enter', () => {
    const value = `{
  "dummy": "$uuid",
  "asidun": []`;
    const caret = value.indexOf('[') + 1;
    const lineStart = value.lastIndexOf('\n', caret - 1) + 1;
    const plan = planJsonEnter(value, caret, value.slice(lineStart, caret));
    expect(plan?.type).toBe('line-break');
    if (plan?.type !== 'line-break') {
      return;
    }
    const result = applyJsonLineBreakWithCloser(value, caret, plan);
    expect(result.value).toBe(`{
  "dummy": "$uuid",
  "asidun": [
    
  ]`);
    expect(result.value).not.toContain('[]');
    expect(result.selectionStart).toBe(caret + 5);
  });

  it('realigns mis-indented closing bracket on line-break Enter', () => {
    const value = `{
  "asidun": [
    ]
}`;
    const caret = value.indexOf('[') + 1;
    const lineStart = value.lastIndexOf('\n', caret - 1) + 1;
    const plan = planJsonEnter(value, caret, value.slice(lineStart, caret));
    expect(plan?.type).toBe('line-break');
    if (plan?.type !== 'line-break') {
      return;
    }
    const result = applyJsonLineBreakWithCloser(value, caret, plan);
    expect(result.value).toContain('[\n    \n  ]');
    expect(result.value).not.toContain('    ]');
  });

  it('plans XML expand-block when no closing tag exists', () => {
    const value = '<dummy>';
    const plan = planMarkupEnter(value, value.length, value);
    expect(plan).toEqual({
      type: 'expand-block',
      contentIndent: '  ',
      closeIndent: '',
      closeTag: 'dummy',
    });
  });

  it('realigns XML closing tag to opener indent on Enter', () => {
    const value = '<dummy>\n  </dummy>';
    const caret = value.indexOf('>') + 1;
    const lineStart = 0;
    const plan = planMarkupEnter(value, caret, value.slice(lineStart, caret));
    expect(plan?.type).toBe('line-break');
    if (plan?.type !== 'line-break') {
      return;
    }
    const result = applyMarkupEnterPlan(value, caret, plan);
    expect(result.value).toBe('<dummy>\n  \n</dummy>');
    expect(result.value).not.toContain('  </dummy>');
  });

  it('splits inline XML close tag onto its own line on Enter', () => {
    const value = '<dummy></dummy>';
    const caret = value.indexOf('>') + 1;
    const plan = planMarkupEnter(value, caret, value.slice(0, caret));
    expect(plan?.type).toBe('line-break');
    if (plan?.type !== 'line-break') {
      return;
    }
    const result = applyMarkupEnterPlan(value, caret, plan);
    expect(result.value).toBe('<dummy>\n  \n</dummy>');
  });

  it('plans expand-block only without closer ahead', () => {
    const value = '{\n  "items": [';
    const caret = value.length;
    const plan = planJsonEnter(value, caret, value.slice(value.lastIndexOf('\n') + 1, caret));
    expect(plan?.type).toBe('expand-block');
    expect(hasJsonCloserAhead(value, caret, '[')).toBe(false);
  });
});
