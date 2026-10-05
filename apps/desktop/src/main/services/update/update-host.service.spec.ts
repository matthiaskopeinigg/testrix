import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_UPDATE_PREFS, type UpdatePrefs, type UpdateStatus } from '@testrix/contracts';

import { readArgValue, readDevUpdateFeed, resolveUpdateSupport, UpdateHost, type UpdateHostDeps } from './update-host.service';

const REPO = 'acme/testrix';
const MANIFEST_URL = `https://github.com/${REPO}/releases/download/updates/stable.json`;
const INSTALLER_URL = `https://github.com/${REPO}/releases/download/v1.1.0/Testrix.exe`;
const CDN_URL = 'https://objects.githubusercontent.com/blob/setup.exe';

const INSTALLER = Buffer.from('MZ fake installer payload '.repeat(40));

function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    privateKey,
  };
}

const KEYS = keyPair();

function manifestText(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: '1.1.0',
    channel: 'stable',
    releasedAt: '2026-09-01T10:00:00.000Z',
    notes: '- Faster sync',
    url: INSTALLER_URL,
    sha512: createHash('sha512').update(INSTALLER).digest('base64'),
    size: INSTALLER.length,
    ...overrides,
  });
}

function signatureOf(text: string, privateKey = KEYS.privateKey): string {
  return sign(null, Buffer.from(text, 'utf8'), privateKey).toString('base64');
}

interface Routes {
  manifest?: string | number;
  signature?: string;
  installer?: (init?: RequestInit) => Response;
}

function fakeFetch(routes: Routes) {
  return vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    if (url === MANIFEST_URL) {
      if (typeof routes.manifest === 'number')
        return new Response('', { status: routes.manifest });
      return new Response(routes.manifest ?? '', { status: 200 });
    }
    if (url === `${MANIFEST_URL}.sig`)
      return new Response(routes.signature ?? '', { status: routes.signature ? 200 : 404 });
    if (url === INSTALLER_URL)
      return new Response(null, { status: 302, headers: { location: CDN_URL } });
    if (url === CDN_URL && routes.installer)
      return routes.installer(init);
    return new Response('', { status: 404 });
  });
}

