import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { inspect } from 'node:util';

import type { App } from 'electron';

import { isLogLevelEnabled, type LogLevel } from '../../shared/config/log-level';
import type { SettingsFile } from '../../shared/config/settings.schema';
import { ErrorCodes, TestrixError } from '../../shared/errors';

import { getMainSettings } from '../services/settings-runtime';

type GetPath = App['getPath'];

let getPathRef: GetPath | null = null;

const useVerboseLog = (): boolean => process.env.TESTRIX_DEV === '1';

function resolveUserData(getPath: GetPath): string {
  return getPath('userData');
}

function resolveLogDir(getPath: GetPath): string {
  return path.join(resolveUserData(getPath), 'logs');
}

function resolveMainLogFile(getPath: GetPath): string {
  return path.join(resolveLogDir(getPath), 'main.log');
}

function loggingSettings(): SettingsFile['logging'] {
  return getMainSettings().logging;
}

function formatTimestamp(include: boolean): string {
  return include ? `${new Date().toISOString()} ` : '';
}

function redactLine(line: string, enabled: boolean): string {
  if (!enabled) {
    return line;
  }
  return line
    .replace(/(Bearer\s+)[\w.-]+/gi, '$1[redacted]')
    .replace(/(api[_-]?key["']?\s*[:=]\s*)["']?[\w-]+/gi, '$1[redacted]')
    .replace(/(password["']?\s*[:=]\s*)["']?[^\s"']+/gi, '$1[redacted]');
}

function formatErr(err: unknown): string {
  if (err instanceof TestrixError) {
    return `${err.code} ${err.userMessage}`;
  }
  return inspect(err, { depth: 4 });
}

async function rotateIfNeeded(logFile: string, maxMb: number, retained: number): Promise<void> {
  try {
    const stat = await fs.stat(logFile);
    const maxBytes = maxMb * 1024 * 1024;
    if (stat.size < maxBytes) {
      return;
    }

    for (let i = retained - 1; i >= 1; i -= 1) {
      const from = i === 1 ? logFile : `${logFile}.${i - 1}`;
      const to = `${logFile}.${i}`;
      try {
        await fs.rename(from, to);
      } catch {
        /* missing prior file */
      }
    }
    await fs.writeFile(logFile, '', 'utf8');
  } catch {
    /* ignore rotation errors */
  }
}

async function appendLogFileSafe(logFile: string, line: string): Promise<void> {
  const settings = loggingSettings();
  if (!settings.enabled || !settings.writeToFile) {
    return;
  }

  try {
    await fs.mkdir(path.dirname(logFile), { recursive: true });
    await rotateIfNeeded(logFile, settings.maxFileSizeMb, settings.retainedFiles);
    const body = `${formatTimestamp(settings.includeTimestamps)}${redactLine(line, settings.redactSecrets)}\n`;
    await fs.appendFile(logFile, body, 'utf8');
  } catch {
    /* ignore */
  }
}

function writeConsole(level: LogLevel, line: string): void {
  const settings = loggingSettings();
  if (!settings.writeToConsole && !useVerboseLog()) {
    return;
  }
  if (!isLogLevelEnabled(settings.level, level)) {
    return;
  }

  const output = `${formatTimestamp(settings.includeTimestamps)}${line}`;
  if (level === 'error') {
    // eslint-disable-next-line no-console
    console.error(output);
    return;
  }
  if (level === 'warn') {
    // eslint-disable-next-line no-console
    console.warn(output);
    return;
  }
  // eslint-disable-next-line no-console
  console.log(output);
}

function emit(level: LogLevel, message: string, err?: unknown): void {
  const settings = loggingSettings();
  if (!settings.enabled || !isLogLevelEnabled(settings.level, level)) {
    return;
  }

  const suffix = err !== undefined ? `: ${formatErr(err)}` : '';
  const line = `[${level}] ${message}${suffix}`;
  writeConsole(level, line);

  if (getPathRef) {
    void appendLogFileSafe(resolveMainLogFile(getPathRef), line);
  }
}

export function configureMainLogger(getPath: GetPath): void {
  getPathRef = getPath;
}

export function logError(getPath: GetPath, message: string, err?: unknown): void {
  getPathRef = getPath;
  emit('error', message, err);
}

export function logWarn(getPath: GetPath, message: string): void {
  getPathRef = getPath;
  emit('warn', message);
}

export function logInfo(message: string): void {
  emit('info', message);
}

export function logDebug(message: string): void {
  emit('debug', message);
}

export function getLogPaths(getPath: GetPath): { logDir: string; mainLogFile: string } {
  return {
    logDir: resolveLogDir(getPath),
    mainLogFile: resolveMainLogFile(getPath),
  };
}

export async function tailMainLog(getPath: GetPath, maxLines = 200): Promise<string> {
  const logFile = resolveMainLogFile(getPath);
  try {
    const raw = await fs.readFile(logFile, 'utf8');
    const lines = raw.split(/\r?\n/).filter((line) => line.length > 0);
    return lines.slice(-maxLines).join('\n');
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err?.code === 'ENOENT') {
      return '';
    }
    throw e;
  }
}

export async function clearMainLogs(getPath: GetPath): Promise<void> {
  const settings = loggingSettings();
  const logDir = resolveLogDir(getPath);
  const candidates = [resolveMainLogFile(getPath)];
  for (let i = 1; i < settings.retainedFiles; i += 1) {
    candidates.push(`${resolveMainLogFile(getPath)}.${i}`);
  }

  await Promise.all(
    candidates.map(async (file) => {
      try {
        await fs.rm(file, { force: true });
      } catch {
        /* ignore */
      }
    }),
  );

  await fs.mkdir(logDir, { recursive: true });
}

export function attachProcessLogging(getPath: GetPath): void {
  configureMainLogger(getPath);
  process.on('uncaughtException', (err) => {
    logError(getPath, 'uncaughtException', err);
    if (!useVerboseLog()) {
      try {
        const { dialog } = require('electron') as typeof import('electron');
        dialog.showErrorBox(
          'Testrix',
          'An unexpected error occurred. Details were written to the log file.',
        );
      } catch {
        /* no electron */
      }
    }
  });
  process.on('unhandledRejection', (reason) => {
    logError(getPath, 'unhandledRejection', reason);
  });
}

export { ErrorCodes, TestrixError };
