import type { BrowserWindowConstructorOptions } from 'electron';

/** Frameless, fixed-size error dialog — content is authored to fit without scrolling. */
export const errorWindowDefaults: BrowserWindowConstructorOptions = {
  width: 480,
  height: 400,
  frame: false,
  transparent: true,
  resizable: false,
  maximizable: false,
  minimizable: true,
  fullscreenable: false,
  show: false,
  hasShadow: true,
  backgroundColor: '#00000000',
};
