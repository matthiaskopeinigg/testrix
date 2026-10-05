import { BrowserWindow, globalShortcut, screen } from 'electron';
import {
  findDeviceNodeAtPoint,
  flattenDeviceNodes,
  formatDeviceSelector,
  isPickableDeviceNode,
  parseDeviceHierarchy,
  type DeviceUiNode,
} from '@testrix/contracts';
import { applyWindowIcon, windowIconOption } from '@testrix/electron-core';

import { AdbClient } from './adb-client';
import type { AndroidToolchainHost } from './android-toolchain.service';
import { findEmulatorClientBounds, mapDeviceDisplayRect, watchEmulatorClientBounds } from './emulator-window';

export interface DevicePickResult {
  readonly ok: boolean;
  readonly selector?: string;
  readonly cancelled?: boolean;
  readonly error?: string | null;
}

interface PickHit {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly selector: string;
}

interface PickPageResult {
  readonly kind: 'click' | 'cancel' | 'error';
  readonly selector?: string;
  readonly x?: number;
  readonly y?: number;
  readonly error?: string;
}

const PICK_TIMEOUT_MS = 5 * 60_000;

/**
 * Picks a device selector by overlaying the live emulator window (hierarchy
 * highlights on the emulator itself).
 */
export async function pickDeviceSelector(options: {
  readonly android: AndroidToolchainHost;
  readonly preferredSerial?: string;
  /** When true, never auto-start the emulator — fail if it is not already up. */
  readonly requireRunning?: boolean;
}): Promise<DevicePickResult> {
  const adbPath = options.android.adbBinary();
  if (!adbPath)
    return { ok: false, error: 'Activate Android tools before picking a device selector.' };

  let client = await findEmulatorClientBounds();
  if (!client) {
    if (options.requireRunning)
      return {
        ok: false,
        error:
          'Start the emulator before picking. Leave the window visible (not minimized), then Pick again.',
      };
    const ready = await options.android.ensureEmulatorForPick();
    if (!ready.ok)
      return {
        ok: false,
        error: ready.error || 'The emulator needs to be running before you can pick a control.',
      };
    for (let attempt = 0; attempt < 24 && !client; attempt += 1) {
      await sleep(500);
      client = await findEmulatorClientBounds();
    }
  }
  if (!client)
    return {
      ok: false,
      error:
        'Could not attach to the emulator window. Leave the emulator visible (not minimized), then Pick again.',
    };

  return openEmulatorOverlayPick({
    android: options.android,
    preferredSerial: options.preferredSerial,
    adbPath,
  });
}

async function resolvePickSerial(options: {
  readonly android: AndroidToolchainHost;
  readonly preferredSerial?: string;
}): Promise<string | null> {
  const devices = await options.android.listDevices();
  const online = devices.filter((item) => item.state === 'device');
  const preferred = options.preferredSerial?.trim() || '';
  return (
    (preferred && online.find((item) => item.serial === preferred)?.serial) ||
    online.find((item) => item.serial.startsWith('emulator-'))?.serial ||
    online[0]?.serial ||
    null
  );
}

async function loadPickModel(options: {
  readonly android: AndroidToolchainHost;
  readonly preferredSerial?: string;
  readonly adbPath: string;
  readonly serial?: string | null;
  readonly forceDump?: boolean;
}): Promise<
  | { readonly ok: true; readonly roots: readonly DeviceUiNode[]; readonly hits: readonly PickHit[]; readonly width: number; readonly height: number; readonly serial: string }
  | { readonly ok: false; readonly error: string }
> {
  const serial = options.serial ?? (await resolvePickSerial(options));
  if (!serial)
    return { ok: false, error: 'The emulator window is open, but adb does not see a device yet. Wait a moment, then Pick again.' };

  const adb = new AdbClient(options.adbPath);
  let xml: string;
  try {
    xml = await adb.dumpHierarchy(serial, { force: options.forceDump === true });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not read the device UI hierarchy.',
    };
  }

  const roots = parseDeviceHierarchy(xml);
  const size = (await adb.wmSize(serial).catch(() => null)) ?? hierarchySize(roots);
  if (size.width < 2 || size.height < 2)
    return { ok: false, error: 'Device screen size is unknown.' };

  const hits = buildPickHits(roots, 1, 1);
  if (hits.length === 0)
    return {
      ok: false,
      error: 'No selectable controls on this screen yet. Wait until the app UI is visible, then Pick again.',
    };

  return { ok: true, roots, hits, width: size.width, height: size.height, serial };
}

