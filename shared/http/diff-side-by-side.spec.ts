import { describe, expect, it } from 'vitest';

import { buildDiffDisplayRows, buildPairedDiffRows } from './diff-side-by-side';
import type { LineDiffHunk } from './response-diff';

describe('buildPairedDiffRows', () => {
  it('pairs consecutive removes and adds on the same row', () => {
    const hunks: LineDiffHunk[] = [
      { kind: 'remove', line: '  "accessToken": "old",' },
      { kind: 'add', line: '  "accessToken": "new",' },
      { kind: 'unchanged', line: 'same' },
    ];
    const pairs = buildPairedDiffRows(hunks);
    expect(pairs).toHaveLength(2);
    expect(pairs[0]!.left.kind).toBe('change');
    expect(pairs[0]!.right.kind).toBe('change');
    expect(pairs[0]!.left.text).toContain('old');
    expect(pairs[0]!.right.text).toContain('new');
    expect(pairs[1]!.left.text).toBe('same');
    expect(pairs[1]!.right.text).toBe('same');
  });

  it('pads unmatched trailing removes or adds', () => {
    const hunks: LineDiffHunk[] = [
      { kind: 'remove', line: 'only-old' },
      { kind: 'add', line: 'new-a' },
      { kind: 'add', line: 'new-b' },
    ];
    const pairs = buildPairedDiffRows(hunks);
    expect(pairs).toHaveLength(2);
    expect(pairs[0]!.left.kind).toBe('change');
    expect(pairs[0]!.right.kind).toBe('change');
    expect(pairs[1]!.left.kind).toBe('empty');
    expect(pairs[1]!.right.kind).toBe('add');
  });
});

describe('buildDiffDisplayRows', () => {
  it('truncates when exceeding max lines', () => {
    const hunks: LineDiffHunk[] = Array.from({ length: 700 }, (_, i) => ({
      kind: 'add' as const,
      line: `line ${i}`,
    }));
    const result = buildDiffDisplayRows(hunks, 640);
    expect(result.truncated).toBe(true);
    expect(result.rows.length).toBe(640);
  });
});
