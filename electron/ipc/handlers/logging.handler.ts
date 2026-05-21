import type { App, IpcMainInvokeEvent } from 'electron';
import { shell } from 'electron';

import { clearMainLogs, getLogPaths, tailMainLog } from '../../errors/logger';
import { LoggingChannels } from '../channels/logging.channels';
import { wrapInvokeHandler } from '../wrap-ipc-handler';
import type { IpcMainBinder } from '../register-ipc';

export interface LoggingHandlerDeps {
  readonly getPath: App['getPath'];
}

export function registerLoggingHandlers(ipc: IpcMainBinder, deps: LoggingHandlerDeps): void {
  const getPath = deps.getPath;

  ipc.handle(
    LoggingChannels.getPaths,
    wrapInvokeHandler(LoggingChannels.getPaths, async () => getLogPaths(getPath)),
  );

  ipc.handle(
    LoggingChannels.tail,
    wrapInvokeHandler(LoggingChannels.tail, async (_e: IpcMainInvokeEvent, payload: unknown) => {
      const maxLines =
        typeof payload === 'object' &&
        payload !== null &&
        typeof (payload as { maxLines?: unknown }).maxLines === 'number'
          ? (payload as { maxLines: number }).maxLines
          : 200;
      return tailMainLog(getPath, maxLines);
    }),
  );

  ipc.handle(
    LoggingChannels.clear,
    wrapInvokeHandler(LoggingChannels.clear, async () => {
      await clearMainLogs(getPath);
      return undefined;
    }),
  );

  ipc.handle(
    LoggingChannels.openLogDir,
    wrapInvokeHandler(LoggingChannels.openLogDir, async () => {
      const { logDir } = getLogPaths(getPath);
      await shell.openPath(logDir);
      return undefined;
    }),
  );
}