function hierarchySize(roots: readonly DeviceUiNode[]): { readonly width: number; readonly height: number } {
  let width = 0;
  let height = 0;
  for (const node of flattenDeviceNodes(roots)) {
    if (!node.bounds)
      continue;
    width = Math.max(width, node.bounds.x2);
    height = Math.max(height, node.bounds.y2);
  }
  return { width: Math.max(width, 1), height: Math.max(height, 1) };
}

function buildPickHits(
  roots: readonly DeviceUiNode[],
  scaleX: number,
  scaleY: number,
): readonly PickHit[] {
  const screen = hierarchySize(roots);
  const hits: PickHit[] = [];
  for (const node of flattenDeviceNodes(roots)) {
    if (!node.bounds || !isPickableDeviceNode(node, screen.width, screen.height))
      continue;
    const area = (node.bounds.x2 - node.bounds.x1) * (node.bounds.y2 - node.bounds.y1);
    if (area < 4)
      continue;
    const selector = formatDeviceSelector(node, roots);
    if (!selector)
      continue;
    hits.push({
      x1: node.bounds.x1 * scaleX,
      y1: node.bounds.y1 * scaleY,
      x2: node.bounds.x2 * scaleX,
      y2: node.bounds.y2 * scaleY,
      selector,
    });
  }
  return hits.sort(
    (a, b) => (a.x2 - a.x1) * (a.y2 - a.y1) - (b.x2 - b.x1) * (b.y2 - b.y1),
  );
}

function physicalToDip(rect: {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}): { x: number; y: number; width: number; height: number } {
  const converted = screen.screenToDipRect(null, {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  });
  return {
    x: Math.round(converted.x),
    y: Math.round(converted.y),
    width: Math.max(40, Math.round(converted.width)),
    height: Math.max(40, Math.round(converted.height)),
  };
}

/**
 * Transparent overlay on the live emulator display. Returns null when the
 * emulator window cannot be located (caller should fall back).
 */
