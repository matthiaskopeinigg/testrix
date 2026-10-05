import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

import { environmentVariableMap, parseEnvironmentsFile } from './environment';
import { parseFlowsFile } from './flows-file';
import {
  TESTING_SEED_VERSION,
  countFlowNodes,
  createTestingCookiesFile,
  createTestingEnvironmentsFile,
  createTestingWorkspaceFiles,
} from './testing-workspace';

describe('testing workspace seed', () => {
  it('exposes a seed version for on-disk rewrites', () => {
    expect(TESTING_SEED_VERSION).toBeGreaterThanOrEqual(2);
  });

  it('seeds Local with public e2e site URLs', () => {
    const file = parseEnvironmentsFile(createTestingEnvironmentsFile());
    const local = file.items.find((item) => item.id === 'env-local');
    expect(local).toBeTruthy();
    const vars = environmentVariableMap(local?.variables ?? []);
    expect(vars['INTERNET_URL']).toBe('https://the-internet.herokuapp.com/');
    expect(vars['SAUCE_URL']).toBe('https://www.saucedemo.com/');
    expect(vars['HTTPBIN_URL']).toBe('https://httpbin.org');
    expect(vars['BASE_URL']).toBe('https://httpbin.org');
    expect(vars['username']).toBe('standard_user');
  });

  it('ships tutorial Flows and empty collections / service stubs', () => {
    const files = createTestingWorkspaceFiles();
    expect(files.collections.collections).toEqual([]);
    expect(createTestingCookiesFile().cookies).toEqual([]);
    expect(files.load.items).toEqual([]);
    expect(files.regressions.items).toEqual([]);
    const flows = parseFlowsFile(files.flows);
    expect(countFlowNodes(flows)).toBeGreaterThan(20);
  });

  it('writes the seed into the local Testing workspace when WRITE_TESTING_SEED=1', () => {
    if (process.env.WRITE_TESTING_SEED !== '1')
      return;
    const root =
      process.env.TESTRIX_USER_DATA ??
      path.join(process.env.APPDATA ?? '', 'Testrix-2.0-dev');
    const dir = path.join(root, 'workspaces', 'workspace-testing');
    const files = createTestingWorkspaceFiles();
    mkdirSync(dir, { recursive: true });
    const writes: Array<[string, unknown]> = [
      ['collections.json', files.collections],
      ['environments.json', files.environments],
      ['cookies.json', files.cookies],
      ['database.json', files.databases],
      ['queries.json', files.queries],
      ['history.json', files.history],
      ['flows.json', files.flows],
      ['load.json', files.load],
      ['regressions.json', files.regressions],
      ['flow-templates.json', files.flowTemplates],
      ['emulator.json', files.emulator],
      ['seed-meta.json', { version: TESTING_SEED_VERSION, writtenAt: new Date().toISOString() }],
    ];
    for (const [name, body] of writes)
      writeFileSync(path.join(dir, name), `${JSON.stringify(body, null, 2)}\n`, 'utf8');
    expect(countFlowNodes(parseFlowsFile(files.flows))).toBeGreaterThan(20);
  });
});
