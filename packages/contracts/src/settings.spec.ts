import { describe, expect, it } from 'vitest';

import { parseCollectionsFile } from './config-files';
import { parseEnvironmentsFile } from './environment';
import { motionScaleForSpeed } from './motion';
import { parseSessionFile } from './session';
import { DEFAULT_USER_SETTINGS, mergeUserSettingsPatch, parseSettingsFile, toUserSettings, userSettingsSchema } from './settings';

describe('userSettingsSchema', () => {
  it('parses defaults', () => {
    expect(userSettingsSchema.parse(DEFAULT_USER_SETTINGS)).toEqual(DEFAULT_USER_SETTINGS);
  });

  it('fills new fields on a legacy settings.json', () => {
    const parsed = parseSettingsFile({ theme: 'light', animationSpeed: 'fast' });
    expect(parsed.theme).toBe('light');
    expect(parsed.animationSpeed).toBe('fast');
    expect(parsed.closeAnimationSpeed).toBe(DEFAULT_USER_SETTINGS.closeAnimationSpeed);
    expect(parsed.fontUi).toBe(DEFAULT_USER_SETTINGS.fontUi);
    expect(parsed.shortcuts.settings).toBe('Ctrl ,');
    expect(parsed.logsFolder).toBe('');
    expect(parsed.logFileMaxMb).toBe(10);
    expect(parsed.toolsOrderIds).toEqual([]);
    expect(parsed.proxy.mode).toBe('system');
    expect(parsed.dns.mode).toBe('system');
    expect(parsed.certificates.verifyTls).toBe(true);
    expect(parsed.certificates.clientCerts).toEqual([]);
    expect(parsed.schemaVersion).toBe(1);
  });

  it('merges partial proxy, DNS, and certificate objects', () => {
    const parsed = parseSettingsFile({
      proxy: { mode: 'http', host: '127.0.0.1', port: 8080 },
      dns: { mode: 'custom', servers: '1.1.1.1' },
      certificates: {
        verifyTls: false,
        extraCaPath: '/certs/corp.pem',
        clientCerts: [{ host: 'api.internal', certPath: 'client.pem' }],
      },
    });
    expect(parsed.proxy).toMatchObject({
      mode: 'http',
      host: '127.0.0.1',
      port: '8080',
      username: '',
    });
    expect(parsed.dns).toEqual({ mode: 'custom', servers: '1.1.1.1' });
    expect(parsed.certificates.verifyTls).toBe(false);
    expect(parsed.certificates.extraCaPath).toBe('/certs/corp.pem');
    expect(parsed.certificates.clientCerts[0]).toMatchObject({
      id: 'cert_1',
      host: 'api.internal',
      certPath: 'client.pem',
      keyPath: '',
    });
  });

  it('clamps logFileMaxMb', () => {
    expect(parseSettingsFile({ logFileMaxMb: 999 }).logFileMaxMb).toBe(50);
    expect(parseSettingsFile({ logFileMaxMb: 0 }).logFileMaxMb).toBe(1);
  });

  it('keeps current proxy host when only mode is patched', () => {
    const current = toUserSettings(
      parseSettingsFile({
        proxy: { mode: 'http', host: '10.0.0.1', port: '3128' },
      }),
    );
    const merged = mergeUserSettingsPatch(current, {
      proxy: { ...current.proxy, mode: 'socks5' },
    });
    expect(merged.proxy.mode).toBe('socks5');
    expect(merged.proxy.host).toBe('10.0.0.1');
    expect(merged.proxy.port).toBe('3128');
  });
});

