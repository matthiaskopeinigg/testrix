import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { migrateLegacyConfigLayout } from './config-layout';

describe('migrateLegacyConfigLayout', () => {
  it('moves flat JSON into configs/ and workspace-1', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'testrix-layout-'));
    try {
      await writeFile(path.join(root, 'settings.json'), '{"theme":"dark"}\n', 'utf8');
      await writeFile(path.join(root, 'session.json'), '{"activeRail":"collections"}\n', 'utf8');
      await writeFile(path.join(root, 'environments.json'), '{"items":[]}\n', 'utf8');
      await writeFile(path.join(root, 'collections.json'), '{"collections":[]}\n', 'utf8');

      expect(await migrateLegacyConfigLayout(root)).toBe(true);
      expect(existsSync(path.join(root, 'configs', 'settings.json'))).toBe(true);
      expect(existsSync(path.join(root, 'configs', 'session.json'))).toBe(true);
      expect(existsSync(path.join(root, 'workspaces', 'workspace-1', 'environments.json'))).toBe(true);
      expect(existsSync(path.join(root, 'workspaces', 'workspace-1', 'collections.json'))).toBe(true);
      expect(existsSync(path.join(root, 'settings.json'))).toBe(false);

      const catalog = JSON.parse(
        await readFile(path.join(root, 'workspaces', 'workspaces.json'), 'utf8'),
      ) as { activeId: string; items: Array<{ id: string; folder: string; name: string }> };
      expect(catalog.items[0]?.folder).toBe('workspace-1');
      expect(catalog.items[0]?.name).toBe('Default');
      expect(catalog.activeId).toBe(catalog.items[0]?.id);

      expect(await migrateLegacyConfigLayout(root)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
