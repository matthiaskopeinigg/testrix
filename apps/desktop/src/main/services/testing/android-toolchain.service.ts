import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';

import { app, dialog, shell, type OpenDialogOptions } from 'electron';
import {
  ANDROID_AVD_DIR_NAME,
  ANDROID_AVD_NAME,
  ANDROID_REPO_BASE_URL,
  ANDROID_REPO_XML_URL,
  ANDROID_SDK_DIR_NAME,
  ANDROID_SDK_LICENSE_HASHES,
  androidAdbRelativePath,
  androidAvdDiscoveryHomes,
  androidEmulatorRelativePath,
  androidHostOs,
  androidHypervisorHint,
  androidLicenseBlocksActivate,
  androidPackagesAlreadyInstalled,
  androidPlatformToolsUrl,
  androidPreferredAbi,
  androidRepoFileUrl,
  androidSdkDiscoveryRoots,
  androidSystemImageBaseUrl,
  androidSystemImageCatalogUrl,
  androidSystemImageTagLabel,
  emptyAndroidHypervisorStatus,
  findEmulatorDevice,
  findEmulatorDeviceProfile,
  isAvdEmulatorDevice,
  isManagedAndroidPath,
  mergeEmulatorDevicesWithAvds,
  parseAdbDevices,
  parseAndroidSystemImageAbi,
  parseAndroidSystemImageApi,
  parseAndroidSystemImageTag,
  parseAndroidRepoPackages,
  parseAvdDisplayName,
  parseAvdIniPath,
  parseEmulatorAccelCheck,
  pickAndroidRepoArchive,
  resolveAndroidEnvSdkRoot,
  resolveAndroidSdkRoot,
  type AndroidAbi,
  type AndroidAvdInfo,
  type AndroidHypervisorStatus,
  type AndroidPackageStatus,
  type AndroidSystemImageTag,
  type AndroidToolchainCommandResult,
  type AndroidToolchainEvent,
  type AndroidToolchainStatus,
} from '@testrix/contracts';

import type { ConfigStore } from '../config.service';
import { AdbClient } from './adb-client';
import { restyleEmulatorChrome } from './emulator-chrome';
import { findEmulatorClientBounds, findRunningEmulatorSdkRoot } from './emulator-window';

const execFileAsync = promisify(execFile);

export interface AndroidToolchainHostOptions {
  readonly store: ConfigStore;
  readonly getMainWindow: () => import('electron').BrowserWindow | null;
}

/**
 * Downloads a managed Android SDK, creates the Testrix AVD, and starts the emulator sidecar.
 */
export class AndroidToolchainHost {
  private listener: ((event: AndroidToolchainEvent) => void) | null = null;
  private busy = false;
  private lastError: string | null = null;
  private emulatorChild: ChildProcess | null = null;
  private startedByUs = false;
  /** Whether the last spawn used a visible window (`null` = unknown / external). */
  private lastEmulatorShowWindow: boolean | null = null;
  private imageApi = 34;
  private imageAbi: AndroidAbi = 'x86_64';
  private sdkDetectPromise: Promise<void> | null = null;
  /** adb.exe that last reported an online device. */
  private adbPathInUse: string | null = null;
  /** One adb-server restart per process, only when an emulator is visible but invisible to adb. */
  private adbServerReset = false;

  constructor(private readonly options: AndroidToolchainHostOptions) {}

  bind(listener: (event: AndroidToolchainEvent) => void): void {
    this.listener = listener;
  }

  status(): AndroidToolchainStatus {
    const settings = this.options.store.settings;
    const userData = app.getPath('userData');
    const managedRoot = path.join(userData, ANDROID_SDK_DIR_NAME);
    const avdHome = path.join(userData, ANDROID_AVD_DIR_NAME);
    const sdkRoot = resolveAndroidSdkRoot({
      settingsRoot: settings.androidSdkRoot,
      managedRoot,
      envRoot: resolveAndroidEnvSdkRoot(process.env),
      preferManaged: settings.androidEmulatorActivated,
    });
    const packages = this.packageStatuses(sdkRoot);
    const packagesReady = androidPackagesAlreadyInstalled(packages);
    const preferredSystemImageTag = this.preferredImageTag();
    const systemImage = this.findSystemImage(sdkRoot, preferredSystemImageTag) ?? this.findSystemImage(sdkRoot);
    const hypervisor = this.lastHypervisor ?? emptyAndroidHypervisorStatus();
    const emulatorRunning = this.isEmulatorProcessAlive();
    const licenseAccepted = !androidLicenseBlocksActivate(settings.androidSdkLicenseAcceptedAt);
    const cache = path.join(userData, 'android-cache');
    const canRemove =
      fileExists(managedRoot) || fileExists(avdHome) || fileExists(cache);
    const selected = findEmulatorDevice(
      this.options.store.emulator,
      this.options.store.emulator.selectedDeviceId,
    );
    return {
      activated: settings.androidEmulatorActivated,
      licenseAccepted,
      busy: this.busy,
      sdkRoot,
      avdHome,
      avdName: selected?.avdName?.trim() || ANDROID_AVD_NAME,
      avdExists: this.hasAvd(avdHome),
      avds: this.lastAvds,
      usingManagedSdk: isManagedAndroidPath(sdkRoot, userData),
      packages,
      packagesReady,
      systemImageTag: systemImage?.tag ?? null,
      preferredSystemImageTag,
      systemImageApi: systemImage?.api ?? null,
      systemImageAbi: systemImage?.abi ?? null,
      hypervisor,
      emulatorRunning,
      emulatorPid: emulatorRunning ? (this.emulatorChild?.pid ?? null) : null,
      devices: this.lastDevices,
      canStart: packagesReady && hypervisor.state !== 'missing' && !emulatorRunning && !this.busy,
      canRemove,
      error: this.lastError,
    };
  }

  async activate(): Promise<AndroidToolchainCommandResult> {
    if (this.busy)
      return this.fail('Android tools are already installing.');
    if (androidLicenseBlocksActivate(this.options.store.settings.androidSdkLicenseAcceptedAt))
      return this.fail('Accept the Android SDK license before Activate.');
    this.busy = true;
    this.lastError = null;
    try {
      await this.ensureDetectedSdk();
      const snapshot = this.status();
      await mkdir(snapshot.sdkRoot, { recursive: true });
      await mkdir(snapshot.avdHome, { recursive: true });
      await this.writeLicenses(snapshot.sdkRoot);
      await this.releaseSdkLocks(snapshot.sdkRoot);
      // Always run: jobs skip files already on disk; preferred Play image still downloads when missing.
      await this.installPackages(snapshot.sdkRoot);
      await this.ensureAvd(snapshot.sdkRoot, snapshot.avdHome);
      await this.probeHypervisor(snapshot.sdkRoot);
      await this.syncAvdDevices();
      await this.refreshDevices(snapshot.sdkRoot);
      await this.options.store.patchSettings({ androidEmulatorActivated: true });
      this.emit({ phase: 'done', percent: 100, message: 'Android tools are ready. Start the emulator from Services → Emulator.' });
      return { ok: true, error: null, status: this.status() };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Android toolchain install failed.';
      this.lastError = message;
      this.emit({ phase: 'error', percent: 0, message, error: message });
      return this.fail(message);
    } finally {
      this.busy = false;
    }
  }

