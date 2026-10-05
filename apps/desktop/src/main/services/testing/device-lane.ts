import {
  deviceNodeCenter,
  findDeviceNode,
  findEmulatorDevice,
  flowConfigBoolean,
  flowConfigNumber,
  flowConfigString,
  interpolateFlow,
  isFlowDeviceKind,
  normalizeAndroidPackageInput,
  parseDeviceHierarchy,
  parseDeviceSelector,
  type EmulatorFile,
  type FlowArtifactFields,
  type FlowGraphNode,
} from '@testrix/contracts';

import { AdbClient } from './adb-client';
import type { AndroidToolchainHost } from './android-toolchain.service';
export interface DeviceLaneVars {
  readonly vars: Record<string, string>;
}

/**
 * Runs Android device flow nodes. A Start Device step boots the emulator (or
 * reuses it). Later device steps reuse that session. {@link release} stops the
 * emulator only when this lane spawned it for the run.
 */
export class DeviceLane {
  private sessionSerial: string | null = null;
  private managedEmulator = false;

  constructor(
    private readonly android: AndroidToolchainHost,
    private readonly emulator: () => EmulatorFile,
  ) {}

  /** Clears session state before a new flow run. Does not stop a running emulator. */
  beginRun(): void {
    this.sessionSerial = null;
    this.managedEmulator = false;
  }

  /** ADB serial from Start Device in the active run, if any. */
  activeSerial(): string | null {
    return this.sessionSerial;
  }

  /**
   * Forgets the managed session without stopping the emulator.
   * Used after Pick so the device stays up for authoring.
   */
  detach(): void {
    this.sessionSerial = null;
    this.managedEmulator = false;
  }

  /**
   * Stops the emulator when this lane spawned it for the run.
   * Safe to call more than once. Reused warm devices are left running.
   */
  async release(): Promise<void> {
    const shouldStop = this.managedEmulator;
    this.sessionSerial = null;
    this.managedEmulator = false;
    if (!shouldStop)
      return;
    await this.android.stopEmulator().catch(() => undefined);
  }

  /** Adb client for the active toolchain, or null when tools are missing. */
  adbClient(): AdbClient | null {
    const adbPath = this.android.adbBinary();
    return adbPath ? new AdbClient(adbPath) : null;
  }

  /**
   * Attaches to an already-online emulator without starting or stopping it.
   * Used by Pick so later device steps in a prefix can reuse the serial.
   */
  async attachRunningSession(signal: AbortSignal): Promise<string> {
    throwIfAborted(signal);
    this.managedEmulator = false;
    const serial = await this.waitForOnlineSerial(signal);
    this.sessionSerial = serial;
    return serial;
  }

