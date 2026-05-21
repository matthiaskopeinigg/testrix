import { BrowserWindow } from 'electron';

import { WindowChannels } from '../channels/window.channels';
import type { IpcMainBinder } from '../register-ipc';
import { wrapInvokeHandler } from '../wrap-ipc-handler';

export function registerWindowControlHandlers(ipc: IpcMainBinder): void {
  ipc.handle(
    WindowChannels.minimize,
    wrapInvokeHandler(WindowChannels.minimize, async (event): Promise<void> => {
      BrowserWindow.fromWebContents(event.sender)?.minimize();
    }),
  );

  ipc.handle(
    WindowChannels.maximizeToggle,
    wrapInvokeHandler(WindowChannels.maximizeToggle, async (event): Promise<void> => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || win.isDestroyed()) {
        return;
      }
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }),
  );

  ipc.handle(
    WindowChannels.close,
    wrapInvokeHandler(WindowChannels.close, async (event): Promise<void> => {
      BrowserWindow.fromWebContents(event.sender)?.close();
    }),
  );

  ipc.handle(
    WindowChannels.focus,
    wrapInvokeHandler(WindowChannels.focus, async (event): Promise<void> => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || win.isDestroyed()) {
        return;
      }
      win.setIgnoreMouseEvents(false);
      if (!win.isVisible()) {
        win.show();
      }
      win.moveTop();
      win.focus();
      win.webContents.focus();
    }),
  );
}
