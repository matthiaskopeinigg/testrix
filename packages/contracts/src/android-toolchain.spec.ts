import { describe, expect, it } from 'vitest';

import {
  androidAdbRelativePath,
  androidApiFromPackagePath,
  androidAvdDiscoveryHomes,
  androidHostOs,
  androidHypervisorHint,
  androidLicenseBlocksActivate,
  androidPackagesAlreadyInstalled,
  androidPlatformToolsUrl,
  androidPreferredAbi,
  androidRepoFileUrl,
  androidSdkDiscoveryRoots,
  isManagedAndroidPath,
  parseAdbDevices,
  parseAndroidRepoPackages,
  parseAvdDisplayName,
  parseAvdIniPath,
  parseEmulatorAccelCheck,
  pickAndroidRepoArchive,
  pickAndroidSystemImage,
  pickGoogleApisSystemImage,
  resolveAndroidEnvSdkRoot,
  resolveAndroidSdkRoot,
} from './android-toolchain';

describe('androidLicenseBlocksActivate', () => {
  it('blocks when the license was never accepted', () => {
    expect(androidLicenseBlocksActivate(null)).toBe(true);
    expect(androidLicenseBlocksActivate('')).toBe(true);
    expect(androidLicenseBlocksActivate('  ')).toBe(true);
  });

  it('allows download after an accept timestamp', () => {
    expect(androidLicenseBlocksActivate('2026-09-22T13:00:00.000Z')).toBe(false);
  });
});

describe('resolveAndroidSdkRoot', () => {
  it('prefers a settings override', () => {
    expect(
      resolveAndroidSdkRoot({
        settingsRoot: 'D:/sdk',
        managedRoot: 'C:/data/android-sdk',
        envRoot: 'E:/Android/Sdk',
        preferManaged: true,
      }),
    ).toBe('D:/sdk');
  });

  it('uses the managed tree after Activate', () => {
    expect(
      resolveAndroidSdkRoot({
        settingsRoot: '',
        managedRoot: 'C:/data/android-sdk',
        envRoot: 'E:/Android/Sdk',
        preferManaged: true,
      }),
    ).toBe('C:/data/android-sdk');
  });

  it('uses ANDROID_HOME when Activate is off and no override exists', () => {
    expect(
      resolveAndroidSdkRoot({
        settingsRoot: '',
        managedRoot: 'C:/data/android-sdk',
        envRoot: 'E:/Android/Sdk',
        preferManaged: false,
      }),
    ).toBe('E:/Android/Sdk');
  });

  it('falls back to the managed tree', () => {
    expect(
      resolveAndroidSdkRoot({
        settingsRoot: '',
        managedRoot: 'C:/data/android-sdk',
        envRoot: '',
        preferManaged: false,
      }),
    ).toBe('C:/data/android-sdk');
  });
});

describe('androidSdkDiscoveryRoots', () => {
  it('lists env and Windows Studio defaults without duplicates', () => {
    expect(
      androidSdkDiscoveryRoots({
        env: { ANDROID_HOME: 'E:/Android/Sdk' },
        homeDir: 'C:/Users/dev',
        localAppData: 'C:/Users/dev/AppData/Local',
        platform: 'win32',
      }),
    ).toEqual([
      'E:/Android/Sdk',
      'C:/Users/dev/AppData/Local/Android/Sdk',
    ]);
  });
});

describe('resolveAndroidEnvSdkRoot', () => {
  it('prefers ANDROID_SDK_ROOT', () => {
    expect(
      resolveAndroidEnvSdkRoot({
        ANDROID_SDK_ROOT: 'C:/Sdk',
        ANDROID_HOME: 'C:/Home',
      }),
    ).toBe('C:/Sdk');
  });
});

describe('androidPackagesAlreadyInstalled', () => {
  it('skips download when every package is present', () => {
    expect(
      androidPackagesAlreadyInstalled([
        { id: 'platform-tools', present: true },
        { id: 'emulator', present: true },
        { id: 'system-image', present: true },
      ]),
    ).toBe(true);
  });

  it('downloads when any package is missing', () => {
    expect(
      androidPackagesAlreadyInstalled([
        { id: 'platform-tools', present: true },
        { id: 'emulator', present: false },
      ]),
    ).toBe(false);
    expect(androidPackagesAlreadyInstalled([])).toBe(false);
  });
});

