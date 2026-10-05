import type { CollectionCookie } from '@testrix/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createStoreHarness } from '../../../../testing/store-harness';
import { CookieJarStore } from './cookie-jar.store';

function cookie(id: string, patch: Partial<CollectionCookie> = {}): CollectionCookie {
  return {
    id,
    enabled: true,
    name: id,
    value: `${id}-value`,
    domain: 'api.local',
    path: '/',
    expires: '',
    secure: false,
    httpOnly: false,
    ...patch,
  };
}

describe('CookieJarStore', () => {
  let saveCookies: ReturnType<typeof vi.fn>;
  let store: CookieJarStore;

  beforeEach(() => {
    saveCookies = vi.fn(() => Promise.resolve());
    store = createStoreHarness(CookieJarStore, { saveCookies } as never).store;
    store.hydrate({ schemaVersion: 1, cookies: [cookie('session')] });
  });

  it('replaces a cookie with the same name, domain and path on merge', async () => {
    // Act
    await store.merge([cookie('fresh', { name: 'session', value: 'rotated' }), cookie('theme')]);

    // Assert
    const byName = Object.fromEntries(store.cookies().map((item) => [item.name, item.value]));
    expect(byName).toEqual({ session: 'rotated', theme: 'theme-value' });
    expect(saveCookies).toHaveBeenCalledWith({ cookies: store.cookies() });
  });

  it('skips saving when a response set no cookies', async () => {
    // Act
    await store.merge([]);

    // Assert
    expect(saveCookies).not.toHaveBeenCalled();
  });

  it('edits, removes and clears cookies and persists every change', async () => {
    // Act
    await store.patch('session', { value: 'edited' });
    const edited = store.cookies()[0]?.value;
    await store.add();
    const afterAdd = store.cookies().length;
    await store.remove('session');
    const afterRemove = store.cookies().map((item) => item.id);
    await store.clear();

    // Assert
    expect(edited).toBe('edited');
    expect(afterAdd).toBe(2);
    expect(afterRemove).not.toContain('session');
    expect(store.cookies()).toEqual([]);
    expect(saveCookies).toHaveBeenCalledTimes(4);
  });
});