describe('parseSessionFile', () => {
  it('returns defaults for empty input', () => {
    expect(parseSessionFile(null).activeRail).toBe('collections');
  });

  it('maps the legacy testing rail to services', () => {
    expect(parseSessionFile({ activeRail: 'testing' }).activeRail).toBe('services');
  });

  it('keeps sidebar visibility and the open rail', () => {
    const parsed = parseSessionFile({
      sidebarCollapsed: true,
      activeRail: 'environments',
      sidebarWidth: 280,
    });
    expect(parsed.sidebarCollapsed).toBe(true);
    expect(parsed.activeRail).toBe('environments');
    expect(parsed.sidebarWidth).toBe(280);
  });

  it('defaults empty selection sets on a legacy session.json', () => {
    const parsed = parseSessionFile({ activeRail: 'collections', groups: [] });
    expect(parsed.selection.collections.ids).toEqual([]);
    expect(parsed.selection.environments.anchorId).toBeNull();
    expect(parsed.selection.environmentNodes).toEqual({});
  });

  it('keeps persisted selection', () => {
    const parsed = parseSessionFile({
      selection: {
        collections: { ids: ['folder-auth'], anchorId: 'folder-auth' },
        environments: { ids: ['env-local', 'env-staging'], anchorId: 'env-staging' },
        environmentNodes: {
          'env-local': { ids: ['a', 'b'], anchorId: 'b', paneId: 'a' },
        },
      },
    });
    expect(parsed.selection.environments.ids).toEqual(['env-local', 'env-staging']);
    expect(parsed.selection.environmentNodes['env-local']?.paneId).toBe('a');
  });

  it('defaults tab selection on a legacy group', () => {
    const parsed = parseSessionFile({
      groups: [{ id: 'group-1', tabs: [], activeTabId: null }],
    });
    expect(parsed.groups[0]?.selectedTabIds).toEqual([]);
    expect(parsed.groups[0]?.tabAnchorId).toBeNull();
  });
});

describe('parseEnvironmentsFile', () => {
  it('seeds a list when the file is empty', () => {
    expect(parseEnvironmentsFile({}).items.length).toBeGreaterThan(0);
  });

  it('migrates legacy rows that only stored a variable count', () => {
    const parsed = parseEnvironmentsFile({
      items: [
        {
          id: 'env-local',
          name: 'Local',
          modifiedAt: '2026-01-01T00:00:00.000Z',
          variableCount: 8,
        },
      ],
      activeId: 'env-local',
      orderIds: ['env-local'],
    });
    expect(parsed.items[0]?.variables.length).toBeGreaterThan(0);
    expect(
      parsed.items[0]?.variables.some(
        (item) => item.kind !== 'folder' && item.key === 'BASE_URL',
      ),
    ).toBe(true);
  });

  it('keeps nested folders of variables', () => {
    const parsed = parseEnvironmentsFile({
      items: [
        {
          id: 'env-local',
          name: 'Local',
          modifiedAt: '2026-01-01T00:00:00.000Z',
          variables: [
            {
              kind: 'folder',
              id: 'f1',
              name: 'testdata',
              children: [{ id: 'v1', key: 'username', value: 'ada', enabled: true, secret: false }],
            },
            { id: 'v2', key: 'BASE_URL', value: 'http://localhost', enabled: true, secret: false },
          ],
        },
      ],
      activeId: 'env-local',
      orderIds: ['env-local'],
    });
    const folder = parsed.items[0]?.variables.find((item) => item.kind === 'folder');
    expect(folder?.kind).toBe('folder');
    expect(folder && folder.kind === 'folder' ? folder.children[0] : null).toMatchObject({
      key: 'username',
      value: 'ada',
    });
  });

  it('keeps an explicit empty active environment', () => {
    const parsed = parseEnvironmentsFile({
      items: [
        {
          id: 'env-local',
          name: 'Local',
          modifiedAt: '2026-01-01T00:00:00.000Z',
          variables: [],
        },
      ],
      activeId: null,
      orderIds: ['env-local'],
    });
    expect(parsed.activeId).toBeNull();
  });
});

describe('parseCollectionsFile', () => {
  it('keeps an empty collections array', () => {
    expect(parseCollectionsFile({}).collections).toEqual([]);
  });
});

describe('motionScaleForSpeed', () => {
  it('returns 0 for none', () => {
    expect(motionScaleForSpeed('none')).toBe(0);
  });

  it('makes slow a long duration scale', () => {
    expect(motionScaleForSpeed('slow')).toBe(3);
  });

  it('keeps normal slightly slower than 1x', () => {
    expect(motionScaleForSpeed('normal')).toBe(1.25);
  });
});
