import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import { waitForUpdateReadyFile, writeUpdateReadyFile } from './update-ready-file';

describe('waitForUpdateReadyFile', () => {
  it('resolves true and removes the file after it appears', async () => {
    const filePath = path.join(os.tmpdir(), `testrix-ready-${Date.now()}-${process.pid}.flag`);
    try {
      fs.rmSync(filePath, { force: true });
      const pending = waitForUpdateReadyFile(filePath, 2_000);
      setTimeout(() => writeUpdateReadyFile(filePath), 30);
      await expect(pending).resolves.toBe(true);
      expect(fs.existsSync(filePath)).toBe(false);
    } finally {
      fs.rmSync(filePath, { force: true });
    }
  });

  it('resolves false when the file never appears', async () => {
    const filePath = path.join(os.tmpdir(), `testrix-ready-missing-${Date.now()}.flag`);
    await expect(waitForUpdateReadyFile(filePath, 80)).resolves.toBe(false);
  });
});
