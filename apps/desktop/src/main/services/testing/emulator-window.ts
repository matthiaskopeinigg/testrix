import { spawn, type ChildProcess, execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface EmulatorWindowBounds {
  /** Screen coordinates of the emulator client area (physical pixels). */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly title: string;
  /** Native window handle (Windows). Used to pin the pick overlay. */
  readonly hwnd?: number;
}

export interface EmulatorBoundsWatch {
  readonly stop: () => void;
}

/**
 * Locates the visible Android Emulator / Testrix-styled emulator window
 * and returns its client area in screen coordinates.
 */
export async function findEmulatorClientBounds(): Promise<EmulatorWindowBounds | null> {
  if (process.platform === 'win32')
    return findWindowsEmulatorBounds();
  if (process.platform === 'darwin')
    return findMacEmulatorBounds();
  return findLinuxEmulatorBounds();
}

/**
 * Streams live client bounds so an overlay can stay pinned while the
 * emulator is moved or resized. Windows polls a cached HWND (~60 Hz).
 * Other platforms re-query on a short interval.
 */
export function watchEmulatorClientBounds(
  onBounds: (bounds: EmulatorWindowBounds | null) => void,
): EmulatorBoundsWatch {
  if (process.platform === 'win32')
    return watchWindowsEmulatorBounds(onBounds);
  return watchPollingEmulatorBounds(onBounds, process.platform === 'darwin' ? 80 : 100);
}

/**
 * SDK root of a running emulator process (`…/Sdk`), from its executable path.
 * Null when no emulator process is running.
 */
export async function findRunningEmulatorSdkRoot(): Promise<string | null> {
  if (process.platform !== 'win32')
    return null;
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "Get-CimInstance Win32_Process | Where-Object { $_.Name -like 'qemu-system*' -or $_.Name -eq 'emulator.exe' } | ForEach-Object { $_.ExecutablePath }",
      ],
      { timeout: 8_000, windowsHide: true },
    );
    for (const line of String(stdout).split(/\r?\n/)) {
      const exe = line.trim();
      if (!exe)
        continue;
      const norm = exe.replace(/\//g, '\\');
      const marker = '\\emulator\\';
      const index = norm.toLowerCase().lastIndexOf(marker);
      if (index > 0)
        return norm.slice(0, index);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Maps a device framebuffer into the emulator client area (toolbar-aware).
 * Returns a rect in the same coordinate space as the client bounds.
 */
export function mapDeviceDisplayRect(
  client: Pick<EmulatorWindowBounds, 'x' | 'y' | 'width' | 'height'>,
  deviceWidth: number,
  deviceHeight: number,
): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  const dw = Math.max(1, deviceWidth);
  const dh = Math.max(1, deviceHeight);
  const deviceAspect = dw / dh;
  let drawH = client.height;
  let drawW = drawH * deviceAspect;
  if (drawW <= client.width) {
    const leftover = client.width - drawW;
    // Official emulator keeps a narrow tool strip on the right.
    const x = leftover > 20 && leftover < 140 ? 0 : leftover / 2;
    return {
      x: Math.round(client.x + x),
      y: Math.round(client.y + (client.height - drawH) / 2),
      width: Math.round(drawW),
      height: Math.round(drawH),
    };
  }
  const scale = Math.min(client.width / dw, client.height / dh);
  drawW = dw * scale;
  drawH = dh * scale;
  return {
    x: Math.round(client.x + (client.width - drawW) / 2),
    y: Math.round(client.y + (client.height - drawH) / 2),
    width: Math.round(drawW),
    height: Math.round(drawH),
  };
}

/**
 * Largest visible window owned by qemu / emulator.
 * Pipe-delimited: ok|x|y|w|h|hwnd|title
 */
const WINDOWS_BOUNDS_SCRIPT = `
$ids = @(Get-Process | Where-Object { $_.ProcessName -like 'qemu*' -or $_.ProcessName -eq 'emulator' } | ForEach-Object { [int]$_.Id })
if ($ids.Count -eq 0) { $ids = @(0) }
Add-Type @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class EmulatorBounds3 {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  public static string Find(int[] pids) {
    var set = new HashSet<uint>();
    foreach (var id in pids) set.Add((uint)id);
    int bestArea = 0, bx = 0, by = 0, bw = 0, bh = 0;
    long bestHwnd = 0;
    string title = "";
    bool found = false;
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      uint pid;
      GetWindowThreadProcessId(h, out pid);
      var sb = new StringBuilder(256);
      GetWindowText(h, sb, 256);
      var titleNow = sb.ToString();
      var classSb = new StringBuilder(256);
      GetClassName(h, classSb, 256);
      var classNow = classSb.ToString();
      var titleHit = titleNow.IndexOf("Android Emulator", StringComparison.OrdinalIgnoreCase) >= 0;
      var restyled = titleNow.Equals("Testrix", StringComparison.OrdinalIgnoreCase)
        && classNow.IndexOf("Qt", StringComparison.OrdinalIgnoreCase) >= 0;
      if (!set.Contains(pid) && !titleHit && !restyled) return true;
      RECT rc;
      if (!GetClientRect(h, out rc)) return true;
      int w = rc.R - rc.L;
      int hgt = rc.B - rc.T;
      if (w < 200 || hgt < 320) return true;
      int area = w * hgt;
      if (area <= bestArea) return true;
      POINT pt = new POINT();
      ClientToScreen(h, ref pt);
      found = true;
      bestArea = area;
      bx = pt.X; by = pt.Y; bw = w; bh = hgt;
      bestHwnd = h.ToInt64();
      title = titleNow;
      return true;
    }, IntPtr.Zero);
    if (!found) return "missing";
    return "ok|" + bx + "|" + by + "|" + bw + "|" + bh + "|" + bestHwnd + "|" + title.Replace("|", " ");
  }
}
"@
[EmulatorBounds3]::Find([int[]]$ids)
`;

const WINDOWS_TRACK_SCRIPT_TEMPLATE = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class EmulatorTrack1 {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
  public static string Sample(long hwndValue) {
    var h = new IntPtr(hwndValue);
    if (!IsWindow(h)) return "gone";
    if (!IsWindowVisible(h)) return "hidden";
    RECT rc;
    if (!GetClientRect(h, out rc)) return "gone";
    int w = rc.R - rc.L;
    int hgt = rc.B - rc.T;
    if (w < 40 || hgt < 40) return "hidden";
    POINT pt = new POINT();
    ClientToScreen(h, ref pt);
    return "ok|" + pt.X + "|" + pt.Y + "|" + w + "|" + hgt + "|" + hwndValue + "|";
  }
}
"@
$HwndValue = __HWND__
$last = ""
while ($true) {
  $line = [EmulatorTrack1]::Sample($HwndValue)
  if ($line -ne $last) {
    $last = $line
    [Console]::Out.WriteLine($line)
    [Console]::Out.Flush()
  }
  if ($line -eq "gone") { break }
  Start-Sleep -Milliseconds 16
}
`;

async function findWindowsEmulatorBounds(): Promise<EmulatorWindowBounds | null> {
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_BOUNDS_SCRIPT],
      { timeout: 6_000, windowsHide: true },
    );
    return parsePipeBounds(String(stdout));
  } catch {
    return null;
  }
}

function watchWindowsEmulatorBounds(
  onBounds: (bounds: EmulatorWindowBounds | null) => void,
): EmulatorBoundsWatch {
  let child: ChildProcess | null = null;
  let stopped = false;
  let buffer = '';
  let fallback: EmulatorBoundsWatch | null = null;

  const stopAll = (): void => {
    stopped = true;
    fallback?.stop();
    fallback = null;
    if (child && !child.killed) {
      child.kill();
      child = null;
    }
  };

  const attachTracker = (hwnd: number): void => {
    if (stopped)
      return;
    const script = WINDOWS_TRACK_SCRIPT_TEMPLATE.replace('__HWND__', String(Math.trunc(hwnd)));
    const tracker = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    child = tracker;
    tracker.stdout.setEncoding('utf8');
    tracker.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      let index = buffer.indexOf('\n');
      while (index >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf('\n');
        if (!line)
          continue;
        if (line === 'gone') {
          onBounds(null);
          return;
        }
        if (line === 'hidden')
          continue;
        const parsed = parsePipeBounds(line);
        if (parsed)
          onBounds(parsed);
      }
    });
    tracker.on('exit', () => {
      child = null;
    });
  };

  void (async () => {
    const first = await findWindowsEmulatorBounds();
    if (stopped)
      return;
    onBounds(first);
    if (first?.hwnd) {
      attachTracker(first.hwnd);
      return;
    }
    fallback = watchPollingEmulatorBounds((bounds) => {
      onBounds(bounds);
      if (!stopped && bounds?.hwnd && !child) {
        fallback?.stop();
        fallback = null;
        attachTracker(bounds.hwnd);
      }
    }, 120);
  })();

  return { stop: stopAll };
}

function watchPollingEmulatorBounds(
  onBounds: (bounds: EmulatorWindowBounds | null) => void,
  intervalMs: number,
): EmulatorBoundsWatch {
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let inFlight = false;

  const tick = async (): Promise<void> => {
    if (stopped || inFlight)
      return;
    inFlight = true;
    try {
      onBounds(await findEmulatorClientBounds());
    } finally {
      inFlight = false;
    }
  };

  void tick();
  timer = setInterval(() => {
    void tick();
  }, intervalMs);

  return {
    stop: () => {
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}

async function findMacEmulatorBounds(): Promise<EmulatorWindowBounds | null> {
  const script = `
tell application "System Events"
  set procs to (every process whose name contains "qemu" or name contains "emulator")
  repeat with proc in procs
    try
      set wins to windows of proc
      repeat with w in wins
        set t to name of w as text
        if t contains "Android Emulator" or t is "Testrix" or t contains "emulator" then
          set p to position of w
          set s to size of w
          return "ok|" & (item 1 of p) & "|" & (item 2 of p) & "|" & (item 1 of s) & "|" & (item 2 of s) & "|0|" & t
        end if
      end repeat
    end try
  end repeat
end tell
return "missing"
`;
  try {
    const { stdout } = await execFileAsync('osascript', ['-e', script], { timeout: 6_000 });
    return parsePipeBounds(String(stdout));
  } catch {
    return null;
  }
}

async function findLinuxEmulatorBounds(): Promise<EmulatorWindowBounds | null> {
  try {
    const { stdout: idsOut } = await execFileAsync(
      'xdotool',
      ['search', '--name', 'Android Emulator|Testrix'],
      { timeout: 4_000 },
    );
    const id = String(idsOut).trim().split(/\s+/)[0];
    if (!id)
      return null;
    const { stdout: geo } = await execFileAsync(
      'xdotool',
      ['getwindowgeometry', '--shell', id],
      { timeout: 4_000 },
    );
    const map = Object.fromEntries(
      String(geo)
        .split(/\r?\n/)
        .map((line) => line.split('='))
        .filter((parts) => parts.length === 2)
        .map(([k, v]) => [k, Number(v)]),
    );
    const x = map['X'];
    const y = map['Y'];
    const width = map['WIDTH'];
    const height = map['HEIGHT'];
    if (![x, y, width, height].every((n) => Number.isFinite(n)) || width < 80 || height < 80)
      return null;
    return { x, y, width, height, title: 'Android Emulator', hwnd: Number(id) || undefined };
  } catch {
    return null;
  }
}

function parsePipeBounds(raw: string): EmulatorWindowBounds | null {
  const line = raw
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item.startsWith('ok|') || item === 'missing');
  if (!line || line === 'missing')
    return null;
  const parts = line.split('|');
  if (parts.length < 6 || parts[0] !== 'ok')
    return null;
  const x = Number(parts[1]);
  const y = Number(parts[2]);
  const width = Number(parts[3]);
  const height = Number(parts[4]);
  if (![x, y, width, height].every((n) => Number.isFinite(n)) || width < 80 || height < 80)
    return null;
  const hwndRaw = parts[5];
  const hwnd = Number(hwndRaw);
  const hasHwnd = Number.isFinite(hwnd) && hwnd > 0 && /^-?\d+$/.test(hwndRaw);
  const title = (hasHwnd ? parts.slice(6) : parts.slice(5)).join('|') || 'Android Emulator';
  return {
    x,
    y,
    width,
    height,
    title,
    hwnd: hasHwnd ? hwnd : undefined,
  };
}
