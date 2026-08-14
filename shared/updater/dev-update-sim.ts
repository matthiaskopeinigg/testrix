/** Default semver used when dev toolkit simulates an older installed version. */
export const DEFAULT_DEV_SIM_VERSION = '0.0.1';

/** Presets for dev toolkit version simulation. */
export const DEV_VERSION_SIM_PRESETS = [
  '0.0.1',
  '0.9.0-beta.1',
  '0.9.0-beta.3',
  '0.9.0-beta.4',
] as const;

/** @deprecated Use {@link DEFAULT_DEV_SIM_VERSION}. */
export const DEV_UPDATE_SIM_VERSION = DEFAULT_DEV_SIM_VERSION;