async function openEmulatorOverlayPick(options: {
  readonly android: AndroidToolchainHost;
  readonly preferredSerial?: string;
  readonly adbPath: string;
}): Promise<DevicePickResult> {
  const client = await findEmulatorClientBounds();
  if (!client)
    return {
      ok: false,
      error:
        'Could not attach to the emulator window. Leave the emulator visible (not minimized), then Pick again.',
    };

  const serial = await resolvePickSerial(options);
  const adb = new AdbClient(options.adbPath);
  const wm = serial ? await adb.wmSize(serial).catch(() => null) : null;
  const displaySize = { width: wm?.width ?? 1080, height: wm?.height ?? 2400 };

  const display = mapDeviceDisplayRect(client, displaySize.width, displaySize.height);
  if (display.width < 40 || display.height < 40)
    return {
      ok: false,
      error: 'The emulator window is too small to pick on. Resize it, then Pick again.',
    };

  const bounds = physicalToDip(display);
  const html = buildOverlayHtml(displaySize.width, displaySize.height, []);

  const win = new BrowserWindow({
    ...bounds,
    show: false,
    frame: false,
    transparent: true,
    // Non-zero alpha so Windows still hit-tests the glass; pure 00 clicks through.
    backgroundColor: '#24000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    focusable: true,
    title: 'Testrix — Pick on device',
    autoHideMenuBar: true,
    ...windowIconOption(),
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  applyWindowIcon(win);

  let allowClose = false;
  let userPick: UserPickWait | null = null;
  let lastDip = bounds;
  let boundsWatch: ReturnType<typeof watchEmulatorClientBounds> | null = null;
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let roots: readonly DeviceUiNode[] = [];
  let pickSerial = serial;

  win.on('close', (event) => {
    if (!allowClose)
      event.preventDefault();
  });

  const pinToClient = (next: Awaited<ReturnType<typeof findEmulatorClientBounds>>): void => {
    if (!next || win.isDestroyed())
      return;
    const mapped = mapDeviceDisplayRect(next, displaySize.width, displaySize.height);
    if (mapped.width < 40 || mapped.height < 40)
      return;
    const dip = physicalToDip(mapped);
    if (
      dip.x === lastDip.x &&
      dip.y === lastDip.y &&
      dip.width === lastDip.width &&
      dip.height === lastDip.height
    )
      return;
    lastDip = dip;
    // Animate false keeps the overlay glued while the emulator is dragged.
    win.setBounds(dip, false);
  };

  const applyModel = async (forceDump: boolean): Promise<string | null> => {
    const loaded = await loadPickModel({
      ...options,
      serial: pickSerial,
      forceDump,
    });
    if (win.isDestroyed())
      return 'The pick overlay closed while reading the screen.';
    if (!loaded.ok) {
      await win.webContents
        .executeJavaScript(
          `window.__txSetStatus && window.__txSetStatus(${JSON.stringify(loaded.error)})`,
        )
        .catch(() => undefined);
      return loaded.error;
    }
    pickSerial = loaded.serial;
    displaySize.width = loaded.width;
    displaySize.height = loaded.height;
    roots = loaded.roots;
    pinToClient(await findEmulatorClientBounds());
    raiseOverlay(win);
    const hitsJson = JSON.stringify(loaded.hits).replace(/</g, '\\u003c');
    await win.webContents
      .executeJavaScript(`window.__txSetHits && window.__txSetHits(${hitsJson}, ${loaded.width}, ${loaded.height})`)
      .catch(() => undefined);
    return null;
  };

  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    if (win.isDestroyed())
      return { ok: false, error: 'The pick overlay closed before it could attach to the emulator.' };
    win.setIgnoreMouseEvents(false);
    raiseOverlay(win);
    win.show();
    win.focus();
    userPick = waitForUserPick(win);
    boundsWatch = watchEmulatorClientBounds(pinToClient);

    const loadError = await applyModel(true);
    if (loadError && win.isDestroyed())
      return { ok: false, error: loadError };

    refreshTimer = setInterval(() => {
      if (win.isDestroyed())
        return;
      void win.webContents
        .executeJavaScript('window.__txRefreshRequested === true', false)
        .then(async (want) => {
          if (!want || win.isDestroyed())
            return;
          await win.webContents
            .executeJavaScript('window.__txRefreshRequested = false; window.__txSetStatus && window.__txSetStatus("Refreshing…")')
            .catch(() => undefined);
          if (pickSerial)
            adb.invalidateHierarchy(pickSerial);
          await applyModel(true);
        })
        .catch(() => undefined);
    }, 250);

    const picked = await userPick.promise;
    if (picked.kind === 'cancel')
      return { ok: false, cancelled: true };
    if (picked.kind === 'error')
      return { ok: false, error: picked.error || 'Pick overlay failed.' };
    if (loadError && !picked.selector && !Number.isFinite(Number(picked.x)))
      return { ok: false, error: loadError };

    if (picked.selector?.trim())
      return { ok: true, selector: picked.selector.trim() };

    const x = Number(picked.x);
    const y = Number(picked.y);
    if (!Number.isFinite(x) || !Number.isFinite(y))
      return { ok: false, error: 'Invalid pick coordinates.' };

    const hit = findDeviceNodeAtPoint(roots, x, y);
    const selector = hit ? formatDeviceSelector(hit, roots) : null;
    if (!selector)
      return {
        ok: false,
        error: 'No selectable element under that point. Try a control with text or an id.',
      };
    return { ok: true, selector };
  } catch (error) {
    if (win.isDestroyed())
      return { ok: false, error: 'The pick overlay closed before a control was selected.' };
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Device pick failed.',
    };
  } finally {
    allowClose = true;
    if (refreshTimer)
      clearInterval(refreshTimer);
    boundsWatch?.stop();
    userPick?.stop();
    globalShortcut.unregister('Escape');
    if (!win.isDestroyed())
      win.destroy();
  }
}

interface UserPickWait {
  readonly promise: Promise<PickPageResult>;
  readonly stop: () => void;
}

function raiseOverlay(win: BrowserWindow): void {
  if (!win.isAlwaysOnTop())
    win.setAlwaysOnTop(true, 'screen-saver');
  win.moveTop();
}

/**
 * Waits until the page records a click or cancel. A rejected script must not
 * end the session — that was closing the overlay as soon as it appeared.
 */