  async deactivate(): Promise<AndroidToolchainCommandResult> {
    await this.stopEmulator();
    await this.options.store.patchSettings({ androidEmulatorActivated: false });
    this.emit({ phase: 'done', percent: 100, message: 'Emulator deactivated. SDK files stayed on disk.' });
    return { ok: true, error: null, status: this.status() };
  }

  /**
   * Online emulator for Pick. Reuses a running device and leaves its current
   * app on screen. Starts the selected device only when nothing is online.
   * Does not stop the emulator.
   */
  async ensureEmulatorForPick(): Promise<AndroidToolchainCommandResult> {
    await this.ensureDetectedSdk();
    await this.syncAvdDevices();
    const selected = findEmulatorDevice(
      this.options.store.emulator,
      this.options.store.emulator.selectedDeviceId,
    );
    if (!selected)
      return this.fail('Add and select a device in the Emulator sidebar before picking.');
    const snapshot = this.status();
    if (!snapshot.packagesReady)
      return this.fail('Activate Android tools before picking a control.');

    await this.listDevices();
    if (this.hasOnlineAdbDevice())
      return { ok: true, error: null, status: this.status() };

    return this.startEmulator({ deviceId: selected.id });
  }

  async startEmulator(
    options: {
      deviceId?: string;
      coldBoot?: boolean;
      openHome?: boolean;
      /** When false, launches with `-no-window` (headless). Defaults to true. */
      showWindow?: boolean;
    } = {},
  ): Promise<AndroidToolchainCommandResult> {
    await this.ensureDetectedSdk();
    await this.syncAvdDevices();
    if (options.deviceId?.trim()) {
      const wanted = findEmulatorDevice(this.options.store.emulator, options.deviceId.trim());
      if (!wanted)
        return this.fail('That device is not in the Emulator sidebar.');
      if (this.options.store.emulator.selectedDeviceId !== wanted.id)
        await this.options.store.patchEmulator({ selectedDeviceId: wanted.id });
    }

    let snapshot = this.status();
    const selected = findEmulatorDevice(
      this.options.store.emulator,
      this.options.store.emulator.selectedDeviceId,
    );
    if (!selected)
      return this.fail('Add and select a device in the Emulator sidebar before starting.');
    if (!snapshot.packagesReady)
      return this.fail('Activate Android tools on this console before starting the emulator.');

    const showWindow = options.showWindow !== false;
    const externalAvd = isAvdEmulatorDevice(selected);
    const launchAvdName = selected.avdName?.trim() || ANDROID_AVD_NAME;
    const launchAvdHome =
      (externalAvd && selected.avdHome?.trim()) || snapshot.avdHome;

    await this.listDevices();
    let bootedFresh = false;
    const coldBoot = options.coldBoot === true;
    // Hidden runs cannot reuse a visible window — restart headless.
    const needsHeadlessRestart =
      !showWindow &&
      (this.hasOnlineAdbDevice() || this.isEmulatorChildAlive()) &&
      this.lastEmulatorShowWindow !== false;
    if (
      (coldBoot || needsHeadlessRestart) &&
      (this.hasOnlineAdbDevice() || this.isEmulatorChildAlive())
    ) {
      this.emit({
        phase: 'start',
        percent: 25,
        message: needsHeadlessRestart
          ? `Starting ${selected.name} hidden…`
          : `Cold booting ${selected.name}…`,
      });
      await this.stopVisibleEmulator();
      await this.listDevices();
    }
    if (!this.hasOnlineAdbDevice()) {
      const visible = Boolean(await findRunningEmulatorSdkRoot()) || this.isEmulatorChildAlive();
      if (visible) {
        this.emit({
          phase: 'start',
          percent: 40,
          message: coldBoot
            ? `Cold booting ${selected.name}…`
            : `${selected.name} is open but adb is offline. Restarting onto the home screen…`,
        });
        await this.stopVisibleEmulator();
      }
      if (snapshot.hypervisor.state !== 'ready')
        await this.probeHypervisor(snapshot.sdkRoot);
      snapshot = this.status();
      if (snapshot.hypervisor.state === 'missing')
        return this.fail(snapshot.hypervisor.hint || 'Enable a hypervisor before starting the emulator.');
      if (externalAvd) {
        if (!fileExists(path.join(launchAvdHome, `${launchAvdName}.ini`)))
          return this.fail(`AVD "${launchAvdName}" was not found under ${launchAvdHome}.`);
      } else {
        await this.ensureAvd(snapshot.sdkRoot, launchAvdHome, selected.name, selected.profile);
      }
      if (!this.options.store.settings.androidEmulatorActivated)
        await this.options.store.patchSettings({ androidEmulatorActivated: true });
      const emulator = path.join(snapshot.sdkRoot, androidEmulatorRelativePath(process.platform));
      this.emit({
        phase: 'start',
        percent: 70,
        message: !showWindow
          ? `Starting ${selected.name} hidden…`
          : coldBoot
            ? `Cold booting ${selected.name}…`
            : `Starting ${selected.name}…`,
      });
      const launchArgs = ['-avd', launchAvdName];
      if (!showWindow)
        launchArgs.push('-no-window');
      const wipeManaged = !externalAvd && fileExists(this.wipeMarker(launchAvdHome));
      if (coldBoot || wipeManaged)
        launchArgs.push('-no-snapshot-load');
      if (wipeManaged)
        launchArgs.push('-wipe-data');
      try {
        this.emulatorChild = spawn(emulator, launchArgs, {
          cwd: path.dirname(emulator),
          env: this.sdkEnv(snapshot.sdkRoot, launchAvdHome),
          stdio: 'pipe',
          windowsHide: false,
        });
        this.startedByUs = true;
        this.lastEmulatorShowWindow = showWindow;
        this.emulatorChild.on('exit', () => {
          this.emulatorChild = null;
          this.startedByUs = false;
          this.lastEmulatorShowWindow = null;
        });
        bootedFresh = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not start the emulator.';
        this.lastError = message;
        return this.fail(message);
      }
      try {
        await this.waitForDevice(snapshot.sdkRoot, 120_000);
        await this.listDevices();
        const online = this.lastDevices.find((item) => item.state === 'device');
        if (online) {
          await this.options.store.patchEmulator({ selectedSerial: online.serial });
          await this.waitForBootReady(online.serial, 120_000);
        }
        if (wipeManaged)
          await rm(this.wipeMarker(launchAvdHome), { force: true });
        if (showWindow)
          await restyleEmulatorChrome().catch(() => undefined);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not start the emulator.';
        this.lastError = message;
        return this.fail(message);
      }
    } else {
      // Warm reuse: adb is online, but the AVD may still be mid-boot after a recent spawn.
      const preferred = this.options.store.emulator.selectedSerial?.trim() ?? '';
      const online = this.lastDevices.filter((item) => item.state === 'device');
      const serial =
        (preferred && online.find((item) => item.serial === preferred)?.serial) ||
        online.find((item) => item.serial.startsWith('emulator-'))?.serial ||
        online[0]?.serial ||
        null;
      if (serial)
        await this.waitForBootReady(serial, 90_000).catch(() => undefined);
    }

    // Fresh boots always land on Home. Reuse only when openHome is explicitly true.
    const shouldHome = bootedFresh || options.openHome === true;
    if (shouldHome) {
      const home = await this.goHomeScreen();
      if (!home.ok)
        return { ...home, bootedFresh };
    }
    this.emit({
      phase: 'done',
      percent: 100,
      message: bootedFresh
        ? !showWindow
          ? `${selected.name} started hidden.`
          : coldBoot
            ? `${selected.name} cold booted on the home screen.`
            : `${selected.name} started on the home screen.`
        : shouldHome
          ? `${selected.name} is on the home screen.`
          : `${selected.name} is ready.`,
    });
    return { ok: true, error: null, status: this.status(), bootedFresh };
  }