describe('UpdateHost', () => {
  let dir: string;
  let prefs: UpdatePrefs;
  let published: UpdateStatus[];

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'testrix-update-'));
    prefs = { ...DEFAULT_UPDATE_PREFS, autoDownload: false };
    published = [];
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function host(overrides: Partial<UpdateHostDeps> = {}): UpdateHost {
    return new UpdateHost({
      currentVersion: '1.0.0',
      updatesDir: dir,
      installDir: 'C:\\Apps\\Testrix',
      unsupportedReason: null,
      publicKey: KEYS.publicKey,
      repository: REPO,
      readPrefs: () => prefs,
      writePrefs: async (next) => {
        prefs = next;
      },
      publish: (status) => published.push(status),
      fetch: fakeFetch({}),
      launchInstaller: vi.fn(),
      quit: vi.fn(),
      pid: 4242,
      updatedFrom: null,
      now: () => new Date('2026-09-02T00:00:00.000Z'),
      ...overrides,
    });
  }

  it('offers a release whose manifest is signed with the release key', async () => {
    // Arrange
    const text = manifestText();
    const updates = host({ fetch: fakeFetch({ manifest: text, signature: signatureOf(text) }) });

    // Act
    const status = await updates.check();

    // Assert
    expect(status.phase).toBe('available');
    expect(status.release?.version).toBe('1.1.0');
    expect(status.lastCheckedAt).toBe('2026-09-02T00:00:00.000Z');
  });

  it('ignores a manifest that was changed after signing', async () => {
    // Arrange
    const text = manifestText();
    const tampered = text.replace(INSTALLER_URL, 'https://github.com/evil/x/releases/download/v1/a.exe');
    const updates = host({ fetch: fakeFetch({ manifest: tampered, signature: signatureOf(text) }) });

    // Act
    const status = await updates.check();

    // Assert
    expect(status.phase).toBe('error');
    expect(status.error).toContain('signature is invalid');
  });

  it('ignores a manifest signed with a different key', async () => {
    // Arrange
    const text = manifestText();
    const updates = host({ fetch: fakeFetch({ manifest: text, signature: signatureOf(text, keyPair().privateKey) }) });

    // Act
    const status = await updates.check();

    // Assert
    expect(status.phase).toBe('error');
  });

  it('treats an older manifest as up to date instead of downgrading', async () => {
    // Arrange
    const text = manifestText({ version: '0.9.0' });
    const updates = host({ fetch: fakeFetch({ manifest: text, signature: signatureOf(text) }) });

    // Act
    const status = await updates.check();

    // Assert
    expect(status.phase).toBe('up-to-date');
    expect(status.release).toBeNull();
  });

  it('treats a channel without any release yet as up to date', async () => {
    // Arrange
    const updates = host({ fetch: fakeFetch({ manifest: 404 }) });

    // Act
    const status = await updates.check();

    // Assert
    expect(status.phase).toBe('up-to-date');
  });

  it('does not start a download when auto-download is off', async () => {
    const text = manifestText();
    const fetch = fakeFetch({
      manifest: text,
      signature: signatureOf(text),
      installer: () => new Response(INSTALLER, { status: 200 }),
    });
    const updates = host({ fetch });

    const status = await updates.check();

    expect(status.phase).toBe('available');
    expect(published.some((entry) => entry.phase === 'downloading')).toBe(false);
    expect(fetch).not.toHaveBeenCalledWith(INSTALLER_URL, expect.anything());
    expect(fetch).not.toHaveBeenCalledWith(CDN_URL, expect.anything());
  });

  it('never contacts GitHub from a build that cannot update itself', async () => {
    // Arrange
    const fetch = fakeFetch({});
    const updates = host({ installDir: null, unsupportedReason: 'Development builds do not update themselves.', fetch });

    // Act
    const status = await updates.check();

    // Assert
    expect(status.isSupported).toBe(false);
    expect(status.phase).toBe('idle');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('downloads and verifies the installer through an allowed redirect', async () => {
    // Arrange
    const text = manifestText();
    const updates = host({
      fetch: fakeFetch({
        manifest: text,
        signature: signatureOf(text),
        installer: () => new Response(INSTALLER, { status: 200 }),
      }),
    });
    await updates.check();

    // Act
    const status = await updates.download();

    // Assert
    expect(status.phase).toBe('ready');
    expect(await readFile(path.join(dir, '1.1.0', 'Testrix.exe'))).toEqual(INSTALLER);
    expect(published.some((entry) => entry.phase === 'downloading' && entry.percent === 100)).toBe(true);
  });

  it('resolves an updatesDir that walks through a missing parent segment', async () => {
    const text = manifestText();
    const updates = host({
      updatesDir: path.join(dir, 'profile-missing', '..', 'cache'),
      fetch: fakeFetch({
        manifest: text,
        signature: signatureOf(text),
        installer: () => new Response(INSTALLER, { status: 200 }),
      }),
    });
    await updates.check();

    const status = await updates.download();

    expect(status.phase).toBe('ready');
    expect(await readFile(path.join(dir, 'cache', '1.1.0', 'Testrix.exe'))).toEqual(INSTALLER);
  });

  it('discards an installer whose hash does not match the manifest', async () => {
    // Arrange
    const text = manifestText();
    const corrupt = Buffer.from(INSTALLER);
    corrupt[10] = 0;
    const updates = host({
      fetch: fakeFetch({
        manifest: text,
        signature: signatureOf(text),
        installer: () => new Response(corrupt, { status: 200 }),
      }),
    });
    await updates.check();

    // Act
    const status = await updates.download();

    // Assert
    expect(status.phase).toBe('error');
    expect(status.error).toContain('integrity check');
    expect(existsSync(path.join(dir, '1.1.0', 'Testrix.exe'))).toBe(false);
    expect(existsSync(path.join(dir, '1.1.0', 'Testrix.exe.partial'))).toBe(false);
  });

  it('resumes a partial download with a range request', async () => {
    // Arrange
    const text = manifestText();
    const half = 300;
    await mkdir(path.join(dir, '1.1.0'), { recursive: true });
    await writeFile(path.join(dir, '1.1.0', 'Testrix.exe.partial'), INSTALLER.subarray(0, half));
    const installer = vi.fn((init?: RequestInit) => {
      const range = new Headers(init?.headers).get('range');
      return range === `bytes=${half}-`
        ? new Response(INSTALLER.subarray(half), { status: 206 })
        : new Response(INSTALLER, { status: 200 });
    });
    const updates = host({ fetch: fakeFetch({ manifest: text, signature: signatureOf(text), installer }) });
    await updates.check();

    // Act
    const status = await updates.download();

    // Assert
    expect(status.phase).toBe('ready');
    expect(new Headers(installer.mock.calls[0]?.[0]?.headers).get('range')).toBe(`bytes=${half}-`);
    expect(await readFile(path.join(dir, '1.1.0', 'Testrix.exe'))).toEqual(INSTALLER);
  });

  it('blocks a redirect that leaves the allowed hosts', async () => {
    // Arrange
    const fetch = vi.fn(async (url: string): Promise<Response> => {
      if (url === MANIFEST_URL)
        return new Response(null, { status: 302, headers: { location: 'https://example.com/stable.json' } });
      return new Response('', { status: 404 });
    });
    const updates = host({ fetch });

    // Act
    const status = await updates.check();

    // Assert
    expect(status.phase).toBe('error');
    expect(status.error).toContain('outside GitHub');
  });

  it('hands over to Setup with the install folder and quits', async () => {
    // Arrange
    const text = manifestText();
    const launchInstaller = vi.fn();
    const quit = vi.fn();
    const updates = host({
      launchInstaller,
      quit,
      fetch: fakeFetch({
        manifest: text,
        signature: signatureOf(text),
        installer: () => new Response(INSTALLER, { status: 200 }),
      }),
    });
    await updates.check();
    await updates.download();

    // Act
    const isStarted = await updates.install();

    // Assert
    expect(isStarted).toBe(true);
    expect(quit).toHaveBeenCalledOnce();
    const [exe, args] = launchInstaller.mock.calls[0] as [string, string[]];
    expect(exe).toBe(path.join(dir, '1.1.0', 'Testrix.exe'));
    expect(args).toEqual(
      expect.arrayContaining([
        '--silent-update',
        '--wait-pid=4242',
        `--payload-file=${exe}`,
        '--relaunch',
        '--install-dir=C:\\Apps\\Testrix',
        '--updated-from=1.0.0',
      ]),
    );
  });

  it('stays open when Setup fails to start', async () => {
    const text = manifestText();
    const quit = vi.fn();
    const updates = host({
      launchInstaller: () => Promise.reject(new Error('spawn ENOENT')),
      quit,
      fetch: fakeFetch({
        manifest: text,
        signature: signatureOf(text),
        installer: () => new Response(INSTALLER, { status: 200 }),
      }),
    });
    await updates.check();
    await updates.download();

    const isStarted = await updates.install();

    expect(isStarted).toBe(false);
    expect(quit).not.toHaveBeenCalled();
    expect(updates.status().phase).toBe('error');
  });

  it('shows the notes of the version it just updated to', async () => {
    // Arrange
    await writeFile(
      path.join(dir, 'installed.json'),
      JSON.stringify({ version: '1.0.0', notes: '- New', releasedAt: '2026-09-01T10:00:00.000Z', size: 1 }),
    );
    const updates = host({ updatedFrom: '0.9.0' });

    // Act
    await updates.start();
    updates.stop();

    // Assert
    expect(updates.status().updatedFrom).toBe('0.9.0');
    expect(updates.status().release?.notes).toBe('- New');
  });

  it('skips a scheduled check when GitHub was contacted within the interval', async () => {
    const text = manifestText();
    const fetch = fakeFetch({ manifest: text, signature: signatureOf(text) });
    const updates = host({ fetch });

    await updates.check();
    const calls = fetch.mock.calls.length;
    const status = await updates.check(false);

    expect(status.phase).toBe('available');
    expect(fetch.mock.calls.length).toBe(calls);
  });

  it('reuses a cached signed manifest when GitHub rate-limits the next check', async () => {
    const text = manifestText();
    const fetch = vi.fn(async (url: string): Promise<Response> => {
      if (fetch.mock.calls.length > 2)
        return new Response('', { status: 429, headers: { 'retry-after': '120' } });
      if (url === MANIFEST_URL)
        return new Response(text, { status: 200, headers: { etag: '"v1"' } });
      if (url === `${MANIFEST_URL}.sig`)
        return new Response(signatureOf(text), { status: 200 });
      return new Response('', { status: 404 });
    });
    const updates = host({ fetch });
    await updates.check();

    const status = await updates.check();

    expect(status.phase).toBe('available');
    expect(status.release?.version).toBe('1.1.0');
    expect(status.error).toBeNull();
  });

  it('explains a rate limit when there is no cached manifest', async () => {
    const fetch = vi.fn(async () => new Response('', { status: 429, headers: { 'retry-after': '120' } }));
    const updates = host({ fetch });

    const status = await updates.check();

    expect(status.phase).toBe('error');
    expect(status.error).toContain('rate-limited');
    expect(await updates.check()).toMatchObject({ phase: 'error' });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('uses If-None-Match and a 304 without downloading the signature again', async () => {
    const text = manifestText();
    const fetch = vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
      if (url === MANIFEST_URL) {
        const match = new Headers(init?.headers).get('if-none-match');
        if (match === '"v1"')
          return new Response(null, { status: 304 });
        return new Response(text, { status: 200, headers: { etag: '"v1"' } });
      }
      if (url === `${MANIFEST_URL}.sig`)
        return new Response(signatureOf(text), { status: 200 });
      return new Response('', { status: 404 });
    });
    const updates = host({ fetch });
    await updates.check();
    fetch.mockClear();

    const status = await updates.check();

    expect(status.phase).toBe('available');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe(MANIFEST_URL);
  });

  it('sends a Testrix User-Agent on GitHub requests', async () => {
    const text = manifestText();
    const fetch = fakeFetch({ manifest: text, signature: signatureOf(text) });
    const updates = host({ fetch });

    await updates.check();

    const headers = new Headers(fetch.mock.calls[0]?.[1]?.headers);
    expect(headers.get('user-agent')).toBe(`Testrix/1.0.0 (+https://github.com/${REPO})`);
  });

  it('re-checks when the effective channel changes', async () => {
    // Arrange
    const fetch = fakeFetch({ manifest: 404 });
    const updates = host({ fetch });

    // Act
    const status = await updates.setPrefs({ channel: 'beta' });

    // Assert
    expect(status.channel).toBe('beta');
    expect(prefs.channel).toBe('beta');
    expect(fetch).toHaveBeenCalledWith(
      `https://github.com/${REPO}/releases/download/updates/beta.json`,
      expect.anything(),
    );
  });
});

