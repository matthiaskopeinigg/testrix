import { describe, expect, it } from 'vitest';

import { lookupResultTableHeightRem, lookupResultViews } from './lookup-result-display';

describe('lookup-result-display', () => {
  it('keeps plain text as a scalar', () => {
    expect(lookupResultViews('ada@example.com')).toEqual([
      { caption: null, block: { kind: 'text', text: 'ada@example.com' } },
    ]);
  });

  it('renders an array of objects as a table', () => {
    const value = JSON.stringify([
      { name: 'test1', uuid: 'uuid1' },
      { name: 'test2', uuid: 'uuid2' },
    ]);
    expect(lookupResultViews(value)).toEqual([
      {
        caption: null,
        block: {
          kind: 'table',
          columns: ['name', 'uuid'],
          rows: [
            ['test1', 'uuid1'],
            ['test2', 'uuid2'],
          ],
        },
      },
    ]);
  });

  it('unwraps a products array nested on an object', () => {
    const value = JSON.stringify({
      products: [
        { name: 'test1', uuid: 'uuid1' },
        { name: 'test2', uuid: 'uuid2' },
      ],
    });
    expect(lookupResultViews(value)).toEqual([
      {
        caption: 'products',
        block: {
          kind: 'table',
          columns: ['name', 'uuid'],
          rows: [
            ['test1', 'uuid1'],
            ['test2', 'uuid2'],
          ],
        },
      },
    ]);
  });

  it('renders scalar arrays as a list', () => {
    expect(lookupResultViews(JSON.stringify(['a', 'b']))).toEqual([
      { caption: null, block: { kind: 'list', items: ['a', 'b'] } },
    ]);
  });

  it('renders a scalar object as a one-row table', () => {
    expect(lookupResultViews(JSON.stringify({ name: 'test1', uuid: 'uuid1' }))).toEqual([
      {
        caption: null,
        block: {
          kind: 'table',
          columns: ['name', 'uuid'],
          rows: [['test1', 'uuid1']],
        },
      },
    ]);
  });

  it('sizes table hosts for a few rows without exceeding the cap', () => {
    expect(lookupResultTableHeightRem(2)).toBeGreaterThan(4);
    expect(lookupResultTableHeightRem(50)).toBe(16);
  });
});
