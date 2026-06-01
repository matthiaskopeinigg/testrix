/**
 * Verifies logo + icon assets load in a BrowserWindow using the same protocol/preload
 * wiring as the packaged app.
 */
import electron from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { app, BrowserWindow, protocol, net } = electron;

const winUnpacked = path.resolve(
  process.argv[2] || path.join(process.cwd(), 'release', 'win-unpacked'),
);
const browserRoot = path.join(winUnpacked, 'resources', 'browser');
const preloadPath = path.join(winUnpacked, 'resources', 'preload', 'main.preload.js');

if (!fs.existsSync(path.join(winUnpacked, 'Testrix.exe'))) {
  console.error('[verify-packaged-assets] Missing Testrix.exe in', winUnpacked);
  process.exit(1);
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'testrix',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

app.whenReady().then(async () => {
  protocol.handle('testrix', (request) => {
    const url = new URL(request.url);
    let rel = decodeURIComponent(url.pathname).replace(/^\//, '');
    const filePath = path.resolve(path.join(browserRoot, rel));
    if (!filePath.startsWith(browserRoot) || !fs.existsSync(filePath)) {
      return new Response('Not Found', { status: 404 });
    }
    return net.fetch(pathToFileURL(filePath).href);
  });

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
    },
  });

  await win.loadURL('testrix://bundle/index.html');
  await new Promise((resolve) => setTimeout(resolve, 4000));

  const result = await win.webContents.executeJavaScript(`
    (async () => {
      const bridge = window.testrix;
      const logoUrl = bridge?.resolveStaticAssetUrl?.('brand/logo.svg') ?? 'missing-bridge';
      const iconUrl = bridge?.resolveStaticAssetUrl?.('icons/settings-gear.svg') ?? 'missing-bridge';

      const imgOk = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ ok: true, w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve({ ok: false, err: 'img onerror' });
        img.src = logoUrl;
      });

      let fetchOk = { ok: false, err: 'not-run' };
      try {
        const res = await fetch(iconUrl);
        const text = await res.text();
        fetchOk = { ok: res.ok, status: res.status, len: text.length };
      } catch (e) {
        fetchOk = { ok: false, err: String(e) };
      }

      let xhrOk = { ok: false, err: 'not-run' };
      try {
        xhrOk = await new Promise((resolve) => {
          const xhr = new XMLHttpRequest();
          xhr.open('GET', iconUrl);
          xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, len: xhr.responseText.length });
          xhr.onerror = () => resolve({ ok: false, err: 'xhr onerror' });
          xhr.send();
        });
      } catch (e) {
        xhrOk = { ok: false, err: String(e) };
      }

      const brandImg = document.querySelector('tx-brand-logo img, .tx-brand-logo__img');
      const brandSrc = brandImg?.getAttribute('src') ?? null;
      const brandComplete = brandImg?.complete ?? null;
      const brandNatural = brandImg ? brandImg.naturalWidth : null;

      return {
        logoUrl,
        iconUrl,
        imgOk,
        fetchOk,
        xhrOk,
        brandSrc,
        brandComplete,
        brandNatural,
        hasBridge: !!bridge?.resolveStaticAssetUrl,
      };
    })()
  `);

  console.log(JSON.stringify(result, null, 2));
  app.exit(result.imgOk.ok && result.fetchOk.ok ? 0 : 1);
});

app.on('window-all-closed', () => app.quit());
