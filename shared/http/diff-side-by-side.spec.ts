import { describe, expect, it } from 'vitest';

import { buildDiffDisplayRows, buildPairedDiffRows } from './diff-side-by-side';
import type { LineDiffHunk } from './response-diff';

describe('buildPairedDiffRows', () => {
  it('pads adds and removes on opposite sides', () => {
    const hunks: LineDiffHunk[] = [
      { kind: 'remove', line: 'old' },
      { kind: 'add', line: 'new' },
      { kind: 'unchanged', line: 'same' },
    ];
    const pairs = buildPairedDiffRows(hunks);
    expect(pairs).toHaveLength(3);
    expect(pairs[0]!.left.kind).toBe('remove');
    expect(pairs[0]!.right.kind).toBe('empty');
    expect(pairs[1]!.left.kind).toBe('empty');
    expect(pairs[1]!.right.kind).toBe('add');
    expect(pairs[2]!.left.text).toBe('same');
    expect(pairs[2]!.right.text).toBe('same');
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
