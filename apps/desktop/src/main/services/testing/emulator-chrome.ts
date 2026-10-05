import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Renames the sidecar emulator window to Testrix and keeps a real caption so
 * the window can be moved and resized. On Windows, prefers a dark titlebar to
 * match the app chrome.
 */
const WINDOWS_SCRIPT = `
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class EmulatorChrome {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern bool SetWindowText(IntPtr h, string s);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr h, int n, int v);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr i, int x, int y, int cx, int cy, uint f);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("dwmapi.dll")] public static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);
  public static string Apply() {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      var sb = new StringBuilder(512);
      GetWindowText(h, sb, 512);
      var t = sb.ToString();
      if (t.IndexOf("Android Emulator", StringComparison.OrdinalIgnoreCase) >= 0 ||
          (t.IndexOf("emulator", StringComparison.OrdinalIgnoreCase) >= 0 &&
           t.IndexOf("testrix", StringComparison.OrdinalIgnoreCase) >= 0)) {
        found = h;
        return false;
      }
      return true;
    }, IntPtr.Zero);
    if (found == IntPtr.Zero) return "missing";
    SetWindowText(found, "Testrix");
    const int GWL_STYLE = -16;
    const int WS_CAPTION = 0x00C00000;
    const int WS_THICKFRAME = 0x00040000;
    const int WS_MINIMIZEBOX = 0x00020000;
    const int WS_MAXIMIZEBOX = 0x00010000;
    const int WS_SYSMENU = 0x00080000;
    int style = GetWindowLong(found, GWL_STYLE);
    style |= WS_CAPTION | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_SYSMENU;
    SetWindowLong(found, GWL_STYLE, style);
    // DWMWA_USE_IMMERSIVE_DARK_MODE = 20 (Win10 1903+ / Win11)
    int dark = 1;
    DwmSetWindowAttribute(found, 20, ref dark, sizeof(int));
    SetWindowPos(found, IntPtr.Zero, 0, 0, 0, 0, 0x0027);
    return "ok";
  }
}
"@
[EmulatorChrome]::Apply()
`;

/**
 * Applies Testrix chrome to the official emulator window after Start.
 * Keeps a system titlebar so the window stays movable.
 */
export async function restyleEmulatorChrome(): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execFileAsync(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_SCRIPT],
          { timeout: 8_000, windowsHide: true },
        );
        if (String(stdout).includes('ok'))
          return;
      } else if (process.platform === 'darwin') {
        await execFileAsync(
          'osascript',
          [
            '-e',
            'tell application "System Events" to repeat with proc in (every process whose name contains "qemu" or name contains "emulator")',
            '-e',
            'try',
            '-e',
            'set title of front window of proc to "Testrix"',
            '-e',
            'end try',
            '-e',
            'end repeat',
          ],
          { timeout: 6_000 },
        );
        return;
      } else {
        await execFileAsync(
          'xdotool',
          ['search', '--name', 'Android Emulator', 'set_window', '--name', 'Testrix'],
          { timeout: 4_000 },
        );
        return;
      }
    } catch {
      /* helpers are optional; Start must still succeed */
    }
    await sleep(800);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
