import { describe, expect, it } from 'vitest';

import { lineIndexesForCharacterRange, lineIndexesForCharacterRanges } from './tx-code-editor-caret-position';

describe('lineIndexesForCharacterRange', () => {
  it('returns the lines covered by a statement range', () => {
    const source = 'SELECT 1;\nSELECT id FROM users;\nSELECT 3;';
    const start = source.indexOf('SELECT id');
    const end = source.indexOf(';\nSELECT 3') + 1;
    expect(lineIndexesForCharacterRange(source, start, end)).toEqual([1]);
  });

  it('covers every line of a whole-script range', () => {
    const source = 'SELECT 1;\nSELECT 2;';
    expect(lineIndexesForCharacterRange(source, 0, source.length)).toEqual([0, 1]);
  });

  it('returns an empty list for a collapsed range', () => {
    expect(lineIndexesForCharacterRange('SELECT 1;', 3, 3)).toEqual([]);
  });

  it('merges lines from disconnected statement ranges', () => {
    const source = '/* c */\nSELECT 1;\n\nSELECT 2;';
    expect(
      lineIndexesForCharacterRanges(source, [
        { start: source.indexOf('SELECT 1'), end: source.indexOf('SELECT 1') + 'SELECT 1;'.length },
        { start: source.indexOf('SELECT 2'), end: source.length },
      ]),
    ).toEqual([1, 3]);
  });
});
