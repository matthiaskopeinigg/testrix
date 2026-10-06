import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as esbuild from 'esbuild';
import { afterEach, describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const require = createRequire(import.meta.url);

describe('setup installer bundle', () => {
  let directory: string | undefined;

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it('loads the CommonJS entry that Setup ships', async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'testrix-setup-bundle-'));
    const stub = path.join(directory, 'electron-stub.cjs');
    const outfile = path.join(directory, 'main.cjs');
    await writeFile(stub, ELECTRON_STUB);
    await esbuild.build({
      absWorkingDir: root,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node22',
      entryPoints: [path.join(root, 'apps/setup/src/main/main.ts')],
      outfile,
      external: ['original-fs'],
      alias: { electron: stub },
      logLevel: 'silent',
    });

    expect(() => require(outfile)).not.toThrow();
  });
});

const ELECTRON_STUB = `
const app = {
  commandLine: { appendSwitch() {} },
  setAppUserModelId() {},
  setPath() {},
  getPath() { return require('os').tmpdir(); },
  getVersion() { return '0.0.0'; },
  whenReady() { return new Promise(() => {}); },
  quit() {},
  exit() {},
  on() { return app; },
};
module.exports = {
  app,
  BrowserWindow: function BrowserWindow() {},
  dialog: {},
  ipcMain: {},
  nativeTheme: {},
  session: {},
  shell: {},
  utilityProcess: {},
};
`;
