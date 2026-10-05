import { describe, expect, it } from 'vitest';

import {
  createEmulatorDevice,
  createEmulatorDeviceFromAvd,
  DEFAULT_EMULATOR_FILE,
  findEmulatorApk,
  findEmulatorDevice,
  isAvdEmulatorDevice,
  mergeEmulatorDevicesWithAvds,
  parseEmulatorFile,
} from './emulator-file';

describe('parseEmulatorFile', () => {
  it('returns empty defaults', () => {
    expect(parseEmulatorFile(null)).toEqual(DEFAULT_EMULATOR_FILE);
    expect(parseEmulatorFile({ schemaVersion: 1 })).toMatchObject({
      selectedSerial: null,
      selectedDeviceId: null,
      selectedApkId: null,
      devices: [],
      apks: [],
    });
  });

  it('keeps library rows and drops a missing selected apk', () => {
    const file = parseEmulatorFile({
      selectedSerial: 'emulator-5554',
      selectedApkId: 'missing',
      selectedDeviceId: 'missing',
      devices: [
        {
          id: 'dev_1',
          name: 'Pixel 6',
          profile: 'pixel_6',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      apks: [
        {
          id: 'apk_1',
          name: 'Fennec',
          path: 'C:/apks/fennec.apk',
          source: 'fdroid',
          packageName: 'org.mozilla.fennec_fdroid',
          version: '1.2.3',
          addedAt: '2026-01-01T00:00:00.000Z',
        },
        { id: '', path: '' },
      ],
    });
    expect(file.selectedSerial).toBe('emulator-5554');
    expect(file.selectedApkId).toBeNull();
    expect(file.selectedDeviceId).toBeNull();
    expect(file.devices).toHaveLength(1);
    expect(file.devices[0]).toMatchObject({ avdName: null, avdHome: null });
    expect(file.apks).toHaveLength(1);
    expect(file.apks[0]).toMatchObject({
      id: 'apk_1',
      source: 'fdroid',
      packageName: 'org.mozilla.fennec_fdroid',
    });
    expect(findEmulatorApk(file, 'apk_1')?.name).toBe('Fennec');
    expect(findEmulatorDevice(file, 'dev_1')?.profile).toBe('pixel_6');
    expect(findEmulatorDevice(file, 'dev_1')?.openHome).toBe(false);
  });

  it('creates a named device from a profile', () => {
    const device = createEmulatorDevice('pixel_8');
    expect(device.profile).toBe('pixel_8');
    expect(device.name).toBe('Pixel 8');
    expect(device.openHome).toBe(false);
    expect(device.avdName).toBeNull();
    expect(device.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('merges discovered AVDs into the device list', () => {
    const app = createEmulatorDevice('pixel_6', 'App device');
    const existing = createEmulatorDeviceFromAvd({
      name: 'Pixel_7',
      displayName: 'Pixel 7',
      home: 'C:/Users/me/.android/avd',
    });
    const next = mergeEmulatorDevicesWithAvds(
      [app, existing, createEmulatorDeviceFromAvd({ name: 'Gone', displayName: 'Gone', home: 'C:/old' })],
      [
        { name: 'Pixel_7', displayName: 'Pixel 7 API 34', home: 'C:/Users/me/.android/avd' },
        { name: 'testrix', displayName: 'testrix', home: 'C:/managed' },
        { name: 'Medium_Phone', displayName: 'Medium Phone', home: 'C:/Users/me/.android/avd' },
      ],
    );
    expect(next.map((item) => item.avdName)).toEqual([null, 'Pixel_7', 'Medium_Phone']);
    expect(isAvdEmulatorDevice(next[1]!)).toBe(true);
    expect(next[1]?.name).toBe('Pixel 7');
    expect(next[2]?.id).toBe('avd_Medium_Phone');
  });
});
