const { ipcMain } = require('electron');
const { logError, logInfo } = require('./logger.service');

/** @type { import('./e2e.service.js') | { execute: (...a: unknown[]) => Promise<unknown> } } */
let e2eService;

function getE2eService() {
  if (!e2eService) {
    // eslint-disable-next-line global-require
    e2eService = require('./e2e.service');
  }
  return e2eService;
}

const TEARDOWN_SCRIPT =
  "try{typeof window.__AW_SCROLL_POS_TEARDOWN__==='function'&&window.__AW_SCROLL_POS_TEARDOWN__()}catch(e){}";

const INJECT_SCROLL_UI_SCRIPT = `(function AW_SCROLL_POS_UI(){
  try { if (typeof window.__AW_SCROLL_POS_TEARDOWN__ === 'function') window.__AW_SCROLL_POS_TEARDOWN__(); } catch (_a) {}
  var bridge = window.__AW_PICK_BRIDGE__;
  if (!bridge || typeof bridge.saveScrollPosition !== 'function') return;

  var root = document.createElement('div');
  root.id = '__aw-scroll-pos-ui';
  root.setAttribute(
    'style',
    'position:fixed;bottom:16px;right:16px;z-index:2147483647;font:13px/1.4 system-ui,-apple-system,sans-serif;' +
      'background:rgba(15,23,42,0.96);color:#e2e8f0;padding:14px 16px;border-radius:10px;' +
      'box-shadow:0 8px 28px rgba(0,0,0,0.4);border:1px solid rgba(249,115,22,0.5);min-width:232px;'
  );

  var title = document.createElement('div');
  title.textContent = 'Scroll the page, then save position';
  title.setAttribute('style', 'font-weight:600;margin-bottom:10px;color:#fda4af;');
  root.appendChild(title);

  var readout = document.createElement('div');
  readout.setAttribute('style', 'font-variant-numeric:tabular-nums;margin-bottom:12px;opacity:0.95;');
  root.appendChild(readout);

  /** Same as Scroll To: innermost overflow ancestor with range ≥220px under the point, else widest. */
  function widestScrollAncestorFromPoint(px, py) {
    var MIN_QUAL = 220;
    var node = null;
    try {
      node = document.elementFromPoint(px, py);
    } catch (_d) {
      return null;
    }
    if (!node) return null;
    var innerQual = null;
    var best = null;
    var bestScore = -1;
    var hops = 0;
    while (node && hops < 100) {
      hops++;
      if (node.nodeType === 1) {
        try {
          var cs = window.getComputedStyle(node);
          var oy = cs.overflowY;
          var ox = cs.overflowX;
          var canY =
            (oy === 'auto' || oy === 'scroll' || oy === 'overlay') &&
            node.scrollHeight > node.clientHeight + 3;
          var canX =
            (ox === 'auto' || ox === 'scroll' || ox === 'overlay') &&
            node.scrollWidth > node.clientWidth + 3;
          if (canY || canX) {
            var ry = Math.max(0, node.scrollHeight - node.clientHeight);
            var rx = Math.max(0, node.scrollWidth - node.clientWidth);
            var score = Math.max(ry, rx);
            if (score > bestScore) {
              bestScore = score;
              best = node;
            }
            if (innerQual === null && score >= MIN_QUAL) {
              innerQual = node;
            }
          }
        } catch (_e) {}
      }
      node = node.parentElement;
    }
    return innerQual !== null ? innerQual : best;
  }

  function primaryScrollTargetFromViewport() {
    var vw = window.innerWidth || 0;
    var vh = window.innerHeight || 0;
    var cx = Math.max(8, Math.min(vw - 8, Math.floor(vw / 2)));
    var cy = Math.max(8, Math.min(vh - 8, Math.floor(vh / 2)));
    var cy2 = Math.max(24, Math.min(vh - 24, Math.floor(vh * 0.42)));
    var a = widestScrollAncestorFromPoint(cx, cy);
    var b = widestScrollAncestorFromPoint(cx, cy2);
    if (!a) return b;
    if (!b) return a;
    var ra = Math.max(0, a.scrollHeight - a.clientHeight);
    var rb = Math.max(0, b.scrollHeight - b.clientHeight);
    return rb > ra ? b : a;
  }

  function awReadEffectiveScroll() {
    var sx = window.scrollX || window.pageXOffset || 0;
    var sy = window.scrollY || window.pageYOffset || 0;
    var roots = [];
    try {
      if (document.scrollingElement) roots.push(document.scrollingElement);
    } catch (_r0) {}
    try {
      roots.push(document.documentElement, document.body);
    } catch (_r1) {}
    var seen = new WeakSet();
    for (var i = 0; i < roots.length; i++) {
      var el = roots[i];
      if (!el || seen.has(el)) continue;
      seen.add(el);
      try {
        if (el.scrollLeft > sx) sx = el.scrollLeft;
        if (el.scrollTop > sy) sy = el.scrollTop;
      } catch (_r2) {}
    }
    var inner = primaryScrollTargetFromViewport();
    if (inner) {
      try {
        if (inner.scrollLeft > sx) sx = inner.scrollLeft;
        if (inner.scrollTop > sy) sy = inner.scrollTop;
      } catch (_r3) {}
    }
    return { sx: sx, sy: sy };
  }

  function fmt() {
    var p = awReadEffectiveScroll();
    readout.textContent =
      'scrollX: ' +
      Math.round(p.sx) +
      ' · scrollY: ' +
      Math.round(p.sy) +
      ' (saved · largest overflow under center)';
  }
  fmt();
  window.addEventListener('scroll', fmt, true);
  var pollTick = setInterval(fmt, 110);

  var row = document.createElement('div');
  row.setAttribute('style', 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;');

  var btnSave = document.createElement('button');
  btnSave.type = 'button';
  btnSave.textContent = 'Save position';
  btnSave.setAttribute(
    'style',
    'cursor:pointer;padding:8px 14px;border-radius:6px;border:none;background:#ea580c;color:#fff;font:inherit;font-weight:600;'
  );

  var btnCancel = document.createElement('button');
  btnCancel.type = 'button';
  btnCancel.textContent = 'Cancel';
  btnCancel.setAttribute(
    'style',
    'cursor:pointer;padding:8px 14px;border-radius:6px;border:1px solid rgba(226,232,240,0.35);background:transparent;color:#e2e8f0;font:inherit;'
  );

  row.appendChild(btnSave);
  row.appendChild(btnCancel);
  root.appendChild(row);

  var sub = document.createElement('div');
  sub.textContent =
    'Live numbers use the page script context; Save uses the same isolated probe as Run Flow · Esc cancels';
  sub.setAttribute('style', 'margin-top:10px;font-size:11px;opacity:0.78;line-height:1.35;');
  root.appendChild(sub);

  document.documentElement.appendChild(root);

  function teardown() {
    try {
      clearInterval(pollTick);
    } catch (_p) {}
    try { window.removeEventListener('scroll', fmt, true); } catch (_b) {}
    try { root.remove(); } catch (_c) {}
    try { window.removeEventListener('keydown', onKey, true); } catch (_d) {}
    window.__AW_SCROLL_POS_TEARDOWN__ = null;
  }
  window.__AW_SCROLL_POS_TEARDOWN__ = teardown;

  function onKey(e) {
    if (e.key === 'Escape' && typeof bridge.cancelScrollPositionPick === 'function') {
      bridge.cancelScrollPositionPick();
    }
  }
  window.addEventListener('keydown', onKey, true);

  btnSave.addEventListener('click', function () {
    var p = awReadEffectiveScroll();
    bridge.saveScrollPosition({ scrollX: p.sx, scrollY: p.sy });
  });
  btnCancel.addEventListener('click', function () {
    if (typeof bridge.cancelScrollPositionPick === 'function') bridge.cancelScrollPositionPick();
  });
})();`;

