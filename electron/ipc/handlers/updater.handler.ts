import type { UpdateChannel } from '../../../shared/updater/updater-status.schema';
import { DEFAULT_DEV_SIM_VERSION } from '../../../shared/updater/dev-update-sim';
import { app as electronApp } from 'electron';

import { isDevMode } from '../../config/environment';
import { getUpdaterService } from '../../services/updater/updater.service';
import { UpdaterChannels } from '../channels/updater.channels';
import { wrapInvokeHandler } from '../wrap-ipc-handler';
import type { IpcMainBinder } from '../register-ipc';

export function registerUpdaterHandlers(ipc: IpcMainBinder): void {
  const updater = getUpdaterService();

  ipc.handle(
    UpdaterChannels.getStatus,
    wrapInvokeHandler(UpdaterChannels.getStatus, async () => updater.getStatus()),
  );

  ipc.handle(
    UpdaterChannels.check,
    wrapInvokeHandler(UpdaterChannels.check, async () => updater.checkForUpdates({ force: true })),
  );

  ipc.handle(
    UpdaterChannels.checkAsVersion,
    wrapInvokeHandler(UpdaterChannels.checkAsVersion, async (_event, version?: string) => {
      if (!isDevMode() || electronApp.isPackaged) {
        throw new Error('Simulated version checks are dev-only.');
      }
      return updater.checkForUpdatesAsVersion(
        typeof version === 'string' && version.trim() ? version : DEFAULT_DEV_SIM_VERSION,
      );
    }),
  );

  ipc.handle(
    UpdaterChannels.setDevSimulatedVersion,
    wrapInvokeHandler(UpdaterChannels.setDevSimulatedVersion, async (_event, version?: string) => {
      if (!isDevMode() || electronApp.isPackaged) {
        throw new Error('Simulated version is dev-only.');
      }
      return updater.setDevSimulatedVersion(
        typeof version === 'string' && version.trim() ? version : DEFAULT_DEV_SIM_VERSION,
      );
    }),
  );

  ipc.handle(
    UpdaterChannels.download,
    wrapInvokeHandler(UpdaterChannels.download, async () => updater.downloadUpdate()),
  );

  ipc.handle(
    UpdaterChannels.install,
    wrapInvokeHandler(UpdaterChannels.install, async () => {
      updater.quitAndInstall();
    }),
  );

  ipc.handle(
    UpdaterChannels.setChannel,
    wrapInvokeHandler(UpdaterChannels.setChannel, async (_event, channel: UpdateChannel) => {
      updater.setChannel(channel);
    }),
  );
}
