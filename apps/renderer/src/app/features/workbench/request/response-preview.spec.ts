import { describe, expect, it } from 'vitest';

import { diffLines, diffSideBySide, formatHeadersForDiff } from './response-diff';
import { canPreviewResponse, previewDocument } from './response-preview';

describe('canPreviewResponse', () => {
  it('detects html and xml', () => {
    expect(canPreviewResponse('<html></html>', 'text/html')).toBe(true);
    expect(canPreviewResponse('{"a":1}', 'application/json')).toBe(false);
  });
});

describe('previewDocument', () => {
  it('puts a script-blocking CSP ahead of the body', () => {
    // Act
    const doc = previewDocument('<html><body><script>alert(1)</script></body></html>');

    // Assert
    expect(doc.startsWith('<meta http-equiv="Content-Security-Policy"')).toBe(true);
    expect(doc).toContain("script-src 'none'");
    expect(doc).toContain("base-uri 'none'");
  });
});

describe('diffLines', () => {
  it('marks added and removed lines', () => {
    const lines = diffLines('a\nb', 'a\nc');
    expect(lines).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'del', text: 'b' },
      { kind: 'add', text: 'c' },
    ]);
  });
});

describe('diffSideBySide', () => {
  it('pairs deletions and additions on the same row', () => {
    expect(diffSideBySide('a\nb', 'a\nc')).toEqual([
      {
        left: { kind: 'same', text: 'a', lineNo: 1 },
        right: { kind: 'same', text: 'a', lineNo: 1 },
      },
      {
        left: { kind: 'del', text: 'b', lineNo: 2 },
        right: { kind: 'add', text: 'c', lineNo: 2 },
      },
    ]);
  });

  it('pads unequal hunks with empty cells', () => {
    expect(diffSideBySide('a\nb\nc', 'a\nx')).toEqual([
      {
        left: { kind: 'same', text: 'a', lineNo: 1 },
        right: { kind: 'same', text: 'a', lineNo: 1 },
      },
      {
        left: { kind: 'del', text: 'b', lineNo: 2 },
        right: { kind: 'add', text: 'x', lineNo: 2 },
      },
      {
        left: { kind: 'del', text: 'c', lineNo: 3 },
        right: { kind: 'empty', text: '', lineNo: null },
      },
    ]);
  });
});

describe('formatHeadersForDiff', () => {
  it('sorts headers and formats Key: Value lines', () => {
    expect(
      formatHeadersForDiff([
        { key: 'Content-Type', value: 'application/json' },
        { key: '  ', value: 'skip' },
        { key: 'Accept', value: '*/*' },
      ]),
    ).toBe('Accept: */*\nContent-Type: application/json');
  });
});