let activeScrollCleanup = null;

function closeActiveScrollSession() {
  if (typeof activeScrollCleanup === 'function') {
    try {
      activeScrollCleanup();
    } catch (_) {}
  }
  activeScrollCleanup = null;
}

ipcMain.handle('e2e:pick-scroll-position:start', async (_event, payload) => {
  try {
    // eslint-disable-next-line global-require
    require('./e2e-pick-element.service').closeActiveSession();
  } catch (_) {}
  closeActiveScrollSession();

  const svc = getE2eService();
  await svc.clearRunnerSession();

  const preceding = payload && Array.isArray(payload.precedingE2eSteps) ? payload.precedingE2eSteps : [];
  const fallbackUrl =
    payload && typeof payload.fallbackUrl === 'string' ? payload.fallbackUrl.trim() : '';
  const hasUrl = /^https?:\/\//i.test(fallbackUrl);

  try {
    if (preceding.length > 0) {
      for (const step of preceding) {
        const action = typeof step.action === 'string' ? step.action : 'NAVIGATE_TO';
        const selector = typeof step.selector === 'string' ? step.selector : '';
        const value = typeof step.value === 'string' ? step.value : '';
        const timeout =
          typeof step.timeout === 'number' && Number.isFinite(step.timeout) && step.timeout >= 0
            ? step.timeout
            : 5000;
        const shot =
          typeof step.screenshotPath === 'string' && step.screenshotPath.trim()
            ? step.screenshotPath.trim()
            : undefined;
        const shotName =
          typeof step.screenshotFileName === 'string' && step.screenshotFileName.trim()
            ? step.screenshotFileName.trim()
            : undefined;
        await svc.execute(action, selector, value, timeout, true, null, shot, shotName);
      }
    } else if (hasUrl) {
      await svc.execute('NAVIGATE_TO', fallbackUrl, '', 60000, true);
    } else {
      return {
        ok: false,
        error:
          'Provide preceding browser steps in the flow, or enter an http(s) URL when prompted (first browser step).',
      };
    }
  } catch (err) {
    logError('e2e pick-scroll-position: preceding steps failed', err);
    return {
      ok: false,
      error: err && err.message ? String(err.message) : 'Failed to replay browser steps',
    };
  }

  const scrollWarmRaw =
    payload && typeof payload.scrollToValue === 'string' ? payload.scrollToValue.trim() : '';
  if (scrollWarmRaw) {
    const scrollTimeoutMs =
      payload &&
      typeof payload.scrollToTimeoutMs === 'number' &&
      Number.isFinite(payload.scrollToTimeoutMs) &&
      payload.scrollToTimeoutMs >= 0
        ? payload.scrollToTimeoutMs
        : 15000;
    try {
      await svc.execute(
        'SCROLL_TO',
        '',
        scrollWarmRaw,
        scrollTimeoutMs,
        true,
        null,
        undefined,
        undefined,
      );
    } catch (warmErr) {
      logInfo(
        'e2e pick-scroll-position: warm SCROLL_TO skipped or failed',
        warmErr && warmErr.message ? String(warmErr.message) : String(warmErr),
      );
    }
  }

  const win = svc.window;
  if (!win || win.isDestroyed()) {
    return { ok: false, error: 'E2E browser window is not available.' };
  }

  let settled = false;
  /** Ignore overlapping save IPC (double-click) before {@link finish} sets `settled`. */
  let saveInProgress = false;
  /** @type {((r: unknown) => void) | null} */
  let resolveOuter = null;

  let onBeforeInput = null;

  const cleanupIpcAndClosed = () => {
    ipcMain.removeListener('e2e:pick-scroll-position:save', onSave);
    ipcMain.removeListener('e2e:pick-scroll-position:cancel', onCancel);
    if (onBeforeInput && win && !win.isDestroyed()) {
      try {
        win.webContents.removeListener('before-input-event', onBeforeInput);
      } catch (_) {}
      onBeforeInput = null;
    }
    if (listeners.onClosed) {
      try {
        win.removeListener('closed', listeners.onClosed);
      } catch (_) {}
      listeners.onClosed = null;
    }
  };

  const finish = async (result) => {
    if (settled) return;
    settled = true;
    cleanupIpcAndClosed();
    activeScrollCleanup = null;
    try {
      if (win && !win.isDestroyed()) {
        await win.webContents.executeJavaScript(TEARDOWN_SCRIPT, true).catch(() => {});
      }
    } catch (_) {}
    /** Hide after Save or Cancel so the runner does not stay open in front of the editor. */
    if (win && !win.isDestroyed()) {
      try {
        win.hide();
      } catch (_) {}
    }
    if (resolveOuter) resolveOuter(result);
  };

  const onSave = (_e, data) => {
    if (settled || saveInProgress) return;
    saveInProgress = true;
    void (async () => {
      const bridgeSx =
        data && typeof data.scrollX === 'number' && Number.isFinite(data.scrollX)
          ? data.scrollX
          : null;
      const bridgeSy =
        data && typeof data.scrollY === 'number' && Number.isFinite(data.scrollY)
          ? data.scrollY
          : null;
      let sx = Number.NaN;
      let sy = Number.NaN;
      try {
        if (win && !win.isDestroyed()) {
          const svc = getE2eService();
          const readSrc =
            typeof svc.scrollGuestReadPositionSnapshot === 'function'
              ? svc.scrollGuestReadPositionSnapshot()
              : '';
          if (readSrc && typeof svc.executeScrollGuestScript === 'function') {
            const raw = await svc.executeScrollGuestScript(win.webContents, readSrc);
            const coords =
              typeof svc.parseScrollGuestJsonResult === 'function'
                ? await svc.parseScrollGuestJsonResult(raw)
                : null;
            if (
              coords &&
              typeof coords === 'object' &&
              typeof coords.sx === 'number' &&
              typeof coords.sy === 'number' &&
              Number.isFinite(coords.sx) &&
              Number.isFinite(coords.sy)
            ) {
              sx = coords.sx;
              sy = coords.sy;
            }
          }
        }
      } catch (_isoErr) {
        /* fall back to guest-reported coords */
      }
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) {
        sx = data && typeof data.scrollX === 'number' ? data.scrollX : Number.NaN;
        sy = data && typeof data.scrollY === 'number' ? data.scrollY : Number.NaN;
      }
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) {
        void finish({ ok: false, error: 'Invalid scroll position from page.' });
        return;
      }
      const value = `${Math.round(sx)},${Math.round(sy)}`;
      void finish({ ok: true, value });
    })().finally(() => {
      saveInProgress = false;
    });
  };

  const onCancel = () => void finish({ ok: false, cancelled: true });

  ipcMain.on('e2e:pick-scroll-position:save', onSave);
  ipcMain.on('e2e:pick-scroll-position:cancel', onCancel);

  const listeners = { onClosed: null };
  listeners.onClosed = () => void finish({ ok: false, cancelled: true });
  win.once('closed', listeners.onClosed);

  activeScrollCleanup = () => void finish({ ok: false, cancelled: true });

  return new Promise((resolve) => {
    resolveOuter = resolve;
    void (async () => {
      try {
        await win.webContents.executeJavaScript(INJECT_SCROLL_UI_SCRIPT, true);
      } catch (err) {
        logError('e2e pick-scroll-position: inject failed', err);
        await finish({
          ok: false,
          error: err && err.message ? String(err.message) : 'Failed to open scroll position helper',
        });
        return;
      }
      try {
        onBeforeInput = (_e, input) => {
          if (input.type === 'keyDown' && input.key === 'Escape') {
            void finish({ ok: false, cancelled: true });
          }
        };
        win.webContents.on('before-input-event', onBeforeInput);
      } catch (_) {}
      logInfo('e2e pick-scroll-position: session active');
    })();
  });
});

module.exports = { closeActiveScrollSession };
