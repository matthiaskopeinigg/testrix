import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { parseAdbDevices, type AndroidDeviceInfo } from '@testrix/contracts';

import { DeviceHierarchyCache } from './device-hierarchy-cache';

const execFileAsync = promisify(execFile);

const KEY_CODES: Record<string, number> = {
  BACK: 4,
  HOME: 3,
  ENTER: 66,
  DEL: 67,
  DELETE: 67,
  TAB: 61,
  ESCAPE: 111,
  ESC: 111,
  MENU: 82,
  APP_SWITCH: 187,
  VOLUME_UP: 24,
  VOLUME_DOWN: 25,
  POWER: 26,
};

export interface DumpHierarchyOptions {
  /** Bypass the short-lived dump cache. */
  readonly force?: boolean;
  /** Dump attempts before giving up (default 4). Use 1 while polling wait-for. */
  readonly retries?: number;
}

export class AdbClient {
  private readonly hierarchyCache = new DeviceHierarchyCache(400);

  constructor(private readonly adbPath: string) {}

  async devices(): Promise<readonly AndroidDeviceInfo[]> {
    const { stdout } = await this.run(['devices', '-l']);
    return parseAdbDevices(stdout);
  }

  async install(serial: string, apkPath: string, grantPermissions: boolean): Promise<void> {
    const args = ['-s', serial, 'install', '-r'];
    if (grantPermissions)
      args.push('-g');
    args.push(apkPath);
    const { stdout, stderr } = await this.run(args, 180_000);
    const text = `${stdout}\n${stderr}`;
    this.invalidateHierarchy(serial);
    if (/Failure|error:/i.test(text) && !/Success/i.test(text))
      throw new Error(text.trim() || 'adb install failed');
  }

  async launch(
    serial: string,
    packageName: string,
    activity: string,
    options: { clearSession?: boolean; clearData?: boolean } = {},
  ): Promise<void> {
    const clearData = options.clearData === true;
    const clearSession = options.clearSession === true;
    const installed = await this.isPackageInstalled(serial, packageName);
    if (!installed)
      throw new Error(
        `Package "${packageName}" is not installed on the device. Install an APK first, or check the package id (adb shell pm list packages).`,
      );
    if (clearData) {
      const cleared = await this.shell(serial, `pm clear ${shellQuote(packageName)}`);
      if (/Failed|Error|Exception/i.test(cleared))
        throw new Error(`Could not clear data for "${packageName}": ${cleared.trim() || 'pm clear failed'}`);
    } else if (clearSession) {
      // Ends the running process without wiping stored prefs / login state.
      await this.shell(serial, `am force-stop ${shellQuote(packageName)}`);
    }
    if (activity.trim()) {
      const started = await this.shell(serial, `am start -n ${shellQuote(`${packageName}/${activity.trim()}`)}`);
      if (/Error|Exception|Activity class .* does not exist/i.test(started))
        throw new Error(started.trim() || `Could not start ${packageName}/${activity.trim()}`);
      this.invalidateHierarchy(serial);
      return;
    }
    const launched = await this.shell(
      serial,
      `monkey -p ${shellQuote(packageName)} -c android.intent.category.LAUNCHER 1`,
    );
    if (/No activities|Error|Exception|aborted/i.test(launched) && !/Events injected/i.test(launched))
      throw new Error(
        launched.trim() ||
          `Could not launch "${packageName}". The package may have no launcher activity.`,
      );
    this.invalidateHierarchy(serial);
  }

  async isPackageInstalled(serial: string, packageName: string): Promise<boolean> {
    const out = await this.shell(serial, `pm path ${shellQuote(packageName)}`);
    return /package:/i.test(out);
  }

  async tap(serial: string, x: number, y: number): Promise<void> {
    await this.shell(serial, `input tap ${Math.round(x)} ${Math.round(y)}`);
    this.invalidateHierarchy(serial);
  }

  async type(serial: string, text: string): Promise<void> {
    const escaped = escapeAdbInput(text);
    if (!escaped)
      return;
    await this.shell(serial, `input text ${escaped}`);
    this.invalidateHierarchy(serial);
  }

  async press(serial: string, key: string): Promise<void> {
    const raw = key.trim();
    const code = KEY_CODES[raw.toUpperCase()] ?? (Number.isFinite(Number(raw)) ? Number(raw) : NaN);
    if (!Number.isFinite(code))
      throw new Error(`Unknown device key: ${key}`);
    await this.shell(serial, `input keyevent ${code}`);
    this.invalidateHierarchy(serial);
  }

  /**
   * Clears a focused text field with one ADB round-trip (move end + many DELs).
   */
  async clearFocusedField(serial: string, deleteCount = 24): Promise<void> {
    const dels = Array.from({ length: Math.max(1, Math.min(64, deleteCount)) }, () => '67').join(' ');
    await this.shell(serial, `input keyevent 123 ${dels}`);
    this.invalidateHierarchy(serial);
  }