describe('parseAndroidRepoPackages', () => {
  const xml = `
    <sdk>
      <remotePackage path="emulator">
        <archives>
          <archive>
            <complete>
              <size>100</size>
              <checksum type="sha1">abc</checksum>
              <url>emulator-windows_x64-1.zip</url>
            </complete>
            <host-os>windows</host-os>
          </archive>
        </archives>
      </remotePackage>
      <remotePackage path="emulator">
        <obsolete/>
        <archives>
          <archive>
            <complete>
              <url>old.zip</url>
            </complete>
            <host-os>windows</host-os>
          </archive>
        </archives>
      </remotePackage>
      <remotePackage path="system-images;android-34;google_apis;x86_64">
        <archives>
          <archive>
            <complete>
              <size>200</size>
              <checksum>def</checksum>
              <url>x86_64-34_r14.zip</url>
            </complete>
          </archive>
        </archives>
      </remotePackage>
      <remotePackage path="system-images;android-36;google_apis;x86_64">
        <archives>
          <archive>
            <complete>
              <url>x86_64-36.zip</url>
            </complete>
          </archive>
        </archives>
      </remotePackage>
    </sdk>
  `;

  it('reads path, host, url, and checksum', () => {
    const packages = parseAndroidRepoPackages(xml);
    expect(pickAndroidRepoArchive(packages, 'emulator', 'windows')).toMatchObject({
      url: 'emulator-windows_x64-1.zip',
      sha1: 'abc',
      size: 100,
    });
  });

  it('skips obsolete packages', () => {
    const packages = parseAndroidRepoPackages(xml);
    expect(packages.filter((item) => item.url === 'old.zip')).toEqual([]);
  });

  it('prefers API 34 then the newest Google APIs image', () => {
    const packages = parseAndroidRepoPackages(xml);
    expect(pickGoogleApisSystemImage(packages, 'x86_64')?.path).toBe(
      'system-images;android-34;google_apis;x86_64',
    );
    expect(pickGoogleApisSystemImage(packages, 'x86_64', 99)?.path).toBe(
      'system-images;android-36;google_apis;x86_64',
    );
  });

  it('picks a Google Play Store system image by tag', () => {
    const packages = parseAndroidRepoPackages(`<?xml version="1.0"?>
    <sdk>
      <remotePackage path="system-images;android-34;google_apis_playstore;x86_64">
        <archives>
          <archive>
            <complete>
              <url>play-34.zip</url>
              <checksum>aaa</checksum>
            </complete>
          </archive>
        </archives>
      </remotePackage>
      <remotePackage path="system-images;android-34;google_apis;x86_64">
        <archives>
          <archive>
            <complete>
              <url>apis-34.zip</url>
            </complete>
          </archive>
        </archives>
      </remotePackage>
    </sdk>`);
    expect(pickAndroidSystemImage(packages, 'x86_64', 'google_apis_playstore')?.url).toBe('play-34.zip');
    expect(pickAndroidSystemImage(packages, 'x86_64', 'google_apis')?.url).toBe('apis-34.zip');
  });
});

describe('parseAdbDevices', () => {
  it('reads serial, state, and model', () => {
    const devices = parseAdbDevices(`
List of devices attached
emulator-5554          device product:sdk_gphone64_x86_64 model:sdk_gphone64_x86_64
R58M123                unauthorized usb:1-2
`);
    expect(devices).toEqual([
      { serial: 'emulator-5554', state: 'device', model: 'sdk gphone64 x86 64' },
      { serial: 'R58M123', state: 'unauthorized', model: '' },
    ]);
  });
});

describe('parseEmulatorAccelCheck', () => {
  it('marks WHPX as ready', () => {
    expect(
      parseEmulatorAccelCheck('accel:\n1\nWHPX (10.0.22621) is installed and usable.'),
    ).toEqual({
      state: 'ready',
      detail: 'WHPX (10.0.22621) is installed and usable.',
    });
  });

  it('marks a missing hypervisor', () => {
    expect(parseEmulatorAccelCheck('accel:\n0\nWHPX is not installed/disabled/unavailable')).toMatchObject({
      state: 'missing',
    });
  });
});

describe('android helpers', () => {
  it('maps platform and arch', () => {
    expect(androidHostOs('darwin')).toBe('macos');
    expect(androidPreferredAbi('arm64')).toBe('arm64-v8a');
    expect(androidAdbRelativePath('win32')).toBe('platform-tools/adb.exe');
    expect(androidPlatformToolsUrl('windows')).toBe(
      'https://dl.google.com/android/repository/platform-tools-latest-windows.zip',
    );
    expect(androidRepoFileUrl('https://dl.google.com/android/repository', 'emu.zip')).toBe(
      'https://dl.google.com/android/repository/emu.zip',
    );
    expect(androidApiFromPackagePath('system-images;android-34;google_apis;x86_64')).toBe(34);
    expect(androidHypervisorHint('win32')).toContain('Windows Hypervisor Platform');
  });

  it('detects managed paths under userData', () => {
    expect(isManagedAndroidPath('C:\\Users\\a\\AppData\\Testrix\\android-sdk', 'C:\\Users\\a\\AppData\\Testrix')).toBe(
      true,
    );
    expect(isManagedAndroidPath('C:\\Android\\Sdk', 'C:\\Users\\a\\AppData\\Testrix')).toBe(false);
  });

  it('lists common Studio AVD homes after the managed tree', () => {
    expect(
      androidAvdDiscoveryHomes({
        managedHome: 'C:/data/android-avd',
        envHome: 'D:/custom-avd',
        userAvdHome: 'C:/Users/me/.android/avd',
      }),
    ).toEqual(['C:/data/android-avd', 'D:/custom-avd', 'C:/Users/me/.android/avd']);
  });

  it('parses AVD display name and path', () => {
    expect(parseAvdDisplayName('avd.ini.displayname=Pixel 8\nAvdId=Pixel_8\n', 'Pixel_8')).toBe(
      'Pixel 8',
    );
    expect(parseAvdIniPath('avd.ini.encoding=UTF-8\npath=C:/Users/me/.android/avd/Pixel_8.avd\n')).toBe(
      'C:/Users/me/.android/avd/Pixel_8.avd',
    );
  });
});
