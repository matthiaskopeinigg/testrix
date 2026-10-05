import { safeStorage } from 'electron';
import { copyFile, readFile } from 'node:fs/promises';

import { appLogger } from '@testrix/electron-core';
import { parseCollabSecretsFile, type CollabSecretsFile } from '@testrix/contracts';

import { isMissingFile, queueForPath, writeFileAtomic } from '../json-file';

const SECRETS_FORMAT = 'testrix-secrets';
const SECRETS_FORMAT_VERSION = 1;

interface EncryptedSecretsEnvelope {
  readonly format: typeof SECRETS_FORMAT;
  readonly version: number;
  readonly cipher: 'safeStorage';
  readonly data: string;
}

/**
 * Reads `secrets.local.json`. Accepts the encrypted envelope and the older plaintext
 * layout (rewritten encrypted on the next save). A file that cannot be decrypted or
 * parsed is copied aside and treated as empty, so it is never silently overwritten.
 */
export async function readSecretsFile(filePath: string): Promise<CollabSecretsFile> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    if (!isMissingFile(error))
      appLogger.warn('secrets', `Could not read ${filePath}: ${errorText(error)}`);
    return parseCollabSecretsFile(null);
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isEncryptedEnvelope(parsed))
      return parseCollabSecretsFile(parsed);
    if (!isEncryptionAvailable())
      throw new Error('OS encryption is unavailable, so the encrypted secrets cannot be opened');
    const json = safeStorage.decryptString(Buffer.from(parsed.data, 'base64'));
    return parseCollabSecretsFile(JSON.parse(json) as unknown);
  } catch (error) {
    await preserveUnreadable(filePath, error);
    return parseCollabSecretsFile(null);
  }
}

/**
 * Read-modify-writes `secrets.local.json` as one queued step, so concurrent callers
 * cannot overwrite each other. Written atomically and encrypted. Throws when the
 * OS cannot encrypt, so secrets are never saved as plain text.
 */
export function updateSecretsFile(
  filePath: string,
  update: (current: CollabSecretsFile) => CollabSecretsFile,
): Promise<void> {
  return queueForPath(filePath, async () => {
    const next = update(await readSecretsFile(filePath));
    await writeFileAtomic(filePath, serializeSecrets(next));
  });
}

function serializeSecrets(secrets: CollabSecretsFile): string {
  if (!isEncryptionAvailable()) {
    throw new Error('OS encryption is unavailable, so secrets cannot be saved on this PC.');
  }
  const envelope: EncryptedSecretsEnvelope = {
    format: SECRETS_FORMAT,
    version: SECRETS_FORMAT_VERSION,
    cipher: 'safeStorage',
    data: safeStorage.encryptString(JSON.stringify(secrets)).toString('base64'),
  };
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

function isEncryptedEnvelope(value: unknown): value is EncryptedSecretsEnvelope {
  if (!value || typeof value !== 'object')
    return false;
  const record = value as Record<string, unknown>;
  return record['format'] === SECRETS_FORMAT && typeof record['data'] === 'string';
}

/** `safeStorage` is undefined when this module runs outside Electron (unit tests). */
function isEncryptionAvailable(): boolean {
  return typeof safeStorage?.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable();
}

async function preserveUnreadable(filePath: string, error: unknown): Promise<void> {
  const backup = `${filePath}.unreadable-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  try {
    await copyFile(filePath, backup);
    appLogger.warn('secrets', `Could not open ${filePath} (${errorText(error)}). Kept a copy at ${backup}.`);
  } catch (copyError) {
    appLogger.warn('secrets', `Could not open ${filePath} (${errorText(error)}); backup failed: ${errorText(copyError)}`);
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