function waitForUserPick(win: BrowserWindow): UserPickWait {
  let settled = false;
  let resolvePick: (result: PickPageResult) => void = () => undefined;
  const promise = new Promise<PickPageResult>((resolve) => {
    resolvePick = resolve;
  });

  const finish = (result: PickPageResult) => {
    if (settled)
      return;
    settled = true;
    clearInterval(timer);
    clearTimeout(timeout);
    win.removeListener('closed', onClosed);
    globalShortcut.unregister('Escape');
    resolvePick(result);
  };

  const onClosed = () =>
    finish({ kind: 'error', error: 'The pick overlay closed before a control was selected.' });
  win.on('closed', onClosed);

  try {
    globalShortcut.register('Escape', () => finish({ kind: 'cancel' }));
  } catch {
    // Escape still works once the overlay itself is focused.
  }

  const timer = setInterval(() => {
    if (settled || win.isDestroyed())
      return;
    void win.webContents
      .executeJavaScript('window.__txPickResult || null', false)
      .then((value) => {
        const picked = value as PickPageResult | null;
        if (!picked || (picked.kind !== 'click' && picked.kind !== 'cancel' && picked.kind !== 'error'))
          return;
        finish(picked);
      })
      .catch(() => undefined);
  }, 200);

  const timeout = setTimeout(() => finish({ kind: 'cancel' }), PICK_TIMEOUT_MS);

  return {
    promise,
    stop: () => finish({ kind: 'cancel' }),
  };
}

