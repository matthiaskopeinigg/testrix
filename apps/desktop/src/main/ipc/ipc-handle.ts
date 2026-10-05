import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';

import { appLogger, resolveDevServerOrigin, usesAngularDevServer } from '@testrix/electron-core';

type ParsedArgs<S extends readonly z.ZodType[]> = { [K in keyof S]: z.output<S[K]> };

export type IpcHandle = <const S extends readonly z.ZodType[], R>(
  channel: string,
  args: S,
  run: (event: IpcMainInvokeEvent, ...parsed: ParsedArgs<S>) => R,
) => void;

/** Rejected IPC input. The message names the channel and the first bad field. */
export class IpcValidationError extends Error {
  constructor(channel: string, error: z.ZodError) {
    const issue = error.issues[0];
    const [index, ...field] = issue?.path ?? [];
    const argument = typeof index === 'number' ? ` argument ${index + 1}` : '';
    const where = field.length ? `${argument} at ${field.join('.')}` : argument;
    super(`Invalid request for ${channel}${where}: ${issue?.message ?? 'bad input'}`);
    this.name = 'IpcValidationError';
  }
}

/**
 * Builds `handle(channel, [schemas...], run)`. Every invoke is checked for a trusted
 * sender frame, then its arguments are parsed as a tuple, so `run` only ever sees
 * validated, typed values. Trailing `undefined` arguments count as omitted.
 */
export function createIpcHandle(ipcMain: IpcMain, isTrusted: (url: string) => boolean = isTrustedSenderUrl): IpcHandle {
  return (channel, args, run) => {
    const schema = z.tuple(args as unknown as [z.ZodType, ...z.ZodType[]]);
    ipcMain.handle(channel, (event, ...raw: unknown[]) => {
      const url = event.senderFrame?.url ?? '';
      if (!isTrusted(url)) {
        appLogger.warn('ipc', `Blocked ${channel} from untrusted frame ${url || '(unknown)'}`);
        throw new Error(`Blocked ${channel}: the request did not come from the Testrix window.`);
      }
      const parsed = schema.safeParse(trimTrailingUndefined(raw));
      if (!parsed.success) {
        const error = new IpcValidationError(channel, parsed.error);
        appLogger.warn('ipc', error.message);
        throw error;
      }
      return run(event, ...(parsed.data as ParsedArgs<typeof args>));
    });
  };
}

/** The workbench loads from `file://` when packaged and from the Angular dev server in development. */
export function isTrustedSenderUrl(url: string): boolean {
  if (url.startsWith('file://'))
    return true;
  if (!usesAngularDevServer())
    return false;
  try {
    return new URL(url).origin === new URL(resolveDevServerOrigin()).origin;
  } catch {
    return false;
  }
}

function trimTrailingUndefined(values: unknown[]): unknown[] {
  let end = values.length;
  while (end > 0 && values[end - 1] === undefined)
    end -= 1;
  return values.slice(0, end);
}
