import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { collabPresencePath } from '@testrix/contracts';
import { describe, expect, it } from 'vitest';

import { CollabSharedState } from './collab-shared-state';

const PREFS = {
  identity: { name: 'Sam', email: 'sam@users.testrix.local' },
  presenceMode: 'active' as const,
  shareRuns: true,
  deviceId: 'device-sam',
};

describe('collab heartbeat', () => {
  it('leaves a fresh heartbeat alone so quiet syncs have nothing to commit', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'testrix-heartbeat-'));
    const shared = new CollabSharedState();
    const file = path.join(dir, ...collabPresencePath(PREFS.deviceId).split('/'));
    const start = Date.parse('2026-09-27T00:00:00.000Z');

    await shared.heartbeat(dir, PREFS, '2.0.0', start);
    const first = await readFile(file, 'utf8');

    await shared.heartbeat(dir, PREFS, '2.0.0', start + 30_000);
    expect(await readFile(file, 'utf8')).toBe(first);

    await shared.heartbeat(dir, { ...PREFS, identity: { ...PREFS.identity, name: 'Samantha' } }, '2.0.0', start + 31_000);
    expect(await readFile(file, 'utf8')).toContain('Samantha');

    await shared.heartbeat(dir, { ...PREFS, identity: { ...PREFS.identity, name: 'Samantha' } }, '2.0.0', start + 120_000);
    expect(JSON.parse(await readFile(file, 'utf8')).at).toBe(new Date(start + 120_000).toISOString());
  });

  it('rewrites a heartbeat when the open workspace name changes', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'testrix-heartbeat-ws-'));
    const shared = new CollabSharedState();
    const file = path.join(dir, ...collabPresencePath(PREFS.deviceId).split('/'));
    const start = Date.parse('2026-09-27T00:00:00.000Z');

    await shared.heartbeat(dir, PREFS, '2.0.0', start, 'API tests');
    expect(JSON.parse(await readFile(file, 'utf8')).workspaceName).toBe('API tests');

    await shared.heartbeat(dir, PREFS, '2.0.0', start + 1_000, 'Web');
    expect(JSON.parse(await readFile(file, 'utf8')).workspaceName).toBe('Web');
  });
});
