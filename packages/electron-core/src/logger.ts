import {
  LOG_FILE_MAX_MB_DEFAULT,
  LOG_RECENT_LINE_LIMIT,
  redactSecrets,
} from '@testrix/contracts';
import type { App } from 'electron';
import { appendFile, mkdir, open, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

export type AppLogLevel = 'error' | 'warn' | 'info' | 'debug';

const LEVEL_RANK: Record<AppLogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const TAIL_BYTES = 512 * 1024;

export interface AppLoggerOptions {
  readonly level: AppLogLevel;
  readonly toFile: boolean;
  readonly filePath: string;
  readonly maxFileBytes?: number;
  readonly secrets?: readonly string[];
}

function formatLine(level: AppLogLevel, scope: string, message: string): string {
  return `${new Date().toISOString()} [${level}] [${scope}] ${message}`;
}

function uniqueSecrets(values: readonly string[]): string[] {
  return [...new Set(values)].filter((value) => value.length > 0);
}

/**
 * Console logger with an optional append-only file in userData/logs.
 */
export class AppLogger {
  private level: AppLogLevel = 'warn';
  private toFile = false;
  private filePath = '';
  private maxFileBytes = LOG_FILE_MAX_MB_DEFAULT * 1024 * 1024;
  private secrets: string[] = [];
  private readonly recent: string[] = [];
  private writeQueue: Promise<void> = Promise.resolve();

  configure(options: AppLoggerOptions): void {
    this.level = options.level;
    this.toFile = options.toFile;
    this.filePath = options.filePath;
    this.maxFileBytes =
      options.maxFileBytes && options.maxFileBytes > 0
        ? options.maxFileBytes
        : LOG_FILE_MAX_MB_DEFAULT * 1024 * 1024;
    if (options.secrets)
      this.secrets = uniqueSecrets([...this.secrets, ...options.secrets]);
    this.enqueue(() => this.enforceMaxSize());
  }

  error(scope: string, error: unknown): void {
    this.write('error', scope, error instanceof Error ? error.stack ?? error.message : String(error));
  }

  warn(scope: string, message: string): void {
    this.write('warn', scope, message);
  }

  info(scope: string, message: string): void {
    this.write('info', scope, message);
  }

  debug(scope: string, message: string): void {
    this.write('debug', scope, message);
  }

  /**
   * Returns the newest log lines, redacted, from the file when enabled or from memory.
   */
  async recentLines(limit = LOG_RECENT_LINE_LIMIT): Promise<string[]> {
    await this.writeQueue;
    const fileLines = this.toFile ? await this.readTail(limit) : [];
    const source = fileLines.length > 0 ? fileLines : this.recent.slice(-limit);
    return source.map((line) => redactSecrets(line, this.secrets));
  }

  private write(level: AppLogLevel, scope: string, message: string): void {
    if (LEVEL_RANK[level] > LEVEL_RANK[this.level])
      return;
    const safeMessage = redactSecrets(message, this.secrets);
    const line = formatLine(level, scope, safeMessage);
    this.pushRecent(line);
    if (level === 'error')
      console.error(`[testrix ${scope}]`, safeMessage);
    else if (level === 'warn')
      console.warn(`[testrix ${scope}]`, safeMessage);
    else
      console.info(`[testrix ${scope}]`, safeMessage);
    if (!this.toFile || !this.filePath)
      return;
    this.enqueue(() => this.append(`${line}\n`));
  }

  private pushRecent(line: string): void {
    this.recent.push(line);
    if (this.recent.length > LOG_RECENT_LINE_LIMIT)
      this.recent.splice(0, this.recent.length - LOG_RECENT_LINE_LIMIT);
  }

  private enqueue(work: () => Promise<void>): void {
    this.writeQueue = this.writeQueue.then(work).catch(() => undefined);
  }

  private async append(line: string): Promise<void> {
    try {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await this.enforceMaxSize(Buffer.byteLength(line, 'utf8'));
      await appendFile(this.filePath, line, 'utf8');
    } catch {
      // Never throw from logging.
    }
  }

  private async enforceMaxSize(extraBytes = 0): Promise<void> {
    if (!this.filePath)
      return;
    try {
      const info = await stat(this.filePath);
      if (info.size + extraBytes <= this.maxFileBytes)
        return;
      const backupPath = `${this.filePath}.1`;
      await rm(backupPath, { force: true });
      await rename(this.filePath, backupPath);
    } catch {
      // Missing file or rotate failure; the next append may still succeed.
    }
  }

  private async readTail(limit: number): Promise<string[]> {
    if (!this.filePath)
      return [];
    try {
      const handle = await open(this.filePath, 'r');
      try {
        const info = await handle.stat();
        const chunk = Math.min(info.size, TAIL_BYTES);
        if (chunk === 0)
          return [];
        const buffer = Buffer.alloc(chunk);
        await handle.read(buffer, 0, chunk, info.size - chunk);
        const text = buffer.toString('utf8');
        return text.split(/\r?\n/).filter((line) => line.length > 0).slice(-limit);
      } finally {
        await handle.close();
      }
    } catch {
      return [];
    }
  }
}

export const appLogger = new AppLogger();

export function logError(getPath: App['getPath'], scope: string, error: unknown): void {
  appLogger.error(scope, error);
  void getPath;
}
