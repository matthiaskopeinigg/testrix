import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { LOG_SECRET_REDACTED } from '@testrix/contracts';

import { AppLogger } from './logger';

describe('AppLogger', () => {
  it('redacts secrets in console output and recent lines', async () => {
    const logger = new AppLogger();
    logger.configure({
      level: 'debug',
      toFile: false,
      filePath: '',
      secrets: ['super-secret-token'],
    });
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    logger.info('test', 'got super-secret-token from env');
    const [lines] = await Promise.all([logger.recentLines()]);
    expect(info.mock.calls[0]?.[1]).toContain(LOG_SECRET_REDACTED);
    expect(info.mock.calls[0]?.[1]).not.toContain('super-secret-token');
    expect(lines.join('\n')).toContain(LOG_SECRET_REDACTED);
    expect(lines.join('\n')).not.toContain('super-secret-token');
    info.mockRestore();
  });

  it('rotates the log file when it exceeds the max size', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'tx-log-'));
    const filePath = path.join(dir, 'testrix.log');
    const logger = new AppLogger();
    logger.configure({
      level: 'debug',
      toFile: true,
      filePath,
      maxFileBytes: 80,
    });
    logger.info('test', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    logger.info('test', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    const lines = await logger.recentLines();
    const current = await readFile(filePath, 'utf8');
    const rotated = await readFile(`${filePath}.1`, 'utf8');
    expect(current).toContain('bbbbbbbb');
    expect(rotated).toContain('aaaaaaaa');
    expect(lines.some((line) => line.includes('bbbbbbbb'))).toBe(true);
  });
});
