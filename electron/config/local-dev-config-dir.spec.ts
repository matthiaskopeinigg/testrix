import { describe, expect, it } from 'vitest';
import * as path from 'node:path';

import {
  resolveLocalDevConfigDir,
  resolveLocalDevElectronUserDataDir,
  resolveTestrixConfigHome,
} from './local-dev-config-dir';

describe('resolveLocalDevConfigDir', () => {
  it('uses TESTRIX_CONFIG_DIR when set', () => {
    const dir = resolveLocalDevConfigDir({
      cwd: path.join(path.sep, 'repo'),
      configDirEnv: path.join(path.sep, 'custom', 'cfg'),
      serveRenderer: true,
    });
    expect(dir).toBe(path.resolve(path.join(path.sep, 'custom', 'cfg')));
  });

  it('uses <cwd>/.config for ng serve Electron runs', () => {
    const cwd = path.join(path.sep, 'repo');
    expect(
      resolveLocalDevConfigDir({
        cwd,
        serveRenderer: true,
      }),
    ).toBe(path.join(cwd, '.config'));
  });

  it('returns null for packaged runs without an override', () => {
    expect(
      resolveLocalDevConfigDir({
        cwd: path.join(path.sep, 'repo'),
        serveRenderer: false,
      }),
    ).toBeNull();
  });
});

describe('resolveTestrixConfigHome', () => {
  it('keeps Electron userData when not serving the renderer', () => {
    const userData = path.join(path.sep, 'appdata', 'testrix');
    expect(resolveTestrixConfigHome(userData, {}, path.join(path.sep, 'repo'))).toBe(userData);
  });

  it('points config JSON at the project .config folder during ng serve', () => {
    const cwd = path.join(path.sep, 'repo');
    expect(
      resolveTestrixConfigHome(path.join(cwd, '.config', 'electron'), { TESTRIX_SERVE_RENDERER: '1' }, cwd),
    ).toBe(path.join(cwd, '.config'));
  });
});

describe('resolveLocalDevElectronUserDataDir', () => {
  it('nests Chromium userData under .config/electron', () => {
    expect(resolveLocalDevElectronUserDataDir(path.join(path.sep, 'repo', '.config'))).toBe(
      path.join(path.sep, 'repo', '.config', 'electron'),
    );
  });
});