  async swipe(
    serial: string,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    durationMs: number,
  ): Promise<void> {
    await this.shell(
      serial,
      `input swipe ${Math.round(x1)} ${Math.round(y1)} ${Math.round(x2)} ${Math.round(y2)} ${Math.max(50, Math.round(durationMs))}`,
    );
    this.invalidateHierarchy(serial);
  }

  async dumpHierarchy(serial: string, options: DumpHierarchyOptions = {}): Promise<string> {
    if (!options.force) {
      const cached = this.hierarchyCache.get(serial);
      if (cached)
        return cached;
    }

    const retries = Math.max(1, options.retries ?? 4);
    let lastDetail =
      'The device UI is not ready yet. If the Pixel Launcher (or an app) shows “isn’t responding”, tap Wait or Close app, then try again.';
    for (let attempt = 0; attempt < retries; attempt += 1) {
      const dumped = await this.readHierarchyDump(serial);
      if (dumped.xml) {
        this.hierarchyCache.set(serial, dumped.xml);
        return dumped.xml;
      }
      if (dumped.detail)
        lastDetail = dumped.detail;
      if (attempt + 1 < retries)
        await sleep(700);
    }
    throw new Error(lastDetail);
  }

  invalidateHierarchy(serial: string): void {
    this.hierarchyCache.invalidate(serial);
  }

  async screenshot(serial: string, timeoutMs = 20_000): Promise<Buffer> {
    const { stdout } = await execFileAsync(this.adbPath, ['-s', serial, 'exec-out', 'screencap', '-p'], {
      encoding: 'buffer',
      timeout: Math.max(1_000, timeoutMs),
      maxBuffer: 12 * 1024 * 1024,
    });
    return stdout;
  }

  /** Device framebuffer size from `wm size` (override preferred). */
  async wmSize(serial: string): Promise<{ readonly width: number; readonly height: number } | null> {
    const out = await this.shell(serial, 'wm size');
    const override = /Override size:\s*(\d+)x(\d+)/i.exec(out);
    const physical = /Physical size:\s*(\d+)x(\d+)/i.exec(out);
    const hit = override ?? physical;
    if (!hit)
      return null;
    const width = Number(hit[1]);
    const height = Number(hit[2]);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 2 || height < 2)
      return null;
    return { width, height };
  }

  async push(serial: string, localPath: string, remotePath: string): Promise<void> {
    await this.run(['-s', serial, 'push', localPath, remotePath], 60_000);
  }

  async shell(serial: string, command: string): Promise<string> {
    const { stdout } = await this.run(['-s', serial, 'shell', command]);
    return stdout;
  }

  private async readHierarchyDump(serial: string): Promise<{ xml: string | null; detail: string | null }> {
    try {
      const { stdout, stderr } = await this.run(
        ['-s', serial, 'exec-out', 'uiautomator', 'dump', '/dev/tty'],
        20_000,
      );
      const xml = extractHierarchyXml(`${stdout}\n${stderr}`);
      if (xml)
        return { xml, detail: null };
    } catch (error) {
      const xml = extractHierarchyXml(execOutput(error));
      if (xml)
        return { xml, detail: null };
      const detail = execDetail(error);
      if (detail && !/null root node/i.test(detail))
        return { xml: null, detail };
    }
    return { xml: null, detail: null };
  }

  private async run(
    args: readonly string[],
    timeoutMs = 15_000,
  ): Promise<{ stdout: string; stderr: string }> {
    return execFileAsync(this.adbPath, [...args], { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 });
  }
}

function extractHierarchyXml(text: string): string | null {
  const start = text.indexOf('<hierarchy');
  const end = text.indexOf('</hierarchy>');
  if (start < 0 || end < start)
    return null;
  return text.slice(start, end + '</hierarchy>'.length);
}

function execOutput(error: unknown): string {
  if (!error || typeof error !== 'object')
    return '';
  const row = error as { stdout?: unknown; stderr?: unknown };
  return `${typeof row.stdout === 'string' ? row.stdout : ''}\n${typeof row.stderr === 'string' ? row.stderr : ''}`;
}

function execDetail(error: unknown): string | null {
  const output = execOutput(error);
  const line = output
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item.startsWith('ERROR:') || item.startsWith('java.lang.') || /null root node/i.test(item));
  if (line)
    return line.replace(/^ERROR:\s*/, '');
  if (error instanceof Error && error.message && !error.message.startsWith('Command failed:'))
    return error.message;
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function escapeAdbInput(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/ /g, '%s')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/&/g, '\\&')
    .replace(/</g, '\\<')
    .replace(/>/g, '\\>')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\|/g, '\\|');
}