function buildOverlayHtml(width: number, height: number, hits: readonly PickHit[]): string {
  const hitsJson = JSON.stringify(hits).replace(/</g, '\\u003c');
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Pick on device</title>
<style>
  html, body { margin: 0; width: 100%; height: 100%; overflow: hidden;
    background: rgba(8, 10, 14, 0.32); color: #fff;
    font: 12px/1.3 system-ui, sans-serif; user-select: none; cursor: crosshair; }
  .bar { position: absolute; left: 8px; right: 8px; top: 8px; z-index: 4; display: flex; align-items: center;
    gap: 8px; padding: 6px 10px; border-radius: 8px; background: rgba(18,20,26,0.92); border: 1px solid rgba(255,255,255,0.12);
    box-sizing: border-box; cursor: default; }
  .bar strong { font-weight: 600; white-space: nowrap; }
  .bar span { opacity: 0.8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
  .bar button { appearance: none; border: 1px solid #3a4150; background: #252a35; color: #e8eaef;
    border-radius: 6px; padding: 3px 10px; cursor: pointer; font: inherit; }
  .stage { position: absolute; inset: 0; background: rgba(8, 10, 14, 0.01); }
  .outlines { position: absolute; inset: 0; pointer-events: none; z-index: 1; }
  .outline { position: absolute; box-sizing: border-box; border: 1px solid rgba(255, 220, 0, 0.45);
    background: rgba(255, 220, 0, 0.08); }
  .hl { position: absolute; pointer-events: none; border: 2px solid #0a0c10; background: rgba(255, 220, 0, 0.42);
    box-sizing: border-box; display: none; z-index: 2; }
</style>
</head>
<body>
  <div class="bar">
    <strong>Click a control</strong>
    <span id="label">Reading controls…</span>
    <button type="button" id="refresh">Refresh</button>
    <button type="button" id="cancel">Cancel</button>
  </div>
  <div class="stage" id="stage">
    <div class="outlines" id="outlines"></div>
    <div class="hl" id="hl"></div>
  </div>
  <script>
(function () {
  var hits = ${hitsJson};
  var stage = document.getElementById('stage');
  var outlines = document.getElementById('outlines');
  var hl = document.getElementById('hl');
  var label = document.getElementById('label');
  var cancelBtn = document.getElementById('cancel');
  var refreshBtn = document.getElementById('refresh');
  var deviceW = ${width};
  var deviceH = ${height};
  var settled = false;
  var ready = false;
  window.__txPickResult = null;
  window.__txRefreshRequested = false;

  function drawOutlines() {
    if (!outlines) return;
    outlines.innerHTML = '';
    var rect = stage.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1 || !hits.length) return;
    var sx = rect.width / deviceW;
    var sy = rect.height / deviceH;
    var frag = document.createDocumentFragment();
    for (var i = 0; i < hits.length; i++) {
      var h = hits[i];
      var el = document.createElement('div');
      el.className = 'outline';
      el.style.left = (h.x1 * sx) + 'px';
      el.style.top = (h.y1 * sy) + 'px';
      el.style.width = Math.max(2, (h.x2 - h.x1) * sx) + 'px';
      el.style.height = Math.max(2, (h.y2 - h.y1) * sy) + 'px';
      frag.appendChild(el);
    }
    outlines.appendChild(frag);
  }

  window.__txSetHits = function (next, w, h) {
    hits = next || [];
    if (w) deviceW = w;
    if (h) deviceH = h;
    ready = hits.length > 0;
    if (label) label.textContent = hits.length
      ? ('Hover a control · ' + hits.length + ' · Esc / Cancel')
      : 'No controls on this screen';
    drawOutlines();
  };
  window.__txSetStatus = function (text) {
    ready = false;
    hits = [];
    if (outlines) outlines.innerHTML = '';
    if (label) label.textContent = text || 'Pick failed';
  };
  window.addEventListener('resize', drawOutlines);

  function finish(value) {
    if (settled) return;
    settled = true;
    window.__txPickResult = value;
  }

  function toDevice(ev) {
    var rect = stage.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    return {
      x: Math.max(0, Math.min(deviceW - 0.01, ((ev.clientX - rect.left) / rect.width) * deviceW)),
      y: Math.max(0, Math.min(deviceH - 0.01, ((ev.clientY - rect.top) / rect.height) * deviceH))
    };
  }

  function hitAt(pt) {
    var inside = null;
    var insideArea = Infinity;
    for (var i = 0; i < hits.length; i++) {
      var h = hits[i];
      if (pt.x >= h.x1 && pt.x < h.x2 && pt.y >= h.y1 && pt.y < h.y2) {
        var area = (h.x2 - h.x1) * (h.y2 - h.y1);
        if (area < insideArea) { inside = h; insideArea = area; }
      }
    }
    if (inside) return inside;
    var pad = 18;
    var nearest = null;
    var nearestD = Infinity;
    for (var j = 0; j < hits.length; j++) {
      var n = hits[j];
      if (pt.x < n.x1 - pad || pt.x >= n.x2 + pad || pt.y < n.y1 - pad || pt.y >= n.y2 + pad) continue;
      var cx = (n.x1 + n.x2) / 2;
      var cy = (n.y1 + n.y2) / 2;
      var d = (pt.x - cx) * (pt.x - cx) + (pt.y - cy) * (pt.y - cy);
      if (d < nearestD) { nearestD = d; nearest = n; }
    }
    return nearest;
  }

  function paint(ev) {
    var pt = toDevice(ev);
    if (!pt) { hl.style.display = 'none'; return; }
    var hit = hitAt(pt);
    var rect = stage.getBoundingClientRect();
    var sx = rect.width / deviceW;
    var sy = rect.height / deviceH;
    if (!hit) {
      hl.style.display = 'none';
      if (label) label.textContent = ready
        ? ('Hover a control · ' + hits.length + ' · Esc / Cancel')
        : 'Reading controls…';
      return;
    }
    hl.style.display = 'block';
    hl.style.left = (hit.x1 * sx) + 'px';
    hl.style.top = (hit.y1 * sy) + 'px';
    hl.style.width = Math.max(2, (hit.x2 - hit.x1) * sx) + 'px';
    hl.style.height = Math.max(2, (hit.y2 - hit.y1) * sy) + 'px';
    if (label) label.textContent = hit.selector;
  }

  function onClick(ev) {
    if (ev.target && ev.target.id === 'cancel') return;
    if (ev.target && ev.target.id === 'refresh') return;
    if (ev.target && ev.target.closest && ev.target.closest('.bar')) return;
    if (!ready) return;
    var pt = toDevice(ev);
    if (!pt) return;
    ev.preventDefault();
    ev.stopPropagation();
    var hit = hitAt(pt);
    if (hit) finish({ kind: 'click', selector: hit.selector, x: pt.x, y: pt.y });
    else finish({ kind: 'click', x: pt.x, y: pt.y });
  }

  stage.addEventListener('mousemove', paint);
  stage.addEventListener('mouseleave', function () {
    hl.style.display = 'none';
    if (label) label.textContent = ready
      ? ('Hover a control · ' + hits.length + ' · Esc / Cancel')
      : 'Reading controls…';
  });
  stage.addEventListener('click', onClick);
  window.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') finish({ kind: 'cancel' });
  });
  if (cancelBtn) cancelBtn.addEventListener('click', function (ev) {
    ev.stopPropagation();
    finish({ kind: 'cancel' });
  });
  if (refreshBtn) refreshBtn.addEventListener('click', function (ev) {
    ev.stopPropagation();
    window.__txRefreshRequested = true;
  });
})();
  </script>
</body>
</html>`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