  async run(
    node: FlowGraphNode,
    artifact: FlowArtifactFields,
    vars: DeviceLaneVars,
    signal: AbortSignal,
  ): Promise<void> {
    if (node.kind === 'device-install')
      throw new Error(
        'Install APK was removed from Flows. Install APKs from Services → Emulator, then Launch the package.',
      );
    if (!isFlowDeviceKind(node.kind))
      return;
    throwIfAborted(signal);
    const text = (key: string, fallback = '') =>
      interpolateFlow(flowConfigString(node, key, fallback), vars.vars).trim();

    if (node.kind === 'device-start') {
      await this.startDevice(
        text('deviceId'),
        flowConfigBoolean(node, 'openHome', false),
        flowConfigNumber(node, 'timeoutMs', 90_000),
        artifact.deviceShowEmulator !== false,
        signal,
      );
      return;
    }

    const serial = await this.requireSession();
    const adbPath = this.android.adbBinary();
    if (!adbPath)
      throw new Error('Install Android tools before running device nodes.');
    const adb = new AdbClient(adbPath);
    const timeoutMs = (fallback: number) => Math.max(250, flowConfigNumber(node, 'timeoutMs', fallback));

    switch (node.kind) {
      case 'device-launch': {
        const rawPackage = text('packageName');
        const packageName = normalizeAndroidPackageInput(rawPackage);
        if (!packageName)
          throw new Error(
            rawPackage.trim()
              ? `Launch app package "${rawPackage}" is not a valid package name or Play Store URL.`
              : 'Launch app needs a package name or Play Store URL.',
          );
        await withTimeout(
          adb.launch(serial, packageName, text('activity'), {
            clearSession: flowConfigBoolean(node, 'clearSession'),
            clearData: flowConfigBoolean(node, 'clearData'),
          }),
          timeoutMs(15_000),
          'Launch app',
        );
        // Wait until the package is in the foreground / hierarchy before the next step.
        await this.waitForPackageReady(adb, serial, packageName, timeoutMs(15_000), signal);
        return;
      }
      case 'device-tap': {
        const point = await this.findCenter(adb, serial, text('selector'), timeoutMs(8000), signal);
        await withTimeout(adb.tap(serial, point.x, point.y), timeoutMs(8000), 'Tap');
        return;
      }
      case 'device-type': {
        const selector = text('selector');
        if (selector) {
          const point = await this.findCenter(adb, serial, selector, timeoutMs(8000), signal);
          await withTimeout(adb.tap(serial, point.x, point.y), timeoutMs(8000), 'Type focus');
        }
        if (flowConfigBoolean(node, 'clearFirst', true))
          await withTimeout(adb.clearFocusedField(serial, 24), timeoutMs(8000), 'Clear field');
        await withTimeout(adb.type(serial, text('text')), timeoutMs(8000), 'Type');
        return;
      }
      case 'device-press':
        await withTimeout(
          adb.press(serial, text('key', 'BACK') || 'BACK'),
          timeoutMs(5000),
          'Press key',
        );
        return;
      case 'device-swipe':
        await withTimeout(
          adb.swipe(
            serial,
            flowConfigNumber(node, 'x1', 200),
            flowConfigNumber(node, 'y1', 800),
            flowConfigNumber(node, 'x2', 200),
            flowConfigNumber(node, 'y2', 200),
            flowConfigNumber(node, 'durationMs', 300),
          ),
          timeoutMs(5000),
          'Swipe',
        );
        return;
      case 'device-wait-for':
        await this.waitFor(adb, serial, text('selector'), timeoutMs(8000), signal);
        return;
      case 'device-screenshot': {
        const name = text('name') || 'device';
        const png = await adb.screenshot(serial, timeoutMs(15_000));
        vars.vars[`screenshot:${name}`] = `data:image/png;base64,${png.toString('base64')}`;
        return;
      }
      case 'device-assert-text': {
        const nodeHit = await this.waitFor(adb, serial, text('selector'), timeoutMs(8000), signal);
        const actual = nodeHit.text || nodeHit.contentDesc;
        const expected = text('expected');
        const match = text('match', 'contains') || 'contains';
        if (!textMatches(actual, expected, match))
          throw new Error(`Expected ${match} "${expected}", saw "${actual}"`);
        return;
      }
      case 'device-assert-visible':
        await this.waitFor(adb, serial, text('selector'), timeoutMs(8000), signal);
        return;
      default:
        return;
    }
  }

  private async startDevice(
    deviceId: string,
    openHome: boolean,
    timeoutMs: number,
    showEmulator: boolean,
    signal: AbortSignal,
  ): Promise<void> {
    throwIfAborted(signal);
    const file = this.emulator();
    const resolvedId = deviceId.trim() || file.selectedDeviceId?.trim() || '';
    if (!resolvedId)
      throw new Error('Start Device needs a device from the Emulator sidebar.');
    if (!findEmulatorDevice(file, resolvedId))
      throw new Error('Start Device points at a device that is no longer in the Emulator sidebar.');

    const started = await this.android.startEmulator({
      deviceId: resolvedId,
      openHome,
      showWindow: showEmulator,
    });
    if (!started.ok)
      throw new Error(started.error || 'Could not start the device.');

    // Only stop on release when this run spawned the AVD.
    this.managedEmulator = started.bootedFresh === true;

    throwIfAborted(signal);
    const serial = await this.waitForOnlineSerial(signal, timeoutMs);
    await this.waitForSessionBootReady(serial, timeoutMs, signal);
    this.sessionSerial = serial;
  }

  private requireSession(): string {
    if (this.sessionSerial)
      return this.sessionSerial;
    throw new Error(
      'Add a Start Device step before other device nodes so the emulator is ready for this run.',
    );
  }

  private async waitForOnlineSerial(signal: AbortSignal, timeoutMs = 90_000): Promise<string> {
    const preferred = this.emulator().selectedSerial?.trim() || '';
    const budget = Math.max(1_000, timeoutMs);
    const deadline = Date.now() + budget;
    while (Date.now() < deadline) {
      throwIfAborted(signal);
      const devices = await this.android.listDevices();
      const online = devices.filter((item) => item.state === 'device');
      const hit =
        (preferred && online.find((item) => item.serial === preferred)?.serial) ||
        online.find((item) => item.serial.startsWith('emulator-'))?.serial ||
        online[0]?.serial ||
        null;
      if (hit)
        return hit;
      await sleep(1_000);
    }
    throw new Error(`The emulator started but no adb device came online within ${budget}ms.`);
  }

