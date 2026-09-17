import { describe, expect, it } from 'vitest';

import { moveByInsertIndex, moveManyByInsertIndex, resolveEnvSlot, type EnvMeasuredRow } from './environments-drop-model';

function row(id: string, index: number, top: number): EnvMeasuredRow {
  return { id, index, top, height: 30 };
}

describe('moveByInsertIndex', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

  it('returns null when dropping onto the original gap', () => {
    expect(moveByInsertIndex(items, 'b', 1)).toBeNull();
    expect(moveByInsertIndex(items, 'b', 2)).toBeNull();
  });

  it('moves an item down', () => {
    expect(moveByInsertIndex(items, 'a', 3)?.map((item) => item.id)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('moves an item up', () => {
    expect(moveByInsertIndex(items, 'd', 1)?.map((item) => item.id)).toEqual(['a', 'd', 'b', 'c']);
  });
});

describe('moveManyByInsertIndex', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }];

  it('moves a contiguous selection down one slot', () => {
    expect(moveManyByInsertIndex(items, ['b', 'c'], 4)?.map((item) => item.id)).toEqual([
      'a',
      'd',
      'b',
      'c',
      'e',
    ]);
  });

  it('moves a contiguous selection up one slot', () => {
    expect(moveManyByInsertIndex(items, ['b', 'c'], 0)?.map((item) => item.id)).toEqual([
      'b',
      'c',
      'a',
      'd',
      'e',
    ]);
  });

  it('keeps visual order when the selection is not contiguous', () => {
    expect(moveManyByInsertIndex(items, ['b', 'd'], 5)?.map((item) => item.id)).toEqual([
      'a',
      'c',
      'e',
      'b',
      'd',
    ]);
  });
});

describe('resolveEnvSlot', () => {
  const rows = [row('a', 0, 0), row('b', 1, 32), row('c', 2, 64)];

  it('inserts before the first row in the top half', () => {
    expect(resolveEnvSlot(rows, 10)?.index).toBe(0);
  });

  it('inserts after a row once the pointer crosses mid', () => {
    expect(resolveEnvSlot(rows, 20)?.index).toBe(1);
  });

  it('inserts after the last row below it', () => {
    expect(resolveEnvSlot(rows, 90)?.index).toBe(3);
  });
});
