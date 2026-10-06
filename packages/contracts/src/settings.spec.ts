import { describe, expect, it } from 'vitest';

import { parseCollectionsFile } from './config-files';
import { parseEnvironmentsFile } from './environment';
import { motionScaleForSpeed } from './motion';
import { parseSessionFile, requestViewFromTab, tabChromeFromRequestView } from './session';
import { DEFAULT_USER_SETTINGS, clampUiZoom, mergeUserSettingsPatch, nudgeUiZoom, parseSettingsFile, toUserSettings, userSettingsSchema } from './settings';

describe('userSettingsSchema', () => {
  it('parses defaults', () => {
    expect(userSettingsSchema.parse(DEFAULT_USER_SETTINGS)).toEqual(DEFAULT_USER_SETTINGS);
  });

  it('fills new fields on a legacy settings.json', () => {
    const parsed = parseSettingsFile({ theme: 'light', animationSpeed: 'fast' });
    expect(parsed.theme).toBe('light');
    expect(parsed.animationSpeed).toBe('fast');
    expect(parsed.closeAnimationSpeed).toBe(DEFAULT_USER_SETTINGS.closeAnimationSpeed);
    expect(parsed.saveMode).toBe(DEFAULT_USER_SETTINGS.saveMode);
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
    expect(parsed.defaultHeaders).toEqual(DEFAULT_USER_SETTINGS.defaultHeaders);
    expect(parsed.placeholderEmailDomain).toBe('example.test');
    expect(parsed.defaultApiKeyHeader).toBe('X-Api-Key');
    expect(parsed.uiZoom).toBe(1);
    expect(parsed.androidEmulatorActivated).toBe(false);
    expect(parsed.androidSdkRoot).toBe('');
    expect(parsed.androidSdkLicenseAcceptedAt).toBeNull();
    expect(parsed.androidSystemImageTag).toBe('google_apis');
    expect(parsed.androidSystemImageApi).toBe(34);
    expect(parsed.androidSystemImageAbi).toBe('');
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
    expect(parseSessionFile(null).flowInspectorWidth).toBe(300);
    expect(parseSessionFile(null).flowInspectorWideWidth).toBe(460);
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

  it('keeps a folder tab section', () => {
    const parsed = parseSessionFile({
      groups: [
        {
          id: 'group-1',
          activeTabId: 't1',
          tabs: [
            {
              id: 't1',
              nodeId: 'folder-1',
              kind: 'collection-folder',
              title: 'Auth',
              url: '',
              status: null,
              folderSection: 'scripts',
            },
          ],
        },
      ],
    });
    expect(parsed.groups[0]?.tabs[0]?.folderSection).toBe('scripts');
  });

  it('keeps folder script and docs chrome', () => {
    const parsed = parseSessionFile({
      groups: [
        {
          id: 'group-1',
          activeTabId: 't1',
          tabs: [
            {
              id: 't1',
              nodeId: 'folder-1',
              kind: 'collection-folder',
              title: 'Auth',
              url: '',
              status: null,
              folderSection: 'docs',
              folderScriptPane: 'post',
              folderDocsMode: 'preview',
            },
          ],
        },
      ],
    });
    expect(parsed.groups[0]?.tabs[0]).toMatchObject({
      folderSection: 'docs',
      folderScriptPane: 'post',
      folderDocsMode: 'preview',
    });
  });

  it('keeps the plantuml view for a diagram tab', () => {
    const parsed = parseSessionFile({
      groups: [
        {
          id: 'group-1',
          activeTabId: 't1',
          tabs: [
            {
              id: 't1',
              nodeId: 'diagram-1',
              kind: 'plantuml',
              title: 'Login',
              url: '',
              status: null,
              plantumlView: 'source',
              plantumlPreviewZoom: 1.4,
              plantumlPreviewPanX: 12,
              plantumlPreviewPanY: -40,
              plantumlGridZoom: 0.8,
              plantumlGridPanX: 20,
              plantumlGridPanY: 64,
              plantumlBuilderWidth: 480,
              plantumlBuilderCollapsed: true,
            },
          ],
        },
      ],
    });
    expect(parsed.groups[0]?.tabs[0]).toMatchObject({
      plantumlView: 'source',
      plantumlPreviewZoom: 1.4,
      plantumlPreviewPanX: 12,
      plantumlPreviewPanY: -40,
      plantumlGridZoom: 0.8,
      plantumlGridPanX: 20,
      plantumlGridPanY: 64,
      plantumlBuilderWidth: 480,
      plantumlBuilderCollapsed: true,
    });
  });

  it('keeps the history rail and request editor chrome', () => {
    const parsed = parseSessionFile({
      activeRail: 'history',
      requestRunsById: {
        'http-1': [
          {
            id: 'run-1',
            at: '2026-09-17T00:00:00.000Z',
            method: 'GET',
            url: 'https://api.local',
            status: 200,
            statusText: 'OK',
            durationMs: 12,
            sizeLabel: '2 B',
            error: null,
            requestHeaders: [],
            requestBody: '',
            responseHeaders: [],
            responseBody: '{}',
          },
        ],
      },
      groups: [
        {
          id: 'group-1',
          activeTabId: 't1',
          tabs: [
            {
              id: 't1',
              nodeId: 'http-1',
              kind: 'http',
              title: 'Login',
              url: 'https://api.local',
              status: 200,
              requestSection: 'body',
              requestScriptPane: 'post',
              requestDocsMode: 'write',
              requestSplitRatio: 0.4,
              requestResponseTab: 'runs',
            },
          ],
        },
      ],
    });
    expect(parsed.activeRail).toBe('history');
    expect(parsed.requestRunsById['http-1']?.[0]?.id).toBe('run-1');
    expect(parsed.groups[0]?.tabs[0]).toMatchObject({
      requestSection: 'body',
      requestScriptPane: 'post',
      requestDocsMode: 'write',
      requestSplitRatio: 0.4,
      requestResponseTab: 'runs',
    });
  });

  it('keeps request editor chrome after the tab is closed', () => {
    const parsed = parseSessionFile({
      requestViewsByNodeId: {
        'http-1': {
          section: 'headers',
          scriptPane: 'post',
          docsMode: 'preview',
          splitRatio: 0.62,
          responseTab: 'timeline',
          responseHidden: true,
          snippetLang: 'fetch',
        },
        'ws-1': { websocketSection: 'auth' },
      },
    });
    expect(parsed.requestViewsByNodeId['http-1']).toMatchObject({
      section: 'headers',
      scriptPane: 'post',
      docsMode: 'preview',
      splitRatio: 0.62,
      responseTab: 'timeline',
      responseHidden: true,
      snippetLang: 'fetch',
    });
    expect(parsed.requestViewsByNodeId['ws-1']?.websocketSection).toBe('auth');
  });

  it('round-trips request chrome between a tab and a saved view', () => {
    const view = requestViewFromTab({
      requestSection: 'scripts',
      requestScriptPane: 'pre',
      requestResponseHidden: false,
      requestSnippetLang: 'httpie',
      websocketSection: 'headers',
    });
    expect(tabChromeFromRequestView(view)).toEqual({
      requestSection: 'scripts',
      requestScriptPane: 'pre',
      requestResponseHidden: false,
      requestSnippetLang: 'httpie',
      websocketSection: 'headers',
    });
  });
});

describe('parseEnvironmentsFile', () => {
  it('starts empty when the file has no items', () => {
    expect(parseEnvironmentsFile({}).items).toEqual([]);
    expect(parseEnvironmentsFile({}).activeId).toBeNull();
  });

  it('keeps an explicit empty environments list', () => {
    const parsed = parseEnvironmentsFile({
      items: [],
      activeId: null,
      orderIds: [],
    });
    expect(parsed.items).toEqual([]);
    expect(parsed.activeId).toBeNull();
  });

  it('drops an unmodified seed environment that only stored a count', () => {
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
    expect(parsed.items).toEqual([]);
    expect(parsed.activeId).toBeNull();
  });

  it('drops unmodified first-run seeded variables and the empty shell', () => {
    const parsed = parseEnvironmentsFile({
      items: [
        {
          id: 'env-ci',
          name: 'CI',
          modifiedAt: '2026-01-01T00:00:00.000Z',
          variables: [
            {
              kind: 'folder',
              id: 'env-ci-folder-testdata',
              name: 'testdata',
              children: [
                {
                  id: 'env-ci-testdata-username',
                  key: 'username',
                  value: 'ci-user',
                  enabled: true,
                  secret: false,
                },
                {
                  id: 'env-ci-testdata-pw',
                  key: 'pw',
                  value: 'ci-secret',
                  enabled: true,
                  secret: true,
                },
              ],
            },
            {
              kind: 'folder',
              id: 'env-ci-folder-url',
              name: 'url',
              children: [
                {
                  id: 'env-ci-url-web',
                  key: 'web',
                  value: 'http://127.0.0.1:4100',
                  enabled: true,
                  secret: false,
                },
              ],
            },
            { id: 'env-ci-base-url', key: 'BASE_URL', value: 'http://127.0.0.1:4100', enabled: true, secret: false },
            { id: 'env-ci-api-token', key: 'API_TOKEN', value: 'ci-token', enabled: true, secret: true },
            { id: 'env-ci-tenant-id', key: 'TENANT_ID', value: 'ci', enabled: true, secret: false },
            { id: 'env-ci-log-level', key: 'LOG_LEVEL', value: 'error', enabled: true, secret: false },
          ],
        },
      ],
      activeId: 'env-ci',
      orderIds: ['env-ci'],
    });
    expect(parsed.items).toEqual([]);
    expect(parsed.activeId).toBeNull();
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
          id: 'env-custom',
          name: 'Local',
          modifiedAt: '2026-01-01T00:00:00.000Z',
          variables: [],
        },
      ],
      activeId: null,
      orderIds: ['env-custom'],
    });
    expect(parsed.items).toHaveLength(1);
    expect(parsed.activeId).toBeNull();
  });
});

describe('parseCollectionsFile', () => {
  it('keeps an empty collections array', () => {
    expect(parseCollectionsFile({}).collections).toEqual([]);
  });

  it('keeps valid roots when one sibling fails schema', () => {
    const file = parseCollectionsFile({
      collections: [
        {
          kind: 'http',
          id: 'http_ok',
          name: 'Ok',
          modifiedAt: '2020-01-01T00:00:00.000Z',
          method: 'GET',
          status: null,
        },
        { kind: 'http', id: 'bad' },
      ],
    });
    expect(file.collections).toHaveLength(1);
    expect(file.collections[0]?.id).toBe('http_ok');
  });
});

describe('clampUiZoom', () => {
  it('snaps and clamps zoom factors', () => {
    expect(clampUiZoom(undefined)).toBe(1);
    expect(clampUiZoom(1.12)).toBe(1.1);
    expect(clampUiZoom(0.2)).toBe(0.75);
    expect(clampUiZoom(3)).toBe(1.5);
    expect(nudgeUiZoom(1, 1)).toBe(1.05);
    expect(nudgeUiZoom(0.75, -1)).toBe(0.75);
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
