import type { BrowserWindowConstructorOptions } from 'electron';

/** Transparent frameless splash; shown as soon as Electron is ready. */
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

/** Match --tx-titlebar-height / --tx-bg-chrome for frameless chrome. */
const TITLEBAR_BG = '#110e14';

export const mainWindowDefaults: BrowserWindowConstructorOptions = {
  width: 1280,
  height: 820,
  minWidth: 960,
  minHeight: 640,
  show: false,
  frame: false,
  titleBarStyle: 'hidden',
  trafficLightPosition: { x: 14, y: 12 },
  // Custom HTML min/max/close on all platforms so caption chrome matches the shell.
  backgroundColor: TITLEBAR_BG,
  autoHideMenuBar: true,
};

/** Frameless error card for boot and renderer failures. */
export const errorWindowDefaults: BrowserWindowConstructorOptions = {
  width: 500,
  height: 400,
  resizable: false,
  maximizable: false,
  fullscreenable: false,
  frame: false,
  show: false,
  backgroundColor: '#0a090c',
  autoHideMenuBar: true,
};

export const setupWindowDefaults: BrowserWindowConstructorOptions = {
  width: 540,
  height: 520,
  resizable: false,
  maximizable: false,
  fullscreenable: false,
  frame: false,
  show: true,
  backgroundColor: '#0a090c',
  autoHideMenuBar: true,
};

export const sandboxedWebPreferences = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  webviewTag: false,
  spellcheck: false,
} as const;
