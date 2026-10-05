import type { RequestFormRow } from '@testrix/contracts';
import { describe, expect, it } from 'vitest';

import {
  atobSafe,
  countEnabled,
  lineCount,
  parseQueryKeep,
  persistForm,
  withTrailingForm,
} from './request-editor-rows';

function formRow(key: string, value = ''): RequestFormRow {
  return { id: key || 'blank', enabled: true, key, value, description: '', kind: 'text', fileName: '', contentType: '' };
}

describe('request editor rows', () => {
  it('keeps exactly one blank form row at the end', () => {
    // Act
    const added = withTrailingForm([formRow('a', '1')]);
    const kept = withTrailingForm([formRow('a', '1'), formRow('')]);

    // Assert
    expect(added).toHaveLength(2);
    expect(added[1]?.key).toBe('');
    expect(kept).toHaveLength(2);
  });

  it('drops blank form rows before saving', () => {
    // Act
    const saved = persistForm([formRow('a', '1'), formRow('')]);

    // Assert
    expect(saved.map((row) => row.key)).toEqual(['a']);
  });

  it('rebuilds query rows from the URL and keeps ids and flags of known keys', () => {
    // Arrange
    const current = [{ id: 'q1', enabled: false, key: 'page', value: '1', description: 'Page' }];

    // Act
    const rows = parseQueryKeep('https://a.test/list?page=2&size=10', current);
    const none = parseQueryKeep('https://a.test/list', current);

    // Assert
    expect(rows).toEqual([
      { id: 'q1', enabled: false, key: 'page', value: '2', description: 'Page' },
      { id: 'query_size_1', enabled: true, key: 'size', value: '10', description: '' },
    ]);
    expect(none).toEqual([]);
  });

  it('counts enabled keyed rows, lines and decodes base64 safely', () => {
    // Act
    const enabled = countEnabled([
      { id: '1', enabled: true, key: 'a', value: '' },
      { id: '2', enabled: false, key: 'b', value: '' },
      { id: '3', enabled: true, key: ' ', value: '' },
    ] as never);

    // Assert
    expect(enabled).toBe(1);
    expect(lineCount('a\nb\nc')).toBe(3);
    expect(lineCount('')).toBe(1);
    expect(atobSafe('aGk=')).toBe('hi');
    expect(atobSafe('%%%')).toBe('%%%');
  });
});
