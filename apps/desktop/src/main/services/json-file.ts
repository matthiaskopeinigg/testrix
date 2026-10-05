import { randomBytes } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { appLogger } from '@testrix/electron-core';

const RENAME_RETRIES = 5;
const RENAME_RETRY_MS = 40;

const pathQueues = new Map<string, Promise<unknown>>();

/**
 * Runs `task` after every earlier task queued for the same path has settled.
 * Keeps one read-modify-write or write per file in flight at a time.
 */
export function queueForPath<T>(filePath: string, task: () => Promise<T>): Promise<T> {
  const key = path.resolve(filePath).toLowerCase();
  const previous = pathQueues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  pathQueues.set(key, next);
  void next
    .catch(() => undefined)
    .then(() => {
      if (pathQueues.get(key) === next)
        pathQueues.delete(key);
    });
  return next;
}

/**
 * Reads a UTF-8 JSON file. Returns null when the file is missing or unreadable.
 * A file that exists but does not parse is copied aside as `<name>.corrupt-<time>`
 * before null is returned, so the next write cannot destroy the only copy.
 */
export async function readJsonFile(filePath: string): Promise<unknown | null> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    if (!isMissingFile(error))
      appLogger.warn('json-file', `Could not read ${filePath}: ${errorText(error)}`);
    return null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    await keepCorruptCopy(filePath, `Invalid JSON (${errorText(error)})`);
    return null;
  }
}

/**
 * Parses JSON text, returning `fallback` for empty or malformed input.
 */
export function parseJsonText<T>(text: string | null | undefined, fallback: T): unknown {
  if (!text)
    return fallback;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return fallback;
  }
}

/**
 * Writes pretty-printed JSON atomically, creating parent folders as needed.
 * Writes to the same path are serialized.
 */
export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  await queueForPath(filePath, () => writeFileAtomic(filePath, text));
}

/**
 * Writes to a sibling temp file and renames it over the target, so a crash leaves
 * either the old or the new content, never a truncated file. Callers that need
 * ordering should wrap this in {@link queueForPath}.
 */
export async function writeFileAtomic(filePath: string, data: string | Uint8Array): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    await writeFile(tempPath, data);
    await renameWithRetry(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

/** Windows reports EPERM/EBUSY while antivirus or indexers briefly hold the target open. */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const isTransient = code === 'EPERM' || code === 'EBUSY' || code === 'EACCES';
      if (!isTransient || attempt >= RENAME_RETRIES)
        throw error;
      await new Promise((resolve) => setTimeout(resolve, RENAME_RETRY_MS * (attempt + 1)));
    }
  }
}

/**
 * Copies `filePath` to `<name>.corrupt-<time>` and logs `reason`, before a caller
 * replaces content it could only partly read.
 */
export async function keepCorruptCopy(filePath: string, reason: string): Promise<void> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = `${filePath}.corrupt-${stamp}`;
  try {
    await copyFile(filePath, backup);
    appLogger.warn('json-file', `${reason} in ${filePath}. Kept a copy at ${backup}.`);
  } catch (copyError) {
    appLogger.warn('json-file', `${reason} in ${filePath}; backup failed: ${errorText(copyError)}`);
  }
}

export function isMissingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT';
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
