import { describe, expect, it } from 'vitest';

import { emptyMockRow, isKvRowFilled, persistMockRows, withTrailingRow } from './request-mock';

describe('isKvRowFilled', () => {
  it('requires both key and value', () => {
    expect(isKvRowFilled({ key: 'Accept', value: '*/*' })).toBe(true);
    expect(isKvRowFilled({ key: 'Accept', value: '' })).toBe(false);
    expect(isKvRowFilled({ key: '', value: '*/*' })).toBe(false);
    expect(isKvRowFilled({ key: '  ', value: '  ' })).toBe(false);
  });
});

describe('withTrailingRow', () => {
  it('adds a blank when the list is empty', () => {
    const rows = withTrailingRow([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.key).toBe('');
    expect(rows[0]?.value).toBe('');
  });

  it('adds a blank only after a filled key+value row', () => {
    const filled = { id: '1', key: 'Accept', value: '*/*', enabled: true, description: '' };
    const rows = withTrailingRow([filled]);
    expect(rows).toHaveLength(2);
    expect(rows[1]?.key).toBe('');
  });

  it('does not add a blank when the last row is only a key', () => {
    const partial = { id: '1', key: 'Accept', value: '', enabled: true, description: '' };
    const rows = withTrailingRow([partial]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.key).toBe('Accept');
  });

  it('keeps an existing blank trailing row', () => {
    const filled = { id: '1', key: 'Accept', value: '*/*', enabled: true, description: '' };
    const blank = emptyMockRow();
    const rows = withTrailingRow([filled, blank]);
    expect(rows).toHaveLength(2);
    expect(rows[1]?.id).toBe(blank.id);
  });
});

describe('persistMockRows', () => {
  it('drops empty trailing rows', () => {
    const filled = { id: '1', key: 'Accept', value: '*/*', enabled: true, description: '' };
    expect(persistMockRows([filled, emptyMockRow()])).toEqual([
      { id: '1', key: 'Accept', value: '*/*', enabled: true, description: '' },
    ]);
  });
});
