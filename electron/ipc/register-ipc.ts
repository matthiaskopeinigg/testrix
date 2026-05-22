import type { App, IpcMain } from 'electron';

import { registerAppMetaHandlers } from './handlers/app-meta.handler';
import { registerAppReadyHandlers } from './handlers/app-ready.handler';
import { registerConfigHandlers, type ConfigHandlerDeps } from './handlers/config.handler';
import { registerLoggingHandlers } from './handlers/logging.handler';
import { registerUpdaterHandlers } from './handlers/updater.handler';
import { registerShellHandlers } from './handlers/shell.handler';
import { registerHttpHandlers } from './handlers/http.handler';
import { registerCookieHandlers } from './handlers/cookie.handler';
import { registerWindowControlHandlers } from './handlers/window-control.handler';
import { registerTestingHandlers } from './handlers/testing.handler';
import { registerE2eIpcHandlers } from '../services/testing/e2e-bootstrap';
import type { AppReadyCoordinator } from '../boot/app-ready-coordinator';

export type IpcMainBinder = Pick<IpcMain, 'handle' | 'removeHandler' | 'on'>;
export function registerAllIpcHandlers(
  ipc: IpcMainBinder,
  appRef: App,
  coordinator: AppReadyCoordinator,
  configDeps: ConfigHandlerDeps,
): void {
  registerAppMetaHandlers(ipc, appRef);
  registerAppReadyHandlers(ipc, coordinator);
  registerConfigHandlers(ipc, configDeps);
  registerLoggingHandlers(ipc, { getPath: appRef.getPath.bind(appRef) });
  registerUpdaterHandlers(ipc);
  registerShellHandlers(ipc);
  registerHttpHandlers(ipc);
  registerCookieHandlers(ipc);
  registerWindowControlHandlers(ipc);
  registerE2eIpcHandlers();
  registerTestingHandlers(ipc, { files: configDeps.files });
}

