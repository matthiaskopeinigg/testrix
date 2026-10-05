import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import path from 'node:path';

/** Must match `UPDATE_REPOSITORY` in `@testrix/contracts`. */
const UPDATE_REPOSITORY = 'matthiaskopeinigg/testrix';

const INSTALLER = Buffer.alloc(48 * 1024, 7);

export interface LocalUpdateFeed {
  readonly origin: string;
  readonly publicKey: string;
  readonly version: string;
  readonly installer: Buffer;
  close(): Promise<void>;
}

/**
 * GitHub-shaped loopback feed: signed `stable.json` / `beta.json` plus a tiny installer.
 */
export async function startLocalUpdateFeed(version = '99.0.0'): Promise<LocalUpdateFeed> {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const key = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  const files = new Map<string, { body: Buffer | string; type: string }>();
  const server = await listen(files);
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Update feed did not bind a TCP port.');
  const origin = `http://127.0.0.1:${address.port}`;
  const manifestPath = `/${UPDATE_REPOSITORY}/releases/download/updates`;
  for (const channel of ['stable', 'beta'] as const) {
    const text = JSON.stringify({
      version,
      channel,
      releasedAt: '2026-09-01T10:00:00.000Z',
      notes: '- E2E feed',
      url: `${origin}/Testrix.exe`,
      sha512: createHash('sha512').update(INSTALLER).digest('base64'),
      size: INSTALLER.length,
    });
    const signature = sign(null, Buffer.from(text, 'utf8'), privateKey).toString('base64');
    files.set(`${manifestPath}/${channel}.json`, { body: text, type: 'application/json' });
    files.set(`${manifestPath}/${channel}.json.sig`, { body: signature, type: 'text/plain' });
  }
  files.set('/Testrix.exe', { body: INSTALLER, type: 'application/octet-stream' });
  return {
    origin,
    publicKey: key,
    version,
    installer: INSTALLER,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

/** Writes a settings file so Settings opens past the wizard with update prefs applied. */
export async function seedUpdateSettings(
  userData: string,
  updates: { readonly autoCheck?: boolean; readonly autoDownload?: boolean; readonly channel?: 'stable' | 'beta' },
): Promise<void> {
  const dir = path.join(userData, 'configs');
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, 'settings.json'),
    `${JSON.stringify({
      settingsWizardCompleted: true,
      updates: {
        channel: updates.channel ?? 'stable',
        autoCheck: updates.autoCheck ?? false,
        autoDownload: updates.autoDownload ?? false,
      },
    }, null, 2)}\n`,
    'utf8',
  );
}

/** Serves signed manifests and the installer from an ephemeral loopback port. */
function listen(files: Map<string, { body: Buffer | string; type: string }>): Promise<Server> {
  const server = createServer((req, res) => {
    const route = files.get(req.url?.split('?')[0] ?? '');
    if (!route) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': route.type, 'content-length': Buffer.byteLength(route.body) });
    res.end(route.body);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}
