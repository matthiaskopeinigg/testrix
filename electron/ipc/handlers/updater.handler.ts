import type { UpdateChannel } from '../../../shared/updater/updater-status.schema';
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
    wrapInvokeHandler(UpdaterChannels.check, async () => updater.checkForUpdates()),
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
