import { describe, expect, it } from 'vitest';

import {
  applyPlaceholderSuggestion,
  segmentAtOffset,
  splitPlaceholderSegments,
  suggestPlaceholders,
  tokenAtCaret,
} from './placeholder-complete';

describe('tokenAtCaret', () => {
  it('detects a $ token and a mustache token', () => {
    expect(tokenAtCaret('id=$uu', 6)).toMatchObject({ kind: 'dollar', text: '$uu' });
    expect(tokenAtCaret('{{host', 6)).toMatchObject({ kind: 'mustache', text: '{{host' });
  });

  it('spans a closed mustache so the closing braces are included', () => {
    expect(tokenAtCaret('{{}}', 2)).toMatchObject({ kind: 'mustache', start: 0, end: 4, text: '{{}}' });
    expect(tokenAtCaret('{{HOST}}', 4)).toMatchObject({ kind: 'mustache', start: 0, end: 8, text: '{{HOST}}' });
  });

  it('treats the caret after a closed mustache as outside it', () => {
    expect(tokenAtCaret('{{HOST}}/', 8)).toMatchObject({ kind: 'none' });
  });
});

describe('suggestPlaceholders', () => {
  it('lists only $ catalog items for a $ token, matched by prefix', () => {
    const items = suggestPlaceholders('$u', 2, ['host', 'uuid', 'BASE_URL']);
    expect(items.map((item) => item.insert)).toEqual(['$uuid']);
  });

  it('does not mix variables into a $ list, even with an empty needle', () => {
    const items = suggestPlaceholders('$', 1, ['BASE_URL', 'FEATURE_FLAGS']);
    expect(items.every((item) => item.insert.startsWith('$'))).toBe(true);
    expect(items.some((item) => item.insert.startsWith('{{'))).toBe(false);
  });

  it('lists only matching variables for a mustache token', () => {
    const items = suggestPlaceholders('{{ho', 4, ['host', 'id', 'BASE_URL']);
    expect(items.map((item) => item.insert)).toEqual(['{{host}}']);
  });

  it('matches camelCase segments like timestampMs', () => {
    const items = suggestPlaceholders('$iso', 4, []);
    expect(items.map((item) => item.insert)).toContain('$isoTimestamp');
    expect(items.some((item) => item.insert === '$timestamp')).toBe(false);
  });
});

describe('applyPlaceholderSuggestion', () => {
  it('replaces the token at the caret', () => {
    expect(applyPlaceholderSuggestion('id=$uu', 6, '$uuid')).toEqual({
      value: 'id=$uuid',
      cursor: 8,
    });
  });

  it('replaces empty braces without leaving extra closers', () => {
    expect(applyPlaceholderSuggestion('{{}}', 2, '{{BASE_URL}}')).toEqual({
      value: '{{BASE_URL}}',
      cursor: 12,
    });
  });

  it('replaces a partial name inside existing braces', () => {
    expect(applyPlaceholderSuggestion('{{ho}}', 4, '{{host}}')).toEqual({
      value: '{{host}}',
      cursor: 8,
    });
  });

  it('keeps surrounding text when normalizing braces mid-url', () => {
    expect(applyPlaceholderSuggestion('https://{{}}/x', 10, '{{BASE_URL}}')).toEqual({
      value: 'https://{{BASE_URL}}/x',
      cursor: 20,
    });
  });
});

describe('splitPlaceholderSegments', () => {
  it('highlights known $ tokens and existing variables only', () => {
    expect(splitPlaceholderSegments('id=$uuid&host={{host}}', ['host'])).toEqual([
      { text: 'id=', kind: 'text', hint: '' },
      { text: '$uuid', kind: 'dollar', hint: 'UUID v4' },
      { text: '&host=', kind: 'text', hint: '' },
      { text: '{{host}}', kind: 'mustache', hint: 'Folder or environment variable' },
    ]);
  });

  it('highlights $uuid inside a JSON string', () => {
    expect(splitPlaceholderSegments('{ "dummy": "$uuid" }', [])).toEqual([
      { text: '{ "dummy": "', kind: 'text', hint: '' },
      { text: '$uuid', kind: 'dollar', hint: 'UUID v4' },
      { text: '" }', kind: 'text', hint: '' },
    ]);
  });

  it('leaves unknown $ tokens and {{vars}} as text', () => {
    expect(splitPlaceholderSegments('id=$asd&x={{nope}}', ['host'])).toEqual([
      { text: 'id=$asd&x={{nope}}', kind: 'text', hint: '' },
    ]);
  });

  it('highlights :path tokens in the URL path, not the query string', () => {
    expect(
      splitPlaceholderSegments('https://api.local/users/:id?x=:skip', [], { pathParams: true }),
    ).toEqual([
      { text: 'https://api.local/users/', kind: 'text', hint: '' },
      {
        text: ':id',
        kind: 'path',
        hint: 'Path param',
        clickable: true,
        originKind: 'path',
        sourceName: 'Params',
        originName: 'id',
      },
      { text: '?x=:skip', kind: 'text', hint: '' },
    ]);
  });

  it('marks known {{vars}} clickable with the winning origin', () => {
    expect(
      splitPlaceholderSegments('{{HOST}}', ['HOST'], {
        origins: [{ name: 'HOST', kind: 'folder', sourceId: 'leaf', sourceName: 'API' }],
      }),
    ).toEqual([
      {
        text: '{{HOST}}',
        kind: 'mustache',
        hint: 'Folder · API',
        clickable: true,
        originKind: 'folder',
        sourceId: 'leaf',
        sourceName: 'API',
        originName: 'HOST',
      },
    ]);
  });

  it('marks flow data columns clickable', () => {
    expect(
      splitPlaceholderSegments('{{code}}', ['code'], {
        origins: [{ name: 'code', kind: 'data', sourceId: 'sc-1', sourceName: 'Simple examples' }],
      }),
    ).toEqual([
      {
        text: '{{code}}',
        kind: 'mustache',
        hint: 'Data · Simple examples',
        clickable: true,
        originKind: 'data',
        sourceId: 'sc-1',
        sourceName: 'Simple examples',
        originName: 'code',
      },
    ]);
  });

  it('does not treat https: or :8080 as path params', () => {
    expect(
      splitPlaceholderSegments('https://api.local:8080/ok', [], { pathParams: true }),
    ).toEqual([{ text: 'https://api.local:8080/ok', kind: 'text', hint: '' }]);
  });
});

describe('segmentAtOffset', () => {
  it('finds a mustache token under the caret', () => {
    const value = '{{BASE_URL}}/get?marker={{marker}}';
    expect(segmentAtOffset(value, 3, ['BASE_URL', 'marker'])?.text).toBe('{{BASE_URL}}');
    expect(segmentAtOffset(value, 14, ['BASE_URL', 'marker'])).toBeNull();
    expect(segmentAtOffset(value, 28, ['BASE_URL', 'marker'])?.text).toBe('{{marker}}');
  });
});