  /** After adb is online, wait until the system finished booting before Launch / Tap. */
  private async waitForSessionBootReady(
    serial: string,
    timeoutMs: number,
    signal: AbortSignal,
  ): Promise<void> {
    const adbPath = this.android.adbBinary();
    if (!adbPath)
      return;
    const adb = new AdbClient(adbPath);
    const budget = Math.max(5_000, timeoutMs);
    const deadline = Date.now() + budget;
    while (Date.now() < deadline) {
      throwIfAborted(signal);
      try {
        const completed = (await adb.shell(serial, 'getprop sys.boot_completed')).trim();
        if (completed === '1') {
          const anim = (await adb.shell(serial, 'getprop init.svc.bootanim').catch(() => 'stopped'))
            .trim()
            .toLowerCase();
          if (anim !== 'running')
            return;
        }
      } catch {
        // Keep polling while zygote starts.
      }
      await sleep(1_000, signal);
    }
    throw new Error(
      `Start Device: Android did not finish booting within ${budget}ms (adb was online earlier).`,
    );
  }

  private async findNode(adb: AdbClient, serial: string, selector: string, force = false) {
    if (!selector)
      throw new Error('A device selector is required.');
    const xml = await adb.dumpHierarchy(serial, { force, retries: force ? 4 : 2 });
    const hit = findDeviceNode(parseDeviceHierarchy(xml), parseDeviceSelector(selector));
    if (!hit)
      throw new Error(`No device element matched "${selector}".`);
    return hit;
  }

  private async findCenter(
    adb: AdbClient,
    serial: string,
    selector: string,
    timeoutMs: number,
    signal: AbortSignal,
  ) {
    const hit = await this.waitFor(adb, serial, selector, timeoutMs, signal);
    const center = deviceNodeCenter(hit);
    if (!center)
      throw new Error(`Element "${selector}" has no bounds.`);
    return center;
  }

  private async waitFor(
    adb: AdbClient,
    serial: string,
    selector: string,
    timeoutMs: number,
    signal: AbortSignal,
  ) {
    if (!selector)
      throw new Error('A device selector is required.');
    const deadline = Date.now() + Math.max(250, timeoutMs);
    let last = 'No match yet.';
    let delayMs = 400;
    let attempt = 0;
    while (Date.now() < deadline) {
      throwIfAborted(signal);
      try {
        return await this.findNode(adb, serial, selector, attempt > 0);
      } catch (error) {
        last = error instanceof Error ? error.message : 'No match.';
      }
      attempt += 1;
      await sleep(delayMs, signal);
      delayMs = Math.min(800, delayMs + 200);
    }
    throw new Error(`${last} (timed out after ${Math.max(250, timeoutMs)}ms)`);
  }

  /**
   * After am start / monkey, wait until the package appears in the hierarchy or
   * dumpsys reports it focused — otherwise the next Tap races a blank splash.
   */
  private async waitForPackageReady(
    adb: AdbClient,
    serial: string,
    packageName: string,
    timeoutMs: number,
    signal: AbortSignal,
  ): Promise<void> {
    const budget = Math.max(1_000, timeoutMs);
    const deadline = Date.now() + budget;
    let delayMs = 300;
    while (Date.now() < deadline) {
      throwIfAborted(signal);
      try {
        const focused = await adb.shell(serial, 'dumpsys activity activities');
        if (focused.includes(packageName)) {
          // One dump so the hierarchy cache is warm for the next Tap.
          await adb.dumpHierarchy(serial, { force: true, retries: 2 }).catch(() => undefined);
          return;
        }
      } catch {
        // Keep polling.
      }
      await sleep(delayMs, signal);
      delayMs = Math.min(900, delayMs + 150);
    }
    // Soft: do not fail Launch if dumpsys is slow — Tap/Wait still have their own timeouts.
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  const budget = Math.max(250, timeoutMs);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${budget}ms`)), budget);
      }),
    ]);
  } finally {
    if (timer)
      clearTimeout(timer);
  }
}

function textMatches(actual: string, expected: string, match: string): boolean {
  if (match === 'equals')
    return actual === expected;
  if (match === 'regex') {
    try {
      return new RegExp(expected).test(actual);
    } catch {
      return false;
    }
  }
  return actual.toLowerCase().includes(expected.toLowerCase());
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted)
    throw new Error('cancelled');
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal)
    return new Promise((resolve) => setTimeout(resolve, ms));
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('cancelled'));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('cancelled'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
