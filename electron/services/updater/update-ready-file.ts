import * as fs from 'node:fs';
import * as path from 'node:path';

/** How long the running app waits for Setup to show its Updating window. */
export const UPDATE_READY_WAIT_MS = 45_000;

/**
 * Resolves once `filePath` exists (then deletes it), or `timeoutMs` elapses.
 *
 * @returns True when the installer signaled ready.
 */
export async function waitForUpdateReadyFile(
  filePath: string,
  timeoutMs: number = UPDATE_READY_WAIT_MS,
): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // Installer may still hold the file; treat presence as ready.
      }
      return true;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
  }
  return false;
}

/** Writes the handshake file so the running app can exit. */
export function writeUpdateReadyFile(filePath: string): void {
  const trimmed = String(filePath || '').trim();
  if (!trimmed) {
    return;
  }
  fs.mkdirSync(path.dirname(trimmed), { recursive: true });
  fs.writeFileSync(trimmed, 'ready', 'utf8');
}
