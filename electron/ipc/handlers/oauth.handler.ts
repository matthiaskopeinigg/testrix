import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';

import { collectionFolderAuthSchema } from '../../../shared/config';
import { ErrorCodes, TestrixError } from '../../../shared/errors';

import { oauthTokenService } from '../../services/http/oauth-token.service';
import { wrapInvokeHandler } from '../wrap-ipc-handler';
import type { IpcMainBinder } from '../register-ipc';
import { OAuthChannels } from '../channels/oauth.channels';

export interface OAuthHandlerDeps {
  readonly getProfileDir: () => string;
  readonly getMainWindow: () => BrowserWindow | null;
}

export function registerOAuthHandlers(ipc: IpcMainBinder, deps: OAuthHandlerDeps): void {
  ipc.handle(
    OAuthChannels.ensureToken,
    wrapInvokeHandler(OAuthChannels.ensureToken, async (_event: IpcMainInvokeEvent, raw: unknown) => {
      const payload = raw as { ownerId?: unknown; auth?: unknown };
      if (typeof payload?.ownerId !== 'string' || !payload.ownerId.trim()) {
        throw new TestrixError(ErrorCodes.CONFIG_VALIDATION_FAILED, 'OAuth owner id is required.');
      }
      const auth = collectionFolderAuthSchema.parse(payload.auth);
      return oauthTokenService.ensureAccessToken(
        deps.getProfileDir(),
        payload.ownerId,
        auth,
        deps.getMainWindow,
      );
    }),
  );

  ipc.handle(
    OAuthChannels.clearToken,
    wrapInvokeHandler(OAuthChannels.clearToken, async (_event, ownerId: unknown) => {
      if (typeof ownerId !== 'string' || !ownerId.trim()) {
        throw new TestrixError(ErrorCodes.CONFIG_VALIDATION_FAILED, 'OAuth owner id is required.');
      }
      await oauthTokenService.clear(deps.getProfileDir(), ownerId);
    }),
  );

  ipc.handle(
    OAuthChannels.tokenStatus,
    wrapInvokeHandler(OAuthChannels.tokenStatus, async (_event, ownerId: unknown) => {
      if (typeof ownerId !== 'string' || !ownerId.trim()) {
        throw new TestrixError(ErrorCodes.CONFIG_VALIDATION_FAILED, 'OAuth owner id is required.');
      }
      return oauthTokenService.status(deps.getProfileDir(), ownerId);
    }),
  );
}