  async stopEmulator(): Promise<AndroidToolchainCommandResult> {
    this.emit({ phase: 'stop', percent: 20, message: 'Stopping the emulator…' });
    const snapshot = this.status();
    if (this.startedByUs && this.emulatorChild?.pid) {
      await killProcessTree(this.emulatorChild.pid);
      this.emulatorChild = null;
      this.startedByUs = false;
      this.lastEmulatorShowWindow = null;
    } else if (snapshot.devices.some((item) => item.serial.startsWith('emulator-'))) {
      const adb = path.join(snapshot.sdkRoot, androidAdbRelativePath(process.platform));
      const serial = snapshot.devices.find((item) => item.serial.startsWith('emulator-'))?.serial;
      if (serial)
        await execFileAsync(adb, ['-s', serial, 'emu', 'kill'], { timeout: 8_000 }).catch(() => undefined);
    }
    await this.forceStopEmulatorProcesses();
    this.emulatorChild = null;
    this.startedByUs = false;
    this.lastEmulatorShowWindow = null;
    await this.refreshDevices(snapshot.sdkRoot);
    this.emit({ phase: 'done', percent: 100, message: 'Emulator stopped.' });
    return { ok: true, error: null, status: this.status() };
  }

  /** Stops a visible emulator that adb still reports offline, then waits for the process to exit. */
  private async stopVisibleEmulator(): Promise<void> {
    const adb = this.adbBinary();
    const serial = this.lastDevices.find((item) => item.serial.startsWith('emulator-'))?.serial;
    if (adb && serial)
      await execFileAsync(adb, ['-s', serial, 'emu', 'kill'], { timeout: 8_000, env: this.adbEnv() }).catch(() => undefined);
    if (this.emulatorChild?.pid)
      await killProcessTree(this.emulatorChild.pid).catch(() => undefined);
    this.emulatorChild = null;
    this.startedByUs = false;
    this.lastEmulatorShowWindow = null;
    await this.forceStopEmulatorProcesses();
    await sleep(800);
  }

  private async forceStopEmulatorProcesses(): Promise<void> {
    if (process.platform !== 'win32')
      return;
    await execFileAsync('taskkill', ['/IM', 'qemu-system-x86_64.exe', '/F'], { timeout: 8_000 }).catch(() => undefined);
    await execFileAsync('taskkill', ['/IM', 'emulator.exe', '/F'], { timeout: 8_000 }).catch(() => undefined);
  }

  private adbEnv(): NodeJS.ProcessEnv {
    const avdHome = path.join(app.getPath('userData'), ANDROID_AVD_DIR_NAME);
    return {
      ...process.env,
      ANDROID_AVD_HOME: avdHome,
      ANDROID_EMULATOR_HOME: avdHome,
      ANDROID_SDK_HOME: avdHome,
      ADB_VENDOR_KEYS: path.join(avdHome, 'adbkey'),
    };
  }

  async uninstall(): Promise<AndroidToolchainCommandResult> {
    this.busy = true;
    this.lastError = null;
    try {
      await this.stopEmulator();
      const userData = app.getPath('userData');
      const managedSdk = path.join(userData, ANDROID_SDK_DIR_NAME);
      const managedAvd = path.join(userData, ANDROID_AVD_DIR_NAME);
      const cache = path.join(userData, 'android-cache');
      this.emit({ phase: 'remove', percent: 30, message: 'Stopping adb and removing managed Android tools…' });
      await this.releaseSdkLocks(managedSdk);
      await rmLocked(managedSdk);
      await rmLocked(managedAvd);
      await rmLocked(cache);
      await this.options.store.patchSettings({ androidEmulatorActivated: false });
      this.lastHypervisor = emptyAndroidHypervisorStatus();
      this.lastDevices = [];
      this.emit({ phase: 'done', percent: 100, message: 'Managed Android tools removed.' });
      return { ok: true, error: null, status: this.status() };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not remove Android tools.';
      this.emit({ phase: 'error', percent: 0, message, error: message });
      return this.fail(message);
    } finally {
      this.busy = false;
    }
  }

