import type { BrowserWindowConstructorOptions } from 'electron';

/** Size/visibility only — chrome (`frame`, `transparent`, …) is applied in {@link createMainWindow}. */
export const mainWindowDefaults: BrowserWindowConstructorOptions = {
  width: 1280,
  height: 800,
  minWidth: 800,
  minHeight: 600,
  show: false,
  focusable: true,
};
