import type { BrowserWindow } from 'electron';

import type { SessionFile } from '../../../shared/config';
import { ErrorCodes, TestrixError } from '../../../shared/errors';

import type { ConfigFileService } from '../../services/config/config-file.service';

const DEBOUNCE_MS = 400;

const MIN_WIDTH = 800;

const MIN_HEIGHT = 600;

export function attachWindowSessionSync(win: BrowserWindow, files: ConfigFileService): void {
  let t: ReturnType<typeof setTimeout> | undefined;

  const schedule = (): void => {
    if (t) {
      clearTimeout(t);
    }
    t = setTimeout(() => {
      void flushBounds(win, files);
    }, DEBOUNCE_MS);
  };

  win.on('resize', schedule);
  win.on('move', schedule);
  win.on('maximize', schedule);
  win.on('unmaximize', schedule);

  win.on('close', () => {
    if (t) {
      clearTimeout(t);
    }
    void flushBounds(win, files);
  });
}

async function flushBounds(win: BrowserWindow, files: ConfigFileService): Promise<void> {
  if (win.isDestroyed()) {
    return;
  }
  try {
    const [width, height] = win.getSize();
    const [x, y] = win.getPosition();
    const patch: SessionFile['window'] = {
      width: Math.max(MIN_WIDTH, width),
      height: Math.max(MIN_HEIGHT, height),
      x,
      y,
      maximized: win.isMaximized(),
    };
    await files.mergeWindowIntoSession(patch);
  } catch (err: unknown) {
    console.warn('[window-session-sync]', new TestrixError(ErrorCodes.CONFIG_WRITE_FAILED, 'Window layout save failed', { cause: err }));
  }
}