  async chooseSdkRoot(): Promise<AndroidToolchainStatus | null> {
    const win = this.options.getMainWindow();
    const options: OpenDialogOptions = {
      title: 'Choose Android SDK folder',
      defaultPath: this.status().sdkRoot || app.getPath('userData'),
      properties: ['openDirectory', 'createDirectory'],
    };
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0)
      return null;
    await this.options.store.patchSettings({ androidSdkRoot: result.filePaths[0] });
    return this.status();
  }

  async revealSdk(): Promise<void> {
    const { sdkRoot } = this.status();
    await mkdir(sdkRoot, { recursive: true });
    await shell.openPath(sdkRoot);
  }

  adbBinary(): string | null {
    if (this.adbPathInUse && fileExists(this.adbPathInUse))
      return this.adbPathInUse;
    const relative = androidAdbRelativePath(process.platform);
    const primary = path.join(this.status().sdkRoot, relative);
    if (fileExists(primary))
      return primary;
    for (const root of this.adbSearchRoots()) {
      const candidate = path.join(root, relative);
      if (fileExists(candidate))
        return candidate;
    }
    return null;
  }

  async listDevices(): Promise<AndroidToolchainStatus['devices']> {
    await this.ensureDetectedSdk();
    const liveSdk = await findRunningEmulatorSdkRoot();
    const roots = liveSdk ? [liveSdk, ...this.adbSearchRoots()] : this.adbSearchRoots();
    for (const root of roots) {
      await this.refreshDevices(root);
      if (this.hasOnlineAdbDevice())
        return this.lastDevices;
    }
    await this.reconnectVisibleEmulator(liveSdk);
    return this.lastDevices;
  }

  async refresh(): Promise<AndroidToolchainStatus> {
    if (this.busy)
      return this.status();
    await this.ensureDetectedSdk();
    const snapshot = this.status();
    const emulator = path.join(snapshot.sdkRoot, androidEmulatorRelativePath(process.platform));
    if (fileExists(emulator) && (!this.lastHypervisor || this.lastHypervisor.state === 'unknown'))
      await this.probeHypervisor(snapshot.sdkRoot);
    await this.syncAvdDevices();
    await this.refreshDevices(snapshot.sdkRoot);
    return this.status();
  }

  /** Discovers AVDs under managed + Studio homes and merges them into the Emulator sidebar. */
  async syncAvdDevices(): Promise<void> {
    const avds = await this.listAvds();
    const file = this.options.store.emulator;
    const next = mergeEmulatorDevicesWithAvds(file.devices, avds, ANDROID_AVD_NAME);
    if (devicesEqual(file.devices, next))
      return;
    const selectedDeviceId =
      file.selectedDeviceId && next.some((item) => item.id === file.selectedDeviceId)
        ? file.selectedDeviceId
        : (next[0]?.id ?? null);
    await this.options.store.patchEmulator({ devices: next, selectedDeviceId });
  }

  async listAvds(): Promise<readonly AndroidAvdInfo[]> {
    const userData = app.getPath('userData');
    const home = process.env['USERPROFILE'] || process.env['HOME'] || app.getPath('home');
    const homes = androidAvdDiscoveryHomes({
      managedHome: path.join(userData, ANDROID_AVD_DIR_NAME),
      envHome: process.env['ANDROID_AVD_HOME'] ?? '',
      userAvdHome: path.join(home, '.android', 'avd'),
    });
    const out: AndroidAvdInfo[] = [];
    const seen = new Set<string>();
    for (const avdHome of homes) {
      let entries: string[] = [];
      try {
        entries = await readdir(avdHome);
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.toLowerCase().endsWith('.ini'))
          continue;
        const name = entry.slice(0, -4).trim();
        if (!name || seen.has(name.toLowerCase()))
          continue;
        const iniPath = path.join(avdHome, entry);
        let iniText = '';
        try {
          iniText = await readFile(iniPath, 'utf8');
        } catch {
          continue;
        }
        const avdPath = parseAvdIniPath(iniText) || path.join(avdHome, `${name}.avd`);
        let displayName = name.replace(/_/g, ' ');
        try {
          const config = await readFile(path.join(avdPath, 'config.ini'), 'utf8');
          displayName = parseAvdDisplayName(config, displayName);
        } catch {
          // Keep the ini filename as the label.
        }
        seen.add(name.toLowerCase());
        out.push({ name, displayName, home: avdHome, path: avdPath });
      }
    }
    this.lastAvds = out;
    return out;
  }

  /**
   * When no SDK path is configured, adopt an existing Studio / ANDROID_HOME install
   * that already has platform-tools + emulator + a system image.
   */
  private async ensureDetectedSdk(): Promise<void> {
    if (this.sdkDetectPromise) {
      await this.sdkDetectPromise;
      return;
    }
    this.sdkDetectPromise = this.detectAndAdoptSdk();
    try {
      await this.sdkDetectPromise;
    } finally {
      this.sdkDetectPromise = null;
    }
  }

  private async detectAndAdoptSdk(): Promise<void> {
    const settings = this.options.store.settings;
    if (settings.androidSdkRoot.trim())
      return;

    const userData = app.getPath('userData');
    const managedRoot = path.join(userData, ANDROID_SDK_DIR_NAME);
    const current = resolveAndroidSdkRoot({
      settingsRoot: '',
      managedRoot,
      envRoot: resolveAndroidEnvSdkRoot(process.env),
      preferManaged: settings.androidEmulatorActivated,
    });
    if (androidPackagesAlreadyInstalled(this.packageStatuses(current))) {
      if (!settings.androidEmulatorActivated) {
        await this.options.store.patchSettings({
          androidSdkRoot: isManagedAndroidPath(current, userData) ? '' : current,
          androidEmulatorActivated: true,
          androidSdkLicenseAcceptedAt:
            settings.androidSdkLicenseAcceptedAt ?? new Date().toISOString(),
        });
      }
      return;
    }

    const home = process.env['USERPROFILE'] || process.env['HOME'] || app.getPath('home');
    const candidates = androidSdkDiscoveryRoots({
      env: process.env,
      homeDir: home,
      localAppData: process.env['LOCALAPPDATA'] || '',
      platform: process.platform,
    });
    for (const candidate of candidates) {
      if (!fileExists(candidate))
        continue;
      if (!androidPackagesAlreadyInstalled(this.packageStatuses(candidate)))
        continue;
      await this.options.store.patchSettings({
        androidSdkRoot: candidate,
        androidEmulatorActivated: true,
        androidSdkLicenseAcceptedAt:
          this.options.store.settings.androidSdkLicenseAcceptedAt ?? new Date().toISOString(),
      });
      this.emit({
        phase: 'done',
        percent: 100,
        message: `Using existing Android SDK at ${candidate}.`,
      });
      return;
    }
  }

  /** Presses HOME so Pick / Start Device can land on the launcher without rebooting. */
  async openHomeScreen(): Promise<AndroidToolchainCommandResult> {
    return this.goHomeScreen();
  }

  /** Presses HOME / launches the home intent so Start Device lands on the launcher. */
  private async goHomeScreen(): Promise<AndroidToolchainCommandResult> {
    const adbPath = this.adbBinary();
    if (!adbPath)
      return this.fail('adb is missing; Activate Android tools first.');
    try {
      await this.waitForDevice(this.status().sdkRoot, 60_000);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No online Android device.';
      return this.fail(message);
    }
    const preferred = this.options.store.emulator.selectedSerial?.trim() ?? '';
    const online = this.lastDevices.filter((item) => item.state === 'device');
    const serial =
      (preferred && online.find((item) => item.serial === preferred)?.serial) ||
      online.find((item) => item.serial.startsWith('emulator-'))?.serial ||
      online[0]?.serial ||
      null;
    if (!serial)
      return this.fail('The emulator did not come online. Start Device again once the window is up.');
    try {
      await this.waitForBootReady(serial, 90_000);
      const adb = new AdbClient(adbPath);
      // Quick-boot restores the last app. HOME, then the launcher intent.
      await adb.press(serial, 'HOME');
      await sleep(250);
      await adb.press(serial, 'HOME');
      await sleep(250);
      await adb.shell(
        serial,
        'am start -a android.intent.action.MAIN -c android.intent.category.HOME -f 0x10000000',
      );
      await sleep(700);
      return { ok: true, error: null, status: this.status() };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not open the home screen.';
      return this.fail(message);
    }
  }

  /**
   * Downloads the preferred system image if needed and retargets the AVD.
   * A tag change wipes userdata on the next start.
   */
  async applySystemImage(): Promise<AndroidToolchainCommandResult> {
    if (this.busy)
      return this.fail('Android tools are already installing.');
    if (androidLicenseBlocksActivate(this.options.store.settings.androidSdkLicenseAcceptedAt))
      return this.fail('Accept the Android SDK license before changing the system image.');
    this.busy = true;
    this.lastError = null;
    try {
      if (this.isEmulatorProcessAlive() || this.hasOnlineAdbDevice())
        await this.stopEmulator();
      await this.ensureDetectedSdk();
      const snapshot = this.status();
      await mkdir(snapshot.sdkRoot, { recursive: true });
      await mkdir(snapshot.avdHome, { recursive: true });
      await this.writeLicenses(snapshot.sdkRoot);
      await this.releaseSdkLocks(snapshot.sdkRoot);
      const previous = await this.readAvdImageKey(snapshot.avdHome);
      const next = this.nextImageKey();
      await this.installPackages(snapshot.sdkRoot);
      if (previous && previous !== next)
        await writeFile(this.wipeMarker(snapshot.avdHome), next, 'utf8');
      await this.ensureAvd(snapshot.sdkRoot, snapshot.avdHome);
      await this.probeHypervisor(snapshot.sdkRoot);
      await this.refreshDevices(snapshot.sdkRoot);
      const wiped = previous && previous !== next;
      const label = `API ${this.preferredApi()} ${androidSystemImageTagLabel(this.preferredImageTag())} (${this.preferredAbi()})`;
      this.emit({
        phase: 'done',
        percent: 100,
        message: wiped
          ? `${label} is ready. The next start wipes emulator data.`
          : `${label} is ready.`,
      });
      return { ok: true, error: null, status: this.status() };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not switch the system image.';
      this.lastError = message;
      this.emit({ phase: 'error', percent: 0, message, error: message });
      return this.fail(message);
    } finally {
      this.busy = false;
    }
  }

  /**
   * Stops the emulator process tree. Prefer {@link stopEmulator} on quit so adb
   * and Windows qemu/emulator processes are cleaned up too.
   */
  dispose(): void {
    void this.stopEmulator().catch(() => undefined);
  }

  private lastHypervisor: AndroidHypervisorStatus | null = null;
  private lastDevices: AndroidToolchainStatus['devices'] = [];
  private lastAvds: AndroidAvdInfo[] = [];

  private wipeMarker(avdHome: string): string {
    return path.join(avdHome, 'testrix-wipe-data');
  }

  private async readAvdImageKey(avdHome: string): Promise<string | null> {
    try {
      const text = await readFile(path.join(avdHome, `${ANDROID_AVD_NAME}.avd`, 'config.ini'), 'utf8');
      const sys = /^image\.sysdir\.1=system-images\/android-(\d+)\/([^/\r\n]+)\/([^/\r\n]+)\/?/m.exec(text);
      if (!sys)
        return null;
      return `${sys[2]}|${sys[1]}|${sys[3]}`;
    } catch {
      return null;
    }
  }

  private fail(error: string): AndroidToolchainCommandResult {
    this.lastError = error;
    return { ok: false, error, status: this.status() };
  }

  private emit(event: AndroidToolchainEvent): void {
    this.listener?.(event);
  }

  private preferredImageTag(): AndroidSystemImageTag {
    return parseAndroidSystemImageTag(this.options.store.settings.androidSystemImageTag);
  }

  private preferredApi(): number {
    return parseAndroidSystemImageApi(this.options.store.settings.androidSystemImageApi);
  }

  private preferredAbi(): AndroidAbi {
    return parseAndroidSystemImageAbi(this.options.store.settings.androidSystemImageAbi)
      || androidPreferredAbi(process.arch);
  }

  private nextImageKey(): string {
    return `${this.preferredImageTag()}|${this.preferredApi()}|${this.preferredAbi()}`;
  }

  private packageStatuses(sdkRoot: string): AndroidPackageStatus[] {
    const preferred = this.preferredImageTag();
    return [
      { id: 'platform-tools', present: fileExists(path.join(sdkRoot, androidAdbRelativePath(process.platform))) },
      { id: 'emulator', present: fileExists(path.join(sdkRoot, androidEmulatorRelativePath(process.platform))) },
      { id: 'system-image', present: Boolean(this.findSystemImage(sdkRoot, preferred) ?? this.findSystemImage(sdkRoot)) },
    ];
  }

  private hasAvd(avdHome: string): boolean {
    return fileExists(path.join(avdHome, `${ANDROID_AVD_NAME}.ini`));
  }

  private isEmulatorProcessAlive(): boolean {
    if (this.isEmulatorChildAlive())
      return true;
    return this.hasOnlineAdbDevice() && this.lastDevices.some((item) => item.serial.startsWith('emulator-'));
  }

  private isEmulatorChildAlive(): boolean {
    const pid = this.emulatorChild?.pid;
    if (!pid)
      return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      this.emulatorChild = null;
      this.startedByUs = false;
      return false;
    }
  }

  private hasOnlineAdbDevice(): boolean {
    return this.lastDevices.some((item) => item.state === 'device');
  }

  /** SDK roots that may contain a working platform-tools/adb. */
  private adbSearchRoots(): string[] {
    const userData = app.getPath('userData');
    const home = process.env['USERPROFILE'] || process.env['HOME'] || app.getPath('home');
    const roots = [
      this.status().sdkRoot,
      this.options.store.settings.androidSdkRoot.trim(),
      path.join(userData, ANDROID_SDK_DIR_NAME),
      resolveAndroidEnvSdkRoot(process.env),
      ...androidSdkDiscoveryRoots({
        env: process.env,
        homeDir: home,
        localAppData: process.env['LOCALAPPDATA'] || '',
        platform: process.platform,
      }),
    ];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const root of roots) {
      const trimmed = root.trim();
      if (!trimmed)
        continue;
      const key = trimmed.replace(/\\/g, '/').toLowerCase();
      if (seen.has(key))
        continue;
      seen.add(key);
      out.push(trimmed);
    }
    return out;
  }

  private sdkEnv(sdkRoot: string, avdHome: string): NodeJS.ProcessEnv {
    return {
      ...process.env,
      ANDROID_SDK_ROOT: sdkRoot,
      ANDROID_HOME: sdkRoot,
      ANDROID_AVD_HOME: avdHome,
      ANDROID_EMULATOR_HOME: avdHome,
      ANDROID_SDK_HOME: avdHome,
      ADB_VENDOR_KEYS: path.join(avdHome, 'adbkey'),
    };
  }

  private async writeLicenses(sdkRoot: string): Promise<void> {
    const licenses = path.join(sdkRoot, 'licenses');
    await mkdir(licenses, { recursive: true });
    await writeFile(path.join(licenses, 'android-sdk-license'), `${ANDROID_SDK_LICENSE_HASHES.join('\n')}\n`, 'utf8');
  }

  private async installPackages(sdkRoot: string): Promise<void> {
    const hostOs = androidHostOs(process.platform);
    const tag = this.preferredImageTag();
    const api = this.preferredApi();
    this.imageAbi = this.preferredAbi();
    this.emit({
      phase: 'download',
      percent: 2,
      message: `Reading Google SDK catalogs (API ${api} ${androidSystemImageTagLabel(tag)})…`,
    });
    const repoXml = await downloadText(ANDROID_REPO_XML_URL);
    const imgXml = await downloadText(androidSystemImageCatalogUrl(tag));
    const repoPackages = parseAndroidRepoPackages(repoXml);
    const imgPackages = parseAndroidRepoPackages(imgXml);
    const emulator = pickAndroidRepoArchive(repoPackages, 'emulator', hostOs);
    if (!emulator)
      throw new Error('Google’s catalog has no emulator package for this OS.');
    const wanted = `system-images;android-${api};${tag};${this.imageAbi}`;
    const systemImage = imgPackages.find((item) => item.path === wanted) ?? null;
    if (!systemImage)
      throw new Error(
        `Google’s catalog has no API ${api} ${androidSystemImageTagLabel(tag)} ${this.imageAbi} system image.`,
      );
    this.imageApi = api;
    const imageDir = path.join(sdkRoot, 'system-images', `android-${api}`, tag, this.imageAbi);
    const preferredPresent = fileExists(path.join(imageDir, 'system.img'));
    const jobs: InstallJob[] = [
      {
        id: 'platform-tools',
        label: 'platform-tools',
        url: androidPlatformToolsUrl(hostOs),
        sha1: '',
        extractTo: sdkRoot,
        skip: fileExists(path.join(sdkRoot, androidAdbRelativePath(process.platform))),
      },
      {
        id: 'emulator',
        label: 'emulator',
        url: androidRepoFileUrl(ANDROID_REPO_BASE_URL, emulator.url),
        sha1: emulator.sha1,
        extractTo: sdkRoot,
        skip: fileExists(path.join(sdkRoot, androidEmulatorRelativePath(process.platform))),
      },
      {
        id: 'system-image',
        label: `${androidSystemImageTagLabel(tag)} image API ${this.imageApi}`,
        url: androidRepoFileUrl(androidSystemImageBaseUrl(tag), systemImage.url),
        sha1: systemImage.sha1,
        extractTo: imageDir,
        skip: preferredPresent,
      },
    ];
    const pending = jobs.filter((job) => !job.skip);
    let completed = 0;
    for (const job of pending) {
      await this.installZip(job, completed, pending.length);
      completed += 1;
    }
  }

  private async installZip(job: InstallJob, completed: number, total: number): Promise<void> {
    const cache = path.join(app.getPath('userData'), 'android-cache');
    await mkdir(cache, { recursive: true });
    const zipPath = path.join(cache, `${job.id}.zip`);
    const base = total === 0 ? 10 : 10 + Math.round((completed / total) * 70);
    this.emit({ phase: 'download', percent: base, message: `Downloading ${job.label}…` });
    await downloadFile(job.url, zipPath, (ratio) => {
      const slice = total === 0 ? 0 : Math.round((ratio * 70) / total);
      this.emit({
        phase: 'download',
        percent: Math.min(85, base + slice),
        message: `Downloading ${job.label}…`,
      });
    });
    if (job.sha1)
      await assertSha1(zipPath, job.sha1);
    this.emit({ phase: 'extract', percent: Math.min(90, base + 8), message: `Extracting ${job.label}…` });
    await mkdir(job.extractTo, { recursive: true });
    const staging = await mkdtemp(path.join(cache, `${job.id}-`));
    try {
      await extractZip(zipPath, staging);
      await mergeExtracted(staging, job.extractTo, job.id);
    } finally {
      await rm(staging, { recursive: true, force: true });
      await rm(zipPath, { force: true });
    }
  }

  private findSystemImage(
    sdkRoot: string,
    requiredTag?: AndroidSystemImageTag,
  ): { api: number; abi: AndroidAbi; dir: string; tag: AndroidSystemImageTag } | null {
    const root = path.join(sdkRoot, 'system-images');
    if (!fileExists(root))
      return null;
    const tag = requiredTag ?? this.preferredImageTag();
    const api = this.preferredApi();
    const abi = this.preferredAbi();
    const dir = path.join(root, `android-${api}`, tag, abi);
    if (!fileExists(path.join(dir, 'system.img')))
      return null;
    this.imageApi = api;
    this.imageAbi = abi;
    return { api, abi, dir, tag };
  }

  private async ensureAvd(
    sdkRoot: string,
    avdHome: string,
    displayName = ANDROID_AVD_NAME,
    profileId = 'pixel_6',
  ): Promise<void> {
    this.emit({ phase: 'avd', percent: 92, message: 'Creating the Testrix AVD…' });
    const preferred = this.preferredImageTag();
    const image = this.findSystemImage(sdkRoot, preferred) ?? this.findSystemImage(sdkRoot);
    if (!image)
      throw new Error('System image is missing after install.');
    const profile = findEmulatorDeviceProfile(profileId) ?? findEmulatorDeviceProfile('pixel_6');
    const avdDir = path.join(avdHome, `${ANDROID_AVD_NAME}.avd`);
    await mkdir(avdDir, { recursive: true });
    const playStore = image.tag === 'google_apis_playstore';
    const sysDir = `system-images/android-${image.api}/${image.tag}/${image.abi}/`;
    const ini = [
      'avd.ini.encoding=UTF-8',
      `path=${avdDir.replace(/\\/g, '/')}`,
      `path.rel=${ANDROID_AVD_NAME}.avd`,
      `target=android-${image.api}`,
      '',
    ].join('\n');
    const config = [
      `AvdId=${ANDROID_AVD_NAME}`,
      `PlayStore.enabled=${playStore ? 'true' : 'false'}`,
      `abi.type=${image.abi}`,
      `avd.ini.displayname=${displayName.replace(/[\r\n=]/g, ' ').trim() || ANDROID_AVD_NAME}`,
      'avd.ini.encoding=UTF-8',
      'disk.dataPartition.size=6442450944',
      'hw.accelerometer=yes',
      'hw.audioInput=yes',
      'hw.battery=yes',
      'hw.camera.back=virtualscene',
      'hw.camera.front=emulated',
      `hw.cpu.arch=${image.abi === 'arm64-v8a' ? 'arm64' : 'x86_64'}`,
      'hw.cpu.ncore=4',
      'hw.dPad=no',
      `hw.device.manufacturer=${profile?.manufacturer ?? 'Google'}`,
      `hw.device.name=${profile?.id ?? 'pixel_6'}`,
      'hw.gps=yes',
      'hw.gpu.enabled=yes',
      'hw.gpu.mode=auto',
      'hw.initialOrientation=portrait',
      'hw.keyboard=yes',
      'hw.lcd.density=420',
      'hw.lcd.height=2400',
      'hw.lcd.width=1080',
      'hw.mainKeys=no',
      'hw.ramSize=2048',
      'hw.sdCard=yes',
      'hw.sensors.orientation=yes',
      'hw.sensors.proximity=yes',
      'hw.trackBall=no',
      `image.sysdir.1=${sysDir}`,
      'showDeviceFrame=yes',
      `tag.display=${playStore ? 'Google Play' : 'Google APIs'}`,
      `tag.id=${image.tag}`,
      'vm.heapSize=256',
      '',
    ].join('\n');
    await writeFile(path.join(avdHome, `${ANDROID_AVD_NAME}.ini`), ini, 'utf8');
    await writeFile(path.join(avdDir, 'config.ini'), config, 'utf8');
  }
  private async probeHypervisor(sdkRoot: string): Promise<void> {
    this.emit({ phase: 'probe', percent: 96, message: 'Checking the hypervisor…' });
    const emulator = path.join(sdkRoot, androidEmulatorRelativePath(process.platform));
    const hint = androidHypervisorHint(process.platform);
    if (!fileExists(emulator)) {
      this.lastHypervisor = { state: 'unknown', detail: 'Emulator binary is not installed yet.', hint };
      return;
    }
    try {
      const { stdout, stderr } = await execFileAsync(emulator, ['-accel-check'], {
        timeout: 12_000,
        env: this.sdkEnv(sdkRoot, path.join(app.getPath('userData'), ANDROID_AVD_DIR_NAME)),
      });
      const parsed = parseEmulatorAccelCheck(`${stdout}\n${stderr}`);
      this.lastHypervisor = { ...parsed, hint: parsed.state === 'missing' ? hint : '' };
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Could not run emulator -accel-check.';
      this.lastHypervisor = { state: 'unknown', detail, hint };
    }
  }

  private async releaseSdkLocks(sdkRoot: string): Promise<void> {
    const adb = path.join(sdkRoot, androidAdbRelativePath(process.platform));
    if (fileExists(adb))
      await execFileAsync(adb, ['kill-server'], { timeout: 8_000 }).catch(() => undefined);
    if (process.platform === 'win32') {
      await execFileAsync('taskkill', ['/IM', 'adb.exe', '/F'], { timeout: 8_000 }).catch(() => undefined);
      await sleep(500);
    }
  }

  private async refreshDevices(sdkRoot: string): Promise<void> {
    const adb = path.join(sdkRoot, androidAdbRelativePath(process.platform));
    if (!fileExists(adb))
      return;
    try {
      const { stdout } = await execFileAsync(adb, ['devices', '-l'], { timeout: 8_000, env: this.adbEnv() });
      const devices = parseAdbDevices(stdout);
      this.lastDevices = devices;
      if (devices.some((item) => item.state === 'device'))
        this.adbPathInUse = adb;
    } catch {
      // Keep the previous device list when this adb binary cannot be queried.
    }
  }

  /**
   * The emulator window can be up while this app's adb server has an empty device list.
   * Restart that server once so the running emulator registers again.
   */
  private async reconnectVisibleEmulator(liveSdk: string | null): Promise<void> {
    if (this.hasOnlineAdbDevice() || this.adbServerReset)
      return;
    const visible = Boolean(liveSdk) || Boolean(await findEmulatorClientBounds());
    if (!visible)
      return;
    const adb =
      (liveSdk && fileExists(path.join(liveSdk, androidAdbRelativePath(process.platform)))
        ? path.join(liveSdk, androidAdbRelativePath(process.platform))
        : null) || this.adbBinary();
    if (!adb)
      return;
    this.adbServerReset = true;
    await execFileAsync(adb, ['kill-server'], { timeout: 8_000 }).catch(() => undefined);
    await execFileAsync(adb, ['start-server'], { timeout: 15_000 }).catch(() => undefined);
    await sleep(1_200);
    const root = liveSdk || path.dirname(path.dirname(adb));
    await this.refreshDevices(root);
    if (!this.hasOnlineAdbDevice())
      await this.refreshDevices(this.status().sdkRoot);
  }

  private async waitForDevice(sdkRoot: string, timeoutMs: number): Promise<void> {
    if (!this.adbBinary())
      throw new Error('adb is missing; Activate Android tools first.');
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      await this.listDevices();
      if (this.hasOnlineAdbDevice())
        return;
      // Keep probing the configured root so a freshly spawned AVD is noticed.
      await this.refreshDevices(sdkRoot);
      if (this.hasOnlineAdbDevice())
        return;
      await sleep(1_000);
    }
    throw new Error('The emulator did not come online over adb. Start Device again.');
  }

  /**
   * Waits until the Android system finished booting (not merely adb "device").
   * Without this, Launch / Tap race a black boot screen.
   */
  private async waitForBootReady(serial: string, timeoutMs: number): Promise<void> {
    const adbPath = this.adbBinary();
    if (!adbPath)
      throw new Error('adb is missing; Activate Android tools first.');
    const budget = Math.max(5_000, timeoutMs);
    const deadline = Date.now() + budget;
    this.emit({
      phase: 'start',
      percent: 85,
      message: 'Waiting for Android to finish booting…',
    });
    while (Date.now() < deadline) {
      try {
        const completed = (
          await execFileAsync(adbPath, ['-s', serial, 'shell', 'getprop', 'sys.boot_completed'], {
            timeout: 8_000,
            env: this.adbEnv(),
          })
        ).stdout
          .toString()
          .trim();
        if (completed === '1') {
          const anim = (
            await execFileAsync(adbPath, ['-s', serial, 'shell', 'getprop', 'init.svc.bootanim'], {
              timeout: 8_000,
              env: this.adbEnv(),
            }).catch(() => ({ stdout: 'stopped' }))
          ).stdout
            .toString()
            .trim()
            .toLowerCase();
          // Empty / stopped / unknown → treat as ready. "running" means still animating.
          if (anim !== 'running')
            return;
        }
      } catch {
        // Device may briefly reject shells while zygote starts.
      }
      await sleep(1_000);
    }
    throw new Error(
      `The emulator came online over adb but Android did not finish booting within ${budget}ms.`,
    );
  }
}

