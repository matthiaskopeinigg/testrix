export { attachDefaultCsp, type CspOptions } from './csp';
export { AppReadyCoordinator, type AppReadyCoordinatorOptions } from './app-ready-coordinator';
export {
  isDevMode,
  resolveDevServerOrigin,
  shouldShowSplashBoot,
  usesAngularDevServer,
} from './environment';
export { AppLogger, appLogger, logError, type AppLogLevel, type AppLoggerOptions } from './logger';
export { AppError, type TestrixError } from './testrix-error';
export {
  errorWindowDefaults,
  mainWindowDefaults,
  sandboxedWebPreferences,
  setupWindowDefaults,
  splashWindowDefaults,
} from './window-options';
export { bundledDir, bundledPath } from './paths';
export { resolveWindowIcon, windowIconOption } from './window-icon';
