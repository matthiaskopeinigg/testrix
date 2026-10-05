import { describe, expect, it } from 'vitest';

import {
  isAndroidPackageName,
  normalizeAndroidPackageInput,
  parsePlayStoreAppRef,
  parsePlayStorePackageId,
} from './play-store-app';

describe('parsePlayStorePackageId', () => {
  it('reads id from a Play Store details URL', () => {
    expect(
      parsePlayStorePackageId(
        'https://play.google.com/store/apps/details?id=de.telekom.android.customercenter&hl=de',
      ),
    ).toBe('de.telekom.android.customercenter');
  });

  it('reads id from a market:// link', () => {
    expect(parsePlayStorePackageId('market://details?id=org.mozilla.fennec_fdroid')).toBe(
      'org.mozilla.fennec_fdroid',
    );
  });

  it('rejects non-Play text and invalid packages', () => {
    expect(parsePlayStorePackageId('https://f-droid.org/packages/org.fdroid.fdroid/')).toBeNull();
    expect(parsePlayStorePackageId('de.telekom.android.customercenter')).toBeNull();
    expect(parsePlayStorePackageId('')).toBeNull();
  });
});

describe('parsePlayStoreAppRef', () => {
  it('rebuilds a clean Play URL', () => {
    expect(
      parsePlayStoreAppRef(
        'https://play.google.com/store/apps/details?id=de.telekom.android.customercenter&hl=de',
      ),
    ).toEqual({
      packageName: 'de.telekom.android.customercenter',
      playUrl: 'https://play.google.com/store/apps/details?id=de.telekom.android.customercenter',
    });
  });
});

describe('normalizeAndroidPackageInput', () => {
  it('keeps package names and extracts Play ids', () => {
    expect(normalizeAndroidPackageInput('  org.fdroid.fdroid  ')).toBe('org.fdroid.fdroid');
    expect(
      normalizeAndroidPackageInput(
        'https://play.google.com/store/apps/details?id=de.telekom.android.customercenter&hl=de',
      ),
    ).toBe('de.telekom.android.customercenter');
    expect(isAndroidPackageName('de.telekom.android.customercenter')).toBe(true);
    expect(isAndroidPackageName('not-a-package')).toBe(false);
  });
});