interface InstallJob {
  readonly id: string;
  readonly label: string;
  readonly url: string;
  readonly sha1: string;
  readonly extractTo: string;
  readonly skip: boolean;
}

function fileExists(filePath: string): boolean {
  return existsSync(filePath);
}

function devicesEqual(
  left: readonly { readonly id: string; readonly name: string; readonly avdName: string | null; readonly avdHome: string | null }[],
  right: readonly { readonly id: string; readonly name: string; readonly avdName: string | null; readonly avdHome: string | null }[],
): boolean {
  if (left.length !== right.length)
    return false;
  return left.every((item, index) => {
    const other = right[index];
    return (
      other &&
      item.id === other.id &&
      item.name === other.name &&
      item.avdName === other.avdName &&
      item.avdHome === other.avdHome
    );
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadText(url: string): Promise<string> {
  const buffer = await downloadBuffer(url);
  return buffer.toString('utf8');
}

async function downloadBuffer(url: string, redirects = 0): Promise<Buffer> {
  if (redirects > 5)
    throw new Error('Too many redirects while downloading Android tools.');
  return new Promise((resolve, reject) => {
    const client = url.startsWith('http://') ? http : https;
    const req = client.get(url, { headers: { 'User-Agent': 'Testrix/2.0' } }, (res) => {
      const status = res.statusCode ?? 0;
      const location = res.headers.location;
      if (status >= 300 && status < 400 && location) {
        res.resume();
        downloadBuffer(new URL(location, url).toString(), redirects + 1).then(resolve, reject);
        return;
      }
      if (status >= 400) {
        res.resume();
        reject(new Error(`Download failed (${status}) for ${url}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

async function downloadFile(
  url: string,
  dest: string,
  onProgress: (ratio: number) => void,
  redirects = 0,
): Promise<void> {
  if (redirects > 5)
    throw new Error('Too many redirects while downloading Android tools.');
  await mkdir(path.dirname(dest), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const client = url.startsWith('http://') ? http : https;
    const req = client.get(url, { headers: { 'User-Agent': 'Testrix/2.0' } }, (res) => {
      const status = res.statusCode ?? 0;
      const location = res.headers.location;
      if (status >= 300 && status < 400 && location) {
        res.resume();
        downloadFile(new URL(location, url).toString(), dest, onProgress, redirects + 1).then(resolve, reject);
        return;
      }
      if (status >= 400) {
        res.resume();
        reject(new Error(`Download failed (${status}) for ${url}`));
        return;
      }
      const total = Number(res.headers['content-length'] ?? 0);
      let received = 0;
      const file = createWriteStream(dest);
      res.on('data', (chunk) => {
        received += chunk.length;
        if (total > 0)
          onProgress(received / total);
      });
      pipeline(res, file).then(resolve, reject);
    });
    req.on('error', reject);
  });
}

async function assertSha1(filePath: string, expected: string): Promise<void> {
  const hash = createHash('sha1');
  const stream = createReadStream(filePath);
  for await (const chunk of stream)
    hash.update(chunk);
  const actual = hash.digest('hex');
  if (actual.toLowerCase() !== expected.toLowerCase())
    throw new Error(`Checksum mismatch for ${path.basename(filePath)}.`);
}

async function extractZip(zipPath: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  try {
    await execFileAsync('tar', ['-xf', zipPath, '-C', dest]);
  } catch {
    if (process.platform === 'win32') {
      await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-Command',
        `Expand-Archive -LiteralPath ${JSON.stringify(zipPath)} -DestinationPath ${JSON.stringify(dest)} -Force`,
      ]);
      return;
    }
    await execFileAsync('unzip', ['-o', zipPath, '-d', dest]);
  }
}

async function mergeExtracted(staging: string, dest: string, jobId: string): Promise<void> {
  const entries = await readdir(staging, { withFileTypes: true });
  const only = entries.length === 1 ? entries[0] : null;
  if (jobId === 'system-image') {
    const source = await findSystemImageRoot(staging);
    await copyTree(source, dest);
    return;
  }
  if (only?.isDirectory() && (only.name === 'platform-tools' || only.name === 'emulator')) {
    await copyTree(path.join(staging, only.name), path.join(dest, only.name));
    return;
  }
  await copyTree(staging, dest);
}

async function findSystemImageRoot(dir: string): Promise<string> {
  if (fileExists(path.join(dir, 'system.img')))
    return dir;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory())
      continue;
    const nested = await findSystemImageRoot(path.join(dir, entry.name));
    if (fileExists(path.join(nested, 'system.img')))
      return nested;
  }
  throw new Error('Extracted system image is missing system.img.');
}

async function copyTree(from: string, to: string): Promise<void> {
  await mkdir(to, { recursive: true });
  const entries = await readdir(from, { withFileTypes: true });
  for (const entry of entries) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      await copyTree(source, target);
      continue;
    }
    await copyFileReplace(source, target);
  }
}

function isBusyFileError(error: unknown): boolean {
  if (!error || typeof error !== 'object')
    return false;
  const code = (error as { code?: string }).code;
  return code === 'EPERM' || code === 'EACCES' || code === 'EBUSY';
}

async function rmLocked(target: string, attempts = 8): Promise<void> {
  let last: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      await rm(target, { recursive: true, force: true });
      return;
    } catch (error) {
      last = error;
      if (!isBusyFileError(error) && i === 0)
        throw error;
      if (process.platform === 'win32')
        await execFileAsync('taskkill', ['/IM', 'adb.exe', '/F'], { timeout: 8_000 }).catch(() => undefined);
      await sleep(400 * (i + 1));
    }
  }
  const detail = last instanceof Error ? last.message : 'The SDK folder is still locked.';
  throw new Error(
    `${detail} Stop adb.exe if it is running, then try Remove again.`,
  );
}

async function copyFileReplace(source: string, target: string): Promise<void> {
  try {
    await copyFile(source, target);
    return;
  } catch (error) {
    if (!isBusyFileError(error))
      throw error;
  }
  if (process.platform === 'win32')
    await execFileAsync('taskkill', ['/IM', 'adb.exe', '/F'], { timeout: 8_000 }).catch(() => undefined);
  await sleep(500);
  await rm(target, { force: true }).catch(() => undefined);
  try {
    await copyFile(source, target);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Could not replace an SDK file.';
    throw new Error(`${detail} Stop adb.exe if it is running, then try Activate or Remove again.`);
  }
}

async function killProcessTree(pid: number): Promise<void> {
  if (process.platform === 'win32') {
    await execFileAsync('taskkill', ['/pid', String(pid), '/t', '/f']).catch(() => undefined);
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
}
