import type { BrowserWindowConstructorOptions } from 'electron';

/** Transparent frameless splash; `show: true` so the window appears as soon as Electron is ready. */

export const splashWindowDefaults: BrowserWindowConstructorOptions = {
  width: 560,
  height: 480,
  frame: false,
  show: true,
  transparent: true,
  alwaysOnTop: true,
  skipTaskbar: true,
  movable: false,
  minimizable: false,
  maximizable: false,
  fullscreenable: false,
  resizable: false,
  hasShadow: false,
  backgroundColor: '#00000000',
};
