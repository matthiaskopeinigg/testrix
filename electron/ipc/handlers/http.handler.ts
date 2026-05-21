import type { IpcMainInvokeEvent } from 'electron';

import { sendHttpRequestPayloadSchema } from '../../../shared/http/outgoing-request.schema';
import { TestrixError, ErrorCodes } from '../../../shared/errors';
import type { IpcMainBinder } from '../register-ipc';
import { wrapInvokeHandler } from '../wrap-ipc-handler';
import { HttpChannels } from '../channels/http.channels';
import { executeHttpRequest } from '../../services/http/http-request-executor.service';

const inflight = new Map<string, AbortController>();

export function registerHttpHandlers(ipc: IpcMainBinder): void {
  ipc.handle(
    HttpChannels.send,
    wrapInvokeHandler(HttpChannels.send, async (_event: IpcMainInvokeEvent, raw: unknown) => {
      const parsed = sendHttpRequestPayloadSchema.safeParse(raw);
      if (!parsed.success) {
        const detail =
          process.env.TESTRIX_DEV === '1'
            ? ` ${JSON.stringify(parsed.error.flatten())}`
            : '';
        throw new TestrixError(
          ErrorCodes.CONFIG_VALIDATION_FAILED,
          `Invalid HTTP request payload${detail}`,
        );
      }
      const snapshot = await executeHttpRequest(parsed.data);
      return { snapshot };
    }),
  );

  ipc.handle(
    HttpChannels.cancel,
    wrapInvokeHandler(HttpChannels.cancel, async (_event, requestId: unknown) => {
      if (typeof requestId !== 'string') {
        return;
      }
      inflight.get(requestId)?.abort();
      inflight.delete(requestId);
    }),
  );
}
