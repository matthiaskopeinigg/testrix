import { BrowserWindow } from 'electron';

import { WindowChannels } from '../channels/window.channels';
import type { IpcMainBinder } from '../register-ipc';
import { wrapInvokeHandler } from '../wrap-ipc-handler';

interface DragOffset {
  readonly x: number;
  readonly y: number;
}

const dragOffsetByWindow = new WeakMap<BrowserWindow, DragOffset>();

/** Win32 frameless windows: CSS `-webkit-app-region: drag` is unreliable; IPC move is used instead. */
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

  ipc.on(WindowChannels.dragStart, (event, offset: DragOffset) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed() || !win.isMovable()) {
      return;
    }
    if (win.isMaximized()) {
      win.unmaximize();
    }
    dragOffsetByWindow.set(win, offset);
  });

  ipc.on(WindowChannels.dragMove, (event, position: { readonly screenX: number; readonly screenY: number }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed() || !win.isMovable()) {
      return;
    }
    const offset = dragOffsetByWindow.get(win);
    if (!offset) {
      return;
    }
    win.setPosition(
      Math.round(position.screenX - offset.x),
      Math.round(position.screenY - offset.y),
    );
  });

  ipc.on(WindowChannels.dragEnd, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      dragOffsetByWindow.delete(win);
    }
  });
}
