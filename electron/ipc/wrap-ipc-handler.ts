import type { IpcMainInvokeEvent } from 'electron';

import type { ErrorCode } from '../../shared/errors';
import { ErrorCodes, TestrixError } from '../../shared/errors';
import type { IpcErrorPayload } from '../../shared/errors';
import { logDebug } from '../errors/logger';
import { getMainSettings } from '../services/settings-runtime';

export type AsyncInvokeHandler<P = unknown, R = unknown> = (
  event: IpcMainInvokeEvent,
  payload: P,
) => Promise<R>;

export function wrapInvokeHandler<P, R>(
  channel: string,
  impl: AsyncInvokeHandler<P, R>,
): AsyncInvokeHandler<P, R> {
  return async (event, payload): Promise<R> => {
    const shouldLogIpc =
      process.env.TESTRIX_DEV === '1' && getMainSettings().logging.logIpcInDev;
    if (shouldLogIpc) {
      logDebug(`[ipc] invoke ${channel}`);
    }
    try {
      return await impl(event, payload);
    } catch (error: unknown) {
      // eslint-disable-next-line no-console
      console.error(`[ipc] ${channel}`, error);
      throw serializeIpcFailure(error);
    }
  };
}

export function serializeIpcFailure(error: unknown): IpcErrorPayload & { name?: string } {
  if (error instanceof TestrixError) {
    return { code: error.code, userMessage: error.userMessage, name: 'TestrixError' };
  }
  const code: ErrorCode = ErrorCodes.IPC_HANDLER_FAILED;
  return {
    code,
    userMessage: 'Something went wrong.',
    name: 'TestrixError',
  };
}