describe('resolveUpdateSupport', () => {
  const base = {
    platform: 'win32' as const,
    isPackaged: true,
    execPath: 'C:\\Apps\\Testrix\\Testrix.exe',
    env: {},
    readFile: () => '{"scope":"user"}',
  };

  it('supports an installed Windows build', () => {
    expect(resolveUpdateSupport(base)).toEqual({ installDir: 'C:\\Apps\\Testrix', reason: null });
  });

  it('skips dev, preview, portable and non-Windows builds', () => {
    expect(resolveUpdateSupport({ ...base, isPackaged: false }).reason).toContain('Development');
    expect(resolveUpdateSupport({ ...base, env: { TESTRIX_PREVIEW: '1' } }).reason).toContain('Preview');
    expect(resolveUpdateSupport({ ...base, readFile: () => null }).reason).toContain('Testrix');
    expect(resolveUpdateSupport({ ...base, readFile: () => '{"scope": "machine"}' }).reason).toContain('all users');
    expect(resolveUpdateSupport({ ...base, platform: 'linux' }).reason).toContain('Windows');
  });
});

describe('readArgValue', () => {
  it('reads a --name=value argument', () => {
    expect(readArgValue(['app', '--updated-from=1.2.3'], 'updated-from')).toBe('1.2.3');
    expect(readArgValue(['app'], 'updated-from')).toBeNull();
  });
});

