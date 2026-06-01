/**
 * Smoke-test the testrix:// browser protocol serves brand + icon assets.
 */
import { app, BrowserWindow, protocol, net } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const browserRoot = path.resolve(
  process.argv[2] || path.join(process.cwd(), 'release', 'win-unpacked', 'resources', 'browser'),
);

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

  const logoUrl = new URL('brand/logo.svg', 'testrix://bundle/').href;
  const iconUrl = new URL('icons/settings.svg', 'testrix://bundle/').href;

  const fetchLogo = await net.fetch(logoUrl);
  const fetchIcon = await net.fetch(iconUrl);
  console.log('fetch logo', fetchLogo.status, fetchLogo.headers.get('content-type'));
  console.log('fetch icon', fetchIcon.status, fetchIcon.headers.get('content-type'));

  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true } });
  await win.loadURL(
    `data:text/html,<!doctype html><img id="logo" /><img id="icon" /><script>
      Promise.all([
        new Promise((resolve, reject) => {
          const img = document.getElementById('logo');
          img.onload = () => resolve('logo ok ' + img.naturalWidth);
          img.onerror = () => reject(new Error('logo img error'));
          img.src = ${JSON.stringify(logoUrl)};
        }),
        fetch(${JSON.stringify(iconUrl)}).then(r => r.text()).then(t => 'icon chars ' + t.length)
      ]).then(r => { document.title = r.join(' | '); }).catch(e => { document.title = 'ERR:' + e.message; });
    </script>`,
  );

  await new Promise((r) => setTimeout(r, 1500));
  console.log('renderer title:', await win.webContents.getTitle());
  app.exit(0);
});

app.on('window-all-closed', () => app.quit());
