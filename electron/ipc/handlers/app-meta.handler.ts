import type { App } from 'electron';

import { getAppVersions } from '../../services/app-info.service';
import { openExternalUrl } from '../../services/shell.service';
import { AppChannels } from '../channels/app.channels';
import { wrapInvokeHandler } from '../wrap-ipc-handler';
import type { IpcMainBinder } from '../register-ipc';

export function registerAppMetaHandlers(ipc: IpcMainBinder, appRef: App): void {
  ipc.handle(
    AppChannels.versions,
    wrapInvokeHandler(AppChannels.versions, async () => getAppVersions(appRef)),
  );

  ipc.handle(
    AppChannels.openExternal,
    wrapInvokeHandler(AppChannels.openExternal, async (_event, url: string) => {
      await openExternalUrl(url);
    }),
  );
}