describe('readDevUpdateFeed', () => {
  const env = {
    TESTRIX_UPDATE_FEED: 'http://127.0.0.1:4173',
    TESTRIX_UPDATE_PUBLIC_KEY: 'pub',
    TESTRIX_UPDATE_INSTALL_DIR: 'C:\\tmp\\install',
  };

  it('reads a loopback feed only for unpackaged builds', () => {
    expect(readDevUpdateFeed(env, false)).toEqual({
      origin: 'http://127.0.0.1:4173',
      publicKey: 'pub',
      installDir: 'C:\\tmp\\install',
      profileDir: null,
      setupMain: null,
    });
    expect(readDevUpdateFeed(env, true)).toBeNull();
    expect(readDevUpdateFeed({ ...env, TESTRIX_UPDATE_FEED: 'ftp://x' }, false)).toBeNull();
    expect(
      readDevUpdateFeed(
        { ...env, TESTRIX_UPDATE_FEED: 'ftp://x' },
        false,
        {
          readFile: () =>
            JSON.stringify({
              origin: 'http://127.0.0.1:1',
              publicKey: 'other',
              installDir: 'C:\\other',
            }),
          discoveryPath: 'ignored.json',
        },
      ),
    ).toBeNull();
  });

  it('reads the local discovery file when env is unset, and ignores a packaged build', () => {
    const discovery = JSON.stringify({
      origin: 'http://127.0.0.1:4173',
      publicKey: 'pub',
      installDir: 'C:\\tmp\\install',
      profileDir: 'C:\\tmp\\profile',
      setupMain: 'C:\\repo\\apps\\setup\\dist\\main.cjs',
    });
    const readFile = (file: string) => (file.endsWith('testrix-local-releases.json') ? discovery : null);

    expect(readDevUpdateFeed({}, false, { readFile, discoveryPath: 'C:\\tmp\\testrix-local-releases.json' })).toEqual({
      origin: 'http://127.0.0.1:4173',
      publicKey: 'pub',
      installDir: 'C:\\tmp\\install',
      profileDir: 'C:\\tmp\\profile',
      setupMain: 'C:\\repo\\apps\\setup\\dist\\main.cjs',
    });
    expect(readDevUpdateFeed({}, true, { readFile, discoveryPath: 'C:\\tmp\\testrix-local-releases.json' })).toBeNull();
    expect(readDevUpdateFeed({}, false, { readFile: () => '{', discoveryPath: 'bad.json' })).toBeNull();
    expect(readDevUpdateFeed({}, false, { readFile: () => null, discoveryPath: 'missing.json' })).toBeNull();
  });

  it('prefers environment variables over the discovery file', () => {
    const readFile = () =>
      JSON.stringify({
        origin: 'http://127.0.0.1:1',
        publicKey: 'other',
        installDir: 'C:\\other',
      });

    expect(readDevUpdateFeed(env, false, { readFile, discoveryPath: 'ignored.json' })?.origin).toBe(
      'http://127.0.0.1:4173',
    );
  });
});

