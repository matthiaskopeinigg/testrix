const path = require('path');
const fs = require('fs');
const { app } = require('electron');

function fileExists(candidate) {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

/** App window icon path for the E2E runner BrowserWindow. */
function resolveWindowIcon() {
  if (app.isPackaged) {
    const packagedIco = path.join(process.resourcesPath, 'icon.ico');
    if (fileExists(packagedIco)) {
      return packagedIco;
    }
    const packagedPng = path.join(process.resourcesPath, 'icon.png');
    if (fileExists(packagedPng)) {
      return packagedPng;
    }
  }

  const roots = [...new Set([process.cwd(), app.getAppPath()])];
  for (const root of roots) {
    if (process.platform === 'win32') {
      const ico = path.join(root, 'build', 'icons', 'icon.ico');
      if (fileExists(ico)) {
        return ico;
      }
    }
    const png = path.join(root, 'build', 'icons', 'icon-1024.png');
    if (fileExists(png)) {
      return png;
    }
  }

  return undefined;
}

function resolvePngWindowIcon() {
  return resolveWindowIcon();
}

module.exports = { resolveWindowIcon, resolvePngWindowIcon };
