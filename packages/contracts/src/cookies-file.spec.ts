import { describe, expect, it } from 'vitest';

import { collectFolderCookies, mergeCookieJar, parseCookiesFile } from './cookies-file';
import { parseCollectionFolderConfig } from './collection-folder';

describe('parseCookiesFile', () => {
  it('fills an empty jar', () => {
    expect(parseCookiesFile({}).cookies).toEqual([]);
  });
});

describe('mergeCookieJar', () => {
  it('overlays by name, domain, and path', () => {
    const merged = mergeCookieJar(
      [{ id: 'a', enabled: true, name: 'sid', value: '1', domain: 'example.com', path: '/', expires: '', secure: true, httpOnly: true }],
      [{ id: 'b', enabled: true, name: 'sid', value: '2', domain: 'example.com', path: '/', expires: '', secure: true, httpOnly: true }],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.value).toBe('2');
  });

  it('keeps a disabled cookie when overlaying a new value', () => {
    const merged = mergeCookieJar(
      [{ id: 'a', enabled: false, name: 'sid', value: '1', domain: 'example.com', path: '/', expires: '', secure: true, httpOnly: true }],
      [{ id: 'b', enabled: true, name: 'other', value: '2', domain: 'example.com', path: '/', expires: '', secure: false, httpOnly: false }],
    );
    expect(merged).toHaveLength(2);
    expect(merged.find((item) => item.name === 'sid')?.enabled).toBe(false);
  });
});

describe('collectFolderCookies', () => {
  it('walks nested folders', () => {
    const cookies = collectFolderCookies([
      {
        kind: 'folder',
        id: 'f1',
        name: 'API',
        modifiedAt: '2026-01-01T00:00:00.000Z',
        config: parseCollectionFolderConfig({
          settings: {
            cookies: [
              { id: 'c1', enabled: true, name: 'a', value: '1', domain: 'ex.com', path: '/', expires: '', secure: false, httpOnly: false },
            ],
          },
        }),
        children: [],
      },
    ]);
    expect(cookies.map((item) => item.name)).toEqual(['a']);
  });
});