describe('UpdateHost against a loopback feed', () => {
  it('checks and downloads a locally signed installer over HTTP', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'testrix-update-live-'));
    const keys = keyPair();
    const files = new Map<string, { body: Buffer | string; type: string }>();
    const server = createServer((req, res) => {
      const route = files.get(req.url?.split('?')[0] ?? '');
      if (!route) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': route.type });
      res.end(route.body);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const text = JSON.stringify({
      version: '1.1.0',
      channel: 'stable',
      releasedAt: '2026-09-01T10:00:00.000Z',
      notes: '- Local feed',
      url: `${origin}/Testrix.exe`,
      sha512: createHash('sha512').update(INSTALLER).digest('base64'),
      size: INSTALLER.length,
    });
    files.set('/stable.json', { body: text, type: 'application/json' });
    files.set('/stable.json.sig', { body: signatureOf(text, keys.privateKey), type: 'text/plain' });
    files.set('/Testrix.exe', { body: INSTALLER, type: 'application/octet-stream' });
    try {
      const updates = new UpdateHost({
        currentVersion: '1.0.0',
        updatesDir: dir,
        installDir: path.join(dir, 'install'),
        unsupportedReason: null,
        publicKey: keys.publicKey,
        repository: REPO,
        manifestUrl: () => `${origin}/stable.json`,
        isAllowedUrl: (url) => url.startsWith(`${origin}/`),
        readPrefs: () => ({ ...DEFAULT_UPDATE_PREFS, autoDownload: false }),
        writePrefs: async () => undefined,
        publish: () => undefined,
        fetch,
        launchInstaller: vi.fn(),
        quit: vi.fn(),
        pid: 1,
        updatedFrom: null,
      });
      expect((await updates.check()).phase).toBe('available');
      expect((await updates.download()).phase).toBe('ready');
      expect(await readFile(path.join(dir, '1.1.0', 'Testrix.exe'))).toEqual(INSTALLER);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(dir, { recursive: true, force: true });
    }
  });
});
