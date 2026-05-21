import type { IpcMainInvokeEvent } from 'electron';

import { storedCookieSchema } from '../../../shared/http/stored-cookie.schema';
import type { IpcMainBinder } from '../register-ipc';
import { wrapInvokeHandler } from '../wrap-ipc-handler';
import { CookieChannels } from '../channels/cookie.channels';
import { cookieJarStore } from '../../services/http/cookie-jar.service';

export function registerCookieHandlers(ipc: IpcMainBinder): void {
  ipc.handle(
    CookieChannels.getAll,
    wrapInvokeHandler(CookieChannels.getAll, async () => cookieJarStore.listAll()),
  );

  ipc.handle(
    CookieChannels.delete,
    wrapInvokeHandler(
      CookieChannels.delete,
      async (_event: IpcMainInvokeEvent, raw: unknown) => {
        const parsed = storedCookieSchema
          .pick({ domain: true, path: true, key: true })
          .safeParse(raw);
        if (!parsed.success) {
          return;
        }
        await cookieJarStore.deleteCookie(
          parsed.data.domain,
          parsed.data.path,
          parsed.data.key,
        );
      },
    ),
  );

  ipc.handle(
    CookieChannels.clearAll,
    wrapInvokeHandler(CookieChannels.clearAll, async () => {
      await cookieJarStore.clearAll();
    }),
  );
}
