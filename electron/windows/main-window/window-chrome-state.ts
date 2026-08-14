import type { BrowserWindow } from 'electron';

import { WindowChannels } from '../../ipc/channels/window.channels';

/** Window fills the display — square chrome, no outer corner radius. */
export interface WindowChromeState {
  readonly edgeToEdge: boolean;
}

export function readWindowChromeState(win: BrowserWindow): WindowChromeState {
  return {
    edgeToEdge: win.isMaximized() || win.isFullScreen(),
  };
}

export function attachWindowChromeState(win: BrowserWindow): void {
  const emit = (): void => {
    if (win.isDestroyed()) {
      return;
    }
    win.webContents.send(WindowChannels.chromeStateChanged, readWindowChromeState(win));
  };

  win.on('maximize', emit);
  win.on('unmaximize', emit);
  win.on('enter-full-screen', emit);
  win.on('leave-full-screen', emit);
  win.once('ready-to-show', emit);
  win.webContents.on('did-finish-load', emit);
}
