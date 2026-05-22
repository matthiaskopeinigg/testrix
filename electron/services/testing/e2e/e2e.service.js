const { BrowserWindow, ipcMain, session, app, screen } = require('electron');
const path = require('path');
const fsp = require('fs').promises;
const { resolveWindowIcon } = require('./window-icon');
const {
  INTERCEPT_REPLACE_BODY_TYPES,
  applyInterceptQueryMutations,
  resolveInterceptPostDataBase64,
} = require('./http-intercept-fetch-helpers');

/**
 * Park the stealth runner inside the display work area (bottom-right).
 * Positions past the monitor broke hit-testing (`elementFromPoint` → null) and scroll logic at SCROLL_TO.
 */
function parkE2eRunnerOffScreen(win) {
  try {
    const b = win.getBounds();
    const d = screen.getDisplayMatching(b);
    const wa = d.workArea;
    const w = b.width;
    const h = b.height;
    let x = wa.x + wa.width - w - 10;
    let y = wa.y + wa.height - h - 10;
    if (x < wa.x) x = wa.x + 8;
    if (y < wa.y) y = wa.y + 8;
    win.setPosition(Math.round(x), Math.round(y));
  } catch (_) {}
}

/** Keep OS compositing active without presenting a visible taskbar window (used when `show: false`). */
function applyE2eRunnerStealth(win) {
  try {
    win.setOpacity(0);
  } catch (_) {}
  try {
    win.setSkipTaskbar(true);
  } catch (_) {}
  /**
   * Opacity 0 still leaves a normal hit-target: the parked runner overlaps much of the monitor bottom-right,
   * so the main window’s modals (e.g. manual input) appear “dead” until the user moves the app away.
   * `sendInputEvent` / guest automation keep working; only OS pointer routing passes through.
   */
  try {
    win.setIgnoreMouseEvents(true);
  } catch (_) {}
  parkE2eRunnerOffScreen(win);
}

/** Loose page URL compare: strips scheme, optional `www.`, query/hash, trailing slashes. */
function normalizePageUrlForE2e(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withScheme);
    let host = parsed.hostname.toLowerCase();
    if (host.startsWith('www.')) host = host.slice(4);
    const pathPart = parsed.pathname.replace(/\/+$/, '');
    return `${host}${pathPart}`;
  } catch (_) {
    let url = trimmed.toLowerCase();
    url = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
    url = url.replace(/^www\./i, '');
    url = url.split(/[?#]/, 1)[0] ?? url;
    return url.replace(/\/+$/, '');
  }
}

function clearE2eRunnerStealth(win) {
  try {
    win.setOpacity(1);
  } catch (_) {}
  try {
    win.setSkipTaskbar(false);
  } catch (_) {}
  try {
    win.setIgnoreMouseEvents(false);
  } catch (_) {}
}

/** Enables element-picker IPC bridge on the runner window (`e2e-pick-element.service.js`). */
const E2E_PICK_BRIDGE_PRELOAD = path.join(__dirname, '..', '..', '..', 'preload', 'e2e-pick.preload.js');

/** Isolated session so clearing cookies/storage for E2E never affects the main app window. */
const E2E_RUNNER_PARTITION = 'persist:testrix-e2e-runner';

/** One-time: TLS bypass + UA defaults for the runner partition only (desktop API testing). */
let e2eRunnerPartitionHooksInstalled = false;

function installE2eRunnerPartitionHooks() {
  if (e2eRunnerPartitionHooksInstalled) return;
  e2eRunnerPartitionHooksInstalled = true;
  try {
    const ses = session.fromPartition(E2E_RUNNER_PARTITION);
    ses.on('certificate-error', (event, _url, _error, _certificate, callback) => {
      event.preventDefault();
      callback(true);
    });
  } catch (_) {}
}

/**
 * Stock-Chromium-style UA using this embed’s real Chrome/x.y.z version. Stripping `Electron/` alone is not enough:
 * many sites (incl. strict CSP / telecom portals) still fingerprint leftover tokens or weak substitutions.
 * @param {Electron.WebContents} wc
 * @returns {string}
 */
function buildChromeLikeUserAgent(wc) {
  try {
    const raw = wc.getUserAgent();
    const m = raw.match(/Chrome\/([\d.]+)/);
    const chromeVer = m ? m[1] : '130.0.0.0';
    let platform = 'Windows NT 10.0; Win64; x64';
    if (process.platform === 'darwin') platform = 'Macintosh; Intel Mac OS X 10_15_7';
    else if (process.platform === 'linux') platform = 'X11; Linux x86_64';
    return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVer} Safari/537.36`;
  } catch (_) {
    return '';
  }
}

/** Apply a Chrome-desktop UA on the runner guest so remote sites paint instead of an empty shell. */
function applyE2eRunnerChromeLikeUserAgent(wc) {
  if (!wc || wc.isDestroyed()) return;
  try {
    const ua = buildChromeLikeUserAgent(wc);
    if (ua) wc.setUserAgent(ua);
  } catch (_) {}
}

/**
 * `loadURL` plus `did-fail-load` so opaque blank surfaces become actionable errors in the flow UI.
 * @param {Electron.WebContents} wc
 * @param {string} url
 * @returns {Promise<void>}
 */
function loadUrlReportingFailures(wc, url) {
  return new Promise((resolve, reject) => {
    if (!wc || wc.isDestroyed()) {
      reject(new Error('E2E runner web contents unavailable'));
      return;
    }
    const onFail = (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return;
      cleanup();
      reject(
        new Error(
          `Navigation failed (${errorCode}): ${errorDescription || 'unknown'} — ${validatedURL || url}`,
        ),
      );
    };
    const cleanup = () => {
      try {
        wc.removeListener('did-fail-load', onFail);
      } catch (_) {}
    };
    wc.once('did-fail-load', onFail);
    wc.loadURL(url)
      .then(() => {
        cleanup();
        resolve();
      })
      .catch((err) => {
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      });
  });
}

/** Picker-encoded targets for OOPIF / cross-origin CMP iframes: `__AW_SUBFRAME__::processId::routingId::encodeURIComponent(innerCss)`. */
const SUBFRAME_SELECTOR_RE = /^__AW_SUBFRAME__::(\d+)::(\d+)::([\s\S]+)$/;

/** @returns {{ processId: number; routingId: number; inner: string } | null} */
function parseSubframeTerminalSelector(sel) {
  const raw = String(sel || '').trim();
  const m = raw.match(SUBFRAME_SELECTOR_RE);
  if (!m) return null;
  return {
    processId: Number(m[1]),
    routingId: Number(m[2]),
    inner: decodeURIComponent(m[3]),
  };
}

/**
 * Normalizes a user-entered address for `loadURL`: bare hostnames and paths get a scheme when none is present.
 * Local dev hosts default to **http** so `localhost:4200` does not become `https://…` (TLS mismatch → blank error surface).
 * @param {string} raw
 * @returns {string}
 */
function normalizeE2eBrowseUrl(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
  if (s.startsWith('//')) return `https:${s}`;
  const withHttps = `https://${s}`;
  try {
    const u = new URL(withHttps);
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1') {
      u.protocol = 'http:';
      return u.href;
    }
  } catch (_) {
    return withHttps;
  }
  return withHttps;
}

/** Walk Electron `WebFrameMain` subtree (avoid `require('electron').WebFrameMain` before app ready). */
function findWebFrameMainByRouting(root, processId, routingId) {
  const pid = Number(processId);
  const rid = Number(routingId);
  if (!root || root.isDestroyed()) return null;
  if (root.processId === pid && root.routingId === rid) return root;
  const kids = root.frames || [];
  for (let i = 0; i < kids.length; i++) {
    const hit = findWebFrameMainByRouting(kids[i], pid, rid);
    if (hit) return hit;
  }
  return null;
}

/** @param {import('electron').WebFrameMain} root */
function collectWebFramesInSubtree(root) {
  /** @type {import('electron').WebFrameMain[]} */
  const out = [];
  if (!root || root.isDestroyed()) return out;
  out.push(root);
  const kids = root.frames || [];
  for (let i = 0; i < kids.length; i++) {
    out.push(...collectWebFramesInSubtree(kids[i]));
  }
  return out;
}

/**
 * Resolves OOPIF targets from picker tokens. Routing ids change after reload, so we fall back to
 * scanning frames for the inner selector when the original frame is gone.
 *
 * @param {import('electron').WebContents} webContents
 * @param {{ processId: number; routingId: number; inner: string }} sub
 */
async function resolveWebFrameForSubframe(webContents, sub) {
  const mf = webContents.mainFrame;
  const byRoute = findWebFrameMainByRouting(mf, sub.processId, sub.routingId);
  if (byRoute && !byRoute.isDestroyed() && !byRoute.detached) {
    return byRoute;
  }

  const innerJson = JSON.stringify(String(sub.inner ?? ''));
  const probeScript = `
    (function() {
      ${guestDeepSelectorHelperSource()}
      try {
        const el = awResolveDeepSelector(document, ${innerJson});
        return !!el;
      } catch (_) {
        return false;
      }
    })()
  `;

  for (const frame of collectWebFramesInSubtree(mf)) {
    if (!frame || frame.isDestroyed() || frame.detached) continue;
    try {
      const found = await frame.executeJavaScript(probeScript, true);
      if (found) return frame;
    } catch (_) {}
  }

  throw new Error(
    'Element not found in any browser frame (page may have reloaded — pick the element again or add a Navigate step before this click).',
  );
}

/** @param {string} raw */
function looksLikePngFilePath(raw) {
  const s = String(raw || '').trim();
  if (!s) return false;
  return /\.png$/i.test(path.basename(s));
}

/**
 * Sanitize optional user-provided screenshot base name; empty string if unusable.
 * @param {string} raw
 */
function sanitizeScreenshotBasename(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '';
  const base = path.basename(trimmed.replace(/[/\\]/g, ''));
  const cleaned = base.replace(/[<>:"|?*\x00-\x1f]/g, '_').trim();
  if (!cleaned || cleaned === '.' || cleaned === '..') return '';
  return /\.png$/i.test(cleaned) ? cleaned : `${cleaned}.png`;
}

function defaultScreenshotBasename() {
  return `screenshot-${Date.now()}.png`;
}

/** `YYYY-MM-DD_HHmmss_mmm` — safe for Windows/macOS/Linux file names. */
function formatScreenshotDateStamp() {
  const d = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}_${pad(d.getMilliseconds(), 3)}`;
}

/**
 * @param {string} nameHint
 * User-provided base names get a date stamp so repeated runs do not overwrite the same file.
 */
function resolveScreenshotBasename(nameHint) {
  const sanitized = sanitizeScreenshotBasename(nameHint);
  if (!sanitized) return defaultScreenshotBasename();
  const base = sanitized.replace(/\.png$/i, '');
  return `${base}-${formatScreenshotDateStamp()}.png`;
}

/**
 * Resolve a relative screenshot folder under `defaultDir` (rejects `..` traversal).
 * @param {string} defaultDir
 * @param {string} relativeDir
 */
function resolveScreenshotDirUnderDefault(defaultDir, relativeDir) {
  const targetDir = path.resolve(defaultDir, path.normalize(relativeDir));
  const baseResolved = path.resolve(defaultDir);
  const rel = path.relative(baseResolved, targetDir);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Invalid relative screenshot folder');
  }
  return targetDir;
}

/**
 * Executes guest JS inside the OOPIF that owns `inner` selectors from the element picker relay.
 *
 * @param {Electron.WebContents} webContents
 */
async function executeJsInOwningFrame(webContents, processId, routingId, code, userGesture = true) {
  const mf = webContents.mainFrame;
  const frame = findWebFrameMainByRouting(mf, processId, routingId);
  if (!frame || frame.isDestroyed() || frame.detached) {
    throw new Error(
      'Target browser frame no longer exists (reload the page or capture the selector again).',
    );
  }
  await frame.executeJavaScript(code, userGesture);
}

/** Evaluates JS in main document or the OOPIF targeted by picker `__AW_SUBFRAME__::…`; returns promise result. */
async function evaluateScopedGuestScript(webContents, selector, script) {
  const sub = parseSubframeTerminalSelector(selector);
  if (sub) {
    const frame = await resolveWebFrameForSubframe(webContents, sub);
    return frame.executeJavaScript(script, true);
  }
  return webContents.executeJavaScript(script, true);
}

async function runScopedGuestScript(webContents, selector, script) {
  await evaluateScopedGuestScript(webContents, selector, script);
}

/**
 * OS-level mouse click at coordinates relative to the webContents view (DIP).
 * Many consent / CMP scripts ignore synthetic HTMLElement.click / composed events.
 *
 * @param {Electron.WebContents} wc
 * @param {number} ix
 * @param {number} iy
 */
async function sendNativeClickAtContentCoordinates(wc, ix, iy) {
  const x = Math.round(ix);
  const y = Math.round(iy);
  wc.sendInputEvent({ type: 'mouseMove', x, y });
  await new Promise((r) => setTimeout(r, 16));
  wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
  await new Promise((r) => setTimeout(r, 42));
  wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
}

/** Builds a short diagonal approach so menus see pointer entry, not a teleport. */
function buildHoverApproachPoints(ix, iy) {
  const x = Math.round(ix);
  const y = Math.round(iy);
  const startX = Math.max(4, x - 80);
  const startY = Math.max(4, y - 48);
  const steps = 8;
  /** @type {{ x: number; y: number; delay: number }[]} */
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push({
      x: Math.round(startX + (x - startX) * t),
      y: Math.round(startY + (y - startY) * t),
      delay: i === steps ? 96 : 32,
    });
  }
  return points;
}

/**
 * @param {Electron.WebContents} wc
 * @param {{ x: number; y: number; delay?: number }[]} points
 * @param {boolean} keepDebuggerAttached
 */
async function dispatchCdpHoverPath(wc, points, keepDebuggerAttached) {
  if (!wc || wc.isDestroyed()) return false;
  const dbg = wc.debugger;
  let attachedHere = false;
  try {
    if (!dbg.isAttached()) {
      dbg.attach('1.3');
      attachedHere = true;
    }
    for (const p of points) {
      await dbg.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: p.x,
        y: p.y,
        button: 'none',
        buttons: 0,
        pointerType: 'mouse',
      });
      await new Promise((r) => setTimeout(r, p.delay ?? 32));
    }
    return true;
  } catch (err) {
    console.warn('[E2E] CDP hover path failed:', err?.message || err);
    return false;
  } finally {
    if (attachedHere && !keepDebuggerAttached) {
      try {
        dbg.detach();
      } catch (_) {}
    }
  }
}

/**
 * OS-level hover: CDP mouse path when possible, else stepped {@link WebContents.sendInputEvent}.
 *
 * @param {Electron.WebContents} wc
 * @param {number} ix
 * @param {number} iy
 * @param {boolean} [keepDebuggerAttached]
 */
async function deliverNativeHoverAtContentCoordinates(wc, ix, iy, keepDebuggerAttached = false) {
  const points = buildHoverApproachPoints(ix, iy);
  const cdpOk = await dispatchCdpHoverPath(wc, points, keepDebuggerAttached);
  if (cdpOk) return;

  for (const p of points) {
    wc.sendInputEvent({ type: 'mouseMove', x: p.x, y: p.y });
    await new Promise((r) => setTimeout(r, p.delay ?? 32));
  }
}

/**
 * Waits for document load (if needed) and two animation frames so DOM updates from the previous
 * step are painted before the next action or before {@link WebContents.capturePage}.
 *
 * @param {Electron.WebContents} wc
 */
/**
 * Many sites call `window.close()` after a button click (OAuth popups, “Done”, etc.). In Electron that
 * tears down the whole runner {@link BrowserWindow}, so the next flow step creates a new window and it
 * looks like the browser “closed then reopened”. Block script-driven close; main-process `CLOSE` still
 * destroys the window normally.
 *
 * @param {Electron.WebContents} wc
 */
async function applyGuestWindowCloseShield(wc) {
  if (!wc || wc.isDestroyed()) return;
  try {
    await wc.executeJavaScript(
      `
      (function () {
        try {
          if (window.__AW_E2E_CLOSE_SHIELD__) return true;
          window.__AW_E2E_CLOSE_SHIELD__ = true;
          window.__AW_E2E_ORIGINAL_CLOSE__ = window.close.bind(window);
          window.close = function awApiWorkbenchE2eGuardedClose() {
            try {
              console.warn('[API Workbench E2E] Ignoring page window.close() so the runner stays open for the flow.');
            } catch (_w) {}
          };
          return true;
        } catch (_e) {
          return false;
        }
      })()
    `,
      true,
    );
  } catch (_) {
    /* navigation / detached guest race */
  }
}

async function awaitGuestPaintSettled(wc) {
  if (!wc || wc.isDestroyed()) return;
  try {
    await wc.executeJavaScript(
      `
      (function () {
        return new Promise(function (resolve) {
          function frames() {
            requestAnimationFrame(function () {
              requestAnimationFrame(function () {
                resolve(true);
              });
            });
          }
          if (document.readyState === 'complete') frames();
          else window.addEventListener('load', frames, { once: true });
        });
      })()
    `,
      true,
    );
  } catch (_) {
    /* navigation race */
  }
}

/**
 * Extra settle after navigation for late-injected UI (cookie CMPs, shadow widgets, SPA hydration).
 *
 * @param {import('electron').WebContents} wc
 * @param {number} [maxMs]
 */
async function awaitSpaLateRenderSettled(wc, maxMs = 3000) {
  if (!wc || wc.isDestroyed()) return;
  const budget = Math.max(Number(maxMs) || 3000, 400);
  try {
    await wc.executeJavaScript(
      `
      new Promise(function (resolve) {
        var deadline = Date.now() + ${budget};
        function finish() { resolve(true); }
        function idleThenFinish() {
          var remaining = deadline - Date.now();
          if (remaining <= 0) return finish();
          setTimeout(finish, Math.min(500, remaining));
        }
        if (typeof window.requestIdleCallback === 'function') {
          window.requestIdleCallback(idleThenFinish, { timeout: Math.min(${budget}, 2000) });
        } else {
          setTimeout(idleThenFinish, Math.min(800, ${budget}));
        }
      })
    `,
      true,
    );
  } catch (_) {
    /* navigation race */
  }
}

/** True when the selector pierces shadow DOM or iframes — DOM events click more reliably than native OS input. */
function e2eSelectorPrefersDomClick(selector) {
  const raw = String(selector ?? '');
  return raw.includes('|>|') || raw.includes(' >>> ');
}

/**
 * Scroll guest: document roots + the **innermost overflow scroll ancestor** of the viewport center
 * (`elementFromPoint`). Taking max(scrollTop) over every overflow node wrongly picked hidden panels
 * (e.g. scrollY 2103 while the visible page stayed at the top).
 *
 * @param {number} left
 * @param {number} top
 */
function scrollGuestApplyAndVerify(left, top) {
  const lx = Number(left);
  const ty = Number(top);
  const tol = 6;
  const maxAttempts = 10;
  return `
    (function () {
      var L = ${lx};
      var T = ${ty};
      var TOL = ${tol};
      var MAX = ${maxAttempts};

      function mergeRootsIntoXY(sx, sy) {
        var roots = [];
        try {
          if (document.scrollingElement) roots.push(document.scrollingElement);
        } catch (_a) {}
        try {
          roots.push(document.documentElement, document.body);
        } catch (_b) {}
        var seen = new WeakSet();
        for (var i = 0; i < roots.length; i++) {
          var el = roots[i];
          if (!el || seen.has(el)) continue;
          seen.add(el);
          try {
            if (el.scrollLeft > sx) sx = el.scrollLeft;
            if (el.scrollTop > sy) sy = el.scrollTop;
          } catch (_c) {}
        }
        return { sx: sx, sy: sy };
      }

      /**
       * Prefer the innermost overflow ancestor under (px,py) whose scroll range is at least MIN_QUAL px
       * (skips tiny cards/tooltips). If none qualify, fall back to the widest ancestor — same chain as before.
       */
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

      /** One target for the whole apply/verify loop — recomputing per frame picked different overflow ancestors after layout shifted. */
      var lockedInner = primaryScrollTargetFromViewport();

      function snapshotLockedMeta() {
        var el = lockedInner;
        if (!el) return null;
        try {
          return {
            tag: String(el.tagName || ''),
            id: String(el.id || ''),
            st: Math.round(el.scrollTop),
            sl: Math.round(el.scrollLeft),
            maxY: Math.max(0, Math.round(el.scrollHeight - el.clientHeight)),
            maxX: Math.max(0, Math.round(el.scrollWidth - el.clientWidth)),
          };
        } catch (_sm) {
          return null;
        }
      }

      function readEffective() {
        var sx = window.scrollX || window.pageXOffset || 0;
        var sy = window.scrollY || window.pageYOffset || 0;
        var m = mergeRootsIntoXY(sx, sy);
        sx = m.sx;
        sy = m.sy;
        var inner = lockedInner;
        if (inner) {
          try {
            sx = Math.max(sx, inner.scrollLeft);
            sy = Math.max(sy, inner.scrollTop);
          } catch (_f) {}
        }
        return { sx: sx, sy: sy };
      }

      function applyOnce() {
        /**
         * Picker/read merge uses max(window, inner). Applying T to **both** roots double-scrolls when the
         * real motion lives in a tall overflow panel (doc scroll range tiny, inner range large) — screenshot
         * then sits slightly above/below the saved position.
         */
        var inner = lockedInner;
        var se = document.scrollingElement;
        var vh = window.innerHeight || 0;
        var docEl = document.documentElement;
        var docMaxY = Math.max(0, Math.round((docEl && docEl.scrollHeight) || 0) - vh);
        var innerMaxY = 0;
        var innerMaxX = 0;
        if (inner) {
          try {
            innerMaxY = Math.max(0, inner.scrollHeight - inner.clientHeight);
            innerMaxX = Math.max(0, inner.scrollWidth - inner.clientWidth);
          } catch (_iq) {}
        }
        /** Use inner-only window scroll when inner range >= document range (replaces older docMaxY+16 slack). */
        var innerPrimaryY = inner && innerMaxY >= docMaxY;
        var winTop = innerPrimaryY ? 0 : T;
        var rootTop = innerPrimaryY ? 0 : T;

        try {
          window.scrollTo({ left: L, top: winTop, behavior: 'auto' });
        } catch (_g0) {
          try {
            window.scrollTo(L, winTop);
          } catch (_g1) {}
        }
        try {
          if (se) {
            var maxXs = Math.max(0, se.scrollWidth - se.clientWidth);
            var maxYs = Math.max(0, se.scrollHeight - se.clientHeight);
            se.scrollLeft = Math.max(0, Math.min(L, maxXs));
            se.scrollTop = Math.max(0, Math.min(rootTop, maxYs));
          }
        } catch (_g2) {}

        if (inner) {
          try {
            inner.scrollLeft = Math.max(0, Math.min(L, innerMaxX));
            inner.scrollTop = Math.max(0, Math.min(T, innerMaxY));
          } catch (_h) {}
        }
      }

      function closeEnough(p) {
        return Math.abs(p.sx - L) <= TOL && Math.abs(p.sy - T) <= TOL;
      }

      return new Promise(function (resolve) {
        var n = 0;
        function scheduleStep() {
          applyOnce();
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              var p = readEffective();
              if (closeEnough(p) || n >= MAX) {
                resolve({
                  ok: closeEnough(p),
                  at: p,
                  target: { x: L, y: T },
                  lockedMeta: snapshotLockedMeta(),
                });
                return;
              }
              n += 1;
              setTimeout(scheduleStep, 50);
            });
          });
        }
        scheduleStep();
      }).then(function (r) {
        return JSON.stringify(r);
      });
    })()
  `;
}

/**
 * One-shot effective scroll position using the same merge + overflow-ancestor probe as {@link scrollGuestApplyAndVerify}.
 * Intended for `executeJavaScriptInIsolatedWorld` so it matches SCROLL_TO (picker previously read only in the main world).
 */
function scrollGuestReadPositionSnapshot() {
  return `
    (function () {
      function mergeRootsIntoXY(sx, sy) {
        var roots = [];
        try {
          if (document.scrollingElement) roots.push(document.scrollingElement);
        } catch (_a) {}
        try {
          roots.push(document.documentElement, document.body);
        } catch (_b) {}
        var seen = new WeakSet();
        for (var i = 0; i < roots.length; i++) {
          var el = roots[i];
          if (!el || seen.has(el)) continue;
          seen.add(el);
          try {
            if (el.scrollLeft > sx) sx = el.scrollLeft;
            if (el.scrollTop > sy) sy = el.scrollTop;
          } catch (_c) {}
        }
        return { sx: sx, sy: sy };
      }

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

      var lockedInner = primaryScrollTargetFromViewport();
      var sx = window.scrollX || window.pageXOffset || 0;
      var sy = window.scrollY || window.pageYOffset || 0;
      var m = mergeRootsIntoXY(sx, sy);
      sx = m.sx;
      sy = m.sy;
      if (lockedInner) {
        try {
          if (lockedInner.scrollLeft > sx) sx = lockedInner.scrollLeft;
          if (lockedInner.scrollTop > sy) sy = lockedInner.scrollTop;
        } catch (_f) {}
      }
      return JSON.stringify({ sx: sx, sy: sy });
    })()
  `;
}

/**
 * Same effective scroll merge as {@link scrollGuestReadPositionSnapshot} plus Visual Viewport API fields (debug drift).
 */
function scrollGuestReadDiagnosticsSnapshot() {
  return `
    (function () {
      function mergeRootsIntoXY(sx, sy) {
        var roots = [];
        try {
          if (document.scrollingElement) roots.push(document.scrollingElement);
        } catch (_a) {}
        try {
          roots.push(document.documentElement, document.body);
        } catch (_b) {}
        var seen = new WeakSet();
        for (var i = 0; i < roots.length; i++) {
          var el = roots[i];
          if (!el || seen.has(el)) continue;
          seen.add(el);
          try {
            if (el.scrollLeft > sx) sx = el.scrollLeft;
            if (el.scrollTop > sy) sy = el.scrollTop;
          } catch (_c) {}
        }
        return { sx: sx, sy: sy };
      }

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

      var lockedInner = primaryScrollTargetFromViewport();
      var sx = window.scrollX || window.pageXOffset || 0;
      var sy = window.scrollY || window.pageYOffset || 0;
      var m = mergeRootsIntoXY(sx, sy);
      sx = m.sx;
      sy = m.sy;
      if (lockedInner) {
        try {
          if (lockedInner.scrollLeft > sx) sx = lockedInner.scrollLeft;
          if (lockedInner.scrollTop > sy) sy = lockedInner.scrollTop;
        } catch (_f) {}
      }

      var vvPageTop = null;
      var vvOffsetTop = null;
      var vvScale = null;
      try {
        if (window.visualViewport) {
          vvPageTop = window.visualViewport.pageTop;
          vvOffsetTop = window.visualViewport.offsetTop;
          vvScale = window.visualViewport.scale;
        }
      } catch (_vv) {}

      return JSON.stringify({
        sx: sx,
        sy: sy,
        vvPageTop: vvPageTop,
        vvOffsetTop: vvOffsetTop,
        vvScale: vvScale,
      });
    })()
  `;
}

/**
 * Run scroll injection in a Chromium isolated world so Zone.js cannot replace Promise/Fetch results before IPC.
 * @param {Electron.WebContents} wc
 * @param {string} scrollSourceCode
 */
async function executeScrollGuestScript(wc, scrollSourceCode) {
  if (!wc || wc.isDestroyed()) {
    throw new Error('SCROLL_TO: runner webContents unavailable');
  }
  if (typeof wc.executeJavaScriptInIsolatedWorld === 'function') {
    return wc.executeJavaScriptInIsolatedWorld(942041, [{ code: scrollSourceCode }], true);
  }
  return wc.executeJavaScript(scrollSourceCode, true);
}

/**
 * Unwrap `executeJavaScript` / isolated-world results (Zone.js thenables, JSON strings).
 * @param {unknown} raw
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function parseScrollGuestJsonResult(raw) {
  let v = raw;
  for (let depth = 0; depth < 12 && v != null && typeof v.then === 'function'; depth += 1) {
    v = await v;
  }
  if (typeof v === 'string') {
    try {
      return JSON.parse(v);
    } catch (_parseErr) {
      return null;
    }
  }
  if (v && typeof v === 'object') {
    return /** @type {Record<string, unknown>} */ (v);
  }
  return null;
}

/** Injected into guest pages: `iframeA >>> iframeB |>| shadowHost |>| innerCmp` (+ plain CSS). */
function guestDeepSelectorHelperSource() {
  return `
    const AW_DEEP_RE = /\\s*>>>\\s*/;
    const AW_SHADOW_RE = /\\s*\\|>\\|\\s*/;

    function awIsShadowRootLike(rn) {
      try {
        return rn && rn.nodeType === 11 && !!rn.host;
      } catch (_) {
        return false;
      }
    }

    /** Last hop is optionally pierced open shadow DOM (Usercentrics, etc.). */
    function awResolveShadowTrail(scope, remainder) {
      const r = String(remainder || '').trim();
      if (!r) return null;
      if (!AW_SHADOW_RE.test(r)) {
        try {
          return scope.querySelector(r);
        } catch (_) {
          return null;
        }
      }
      const chunks = r.split(AW_SHADOW_RE).map(function (x) {
        return x.trim();
      }).filter(Boolean);
      let probe = scope;
      for (let ci = 0; ci < chunks.length; ci++) {
        let el = null;
        try {
          el = probe.querySelector(chunks[ci]);
        } catch (_) {
          return null;
        }
        if (!el) return null;
        if (ci === chunks.length - 1) return el;
        const sr = el.shadowRoot;
        if (!sr || sr.mode !== 'open') return null;
        probe = sr;
      }
      return null;
    }

    function awResolveDeepSelector(docRoot, compound) {
      const s = String(compound || '').trim();
      if (!AW_DEEP_RE.test(s)) {
        return awResolveShadowTrail(docRoot, s);
      }
      const ifSeg = s.split(AW_DEEP_RE).map(function (t) {
        return t.trim();
      }).filter(Boolean);
      let ctxDoc = docRoot;
      for (let k = 0; k < ifSeg.length; k++) {
        const chunk = ifSeg[k];
        const last = k === ifSeg.length - 1;
        if (last) return awResolveShadowTrail(ctxDoc, chunk);
        let frameEl = null;
        try {
          frameEl = ctxDoc.querySelector(chunk);
        } catch (_) {
          return null;
        }
        if (!frameEl || !frameEl.contentDocument) return null;
        ctxDoc = frameEl.contentDocument;
      }
      return null;
    }

    /** Removes state classes that exist only while a menu is open (picker noise). */
    function awStripVolatileHoverClasses(sel) {
      return String(sel || '')
        .replace(
          /\.(?:active|submenu-active|open|show|expanded|hover|focused|selected|is-active|is-open|is-expanded)(?=[.#:\\s>,\\[]|$)/gi,
          '',
        )
        .replace(/\\s{2,}/g, ' ')
        .trim();
    }

    function awHoverSelectorAttempts(compound) {
      const base = String(compound || '').trim();
      /** @type {string[]} */
      const attempts = [];
      const push = function (s) {
        const t = String(s || '').trim();
        if (t && attempts.indexOf(t) < 0) attempts.push(t);
      };
      push(base);
      push(awStripVolatileHoverClasses(base));
      const segs = base.split(/\\s*>\\s*/);
      for (let len = segs.length; len >= 1; len--) {
        const suffix = segs.slice(segs.length - len).join(' > ');
        push(suffix);
        push(awStripVolatileHoverClasses(suffix));
      }
      return attempts;
    }

    /** Resolves hover target; falls back when picked selectors include transient menu state. */
    function awResolveHoverTarget(docRoot, compound) {
      const attempts = awHoverSelectorAttempts(compound);
      for (let ai = 0; ai < attempts.length; ai++) {
        const el = awResolveDeepSelector(docRoot, attempts[ai]);
        if (el) return { el: el, matched: attempts[ai] };
      }
      return null;
    }

    /** Element center in top-level webContents coordinates (for native mouse input). */
    function awClientCenterInTopWindow(el) {
      var r = el.getBoundingClientRect();
      var x = r.left + Math.min(r.width / 2, Math.max(r.width - 1, 0));
      var y = r.top + Math.min(r.height / 2, Math.max(r.height - 1, 0));
      var w = el.ownerDocument && el.ownerDocument.defaultView;
      while (w && w !== w.top) {
        var fe = w.frameElement;
        if (!fe) break;
        var fr = fe.getBoundingClientRect();
        x += fr.left;
        y += fr.top;
        w = fe.ownerDocument && fe.ownerDocument.defaultView;
      }
      return { ix: Math.round(x), iy: Math.round(y) };
    }

    /** Dispatches mouseover / mouseenter along the ancestor chain (JS-driven menus). */
    function awDispatchHoverChain(el, clientX, clientY) {
      var path = [];
      var cur = el;
      while (cur && cur.nodeType === 1) {
        path.unshift(cur);
        cur = cur.parentElement;
      }
      for (var pi = 0; pi < path.length; pi++) {
        var node = path[pi];
        var base = {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: clientX,
          clientY: clientY,
          screenX: clientX + window.screenX,
          screenY: clientY + window.screenY,
          composed: true
        };
        node.dispatchEvent(new MouseEvent('mousemove', base));
        node.dispatchEvent(new MouseEvent('mouseover', base));
        try {
          node.dispatchEvent(new MouseEvent('mouseenter', {
            bubbles: false,
            cancelable: true,
            view: window,
            clientX: clientX,
            clientY: clientY,
            composed: true
          }));
        } catch (_) {}
        try {
          var peOpts = {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: clientX,
            clientY: clientY,
            composed: true,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
            buttons: 0
          };
          node.dispatchEvent(new PointerEvent('pointermove', peOpts));
          node.dispatchEvent(new PointerEvent('pointerover', peOpts));
          node.dispatchEvent(new PointerEvent('pointerenter', {
            bubbles: false,
            cancelable: true,
            view: window,
            clientX: clientX,
            clientY: clientY,
            composed: true,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
            buttons: 0
          }));
        } catch (_) {}
      }
    }
  `;
}

class E2eService {
  constructor() {
    installE2eRunnerPartitionHooks();
    this.window = null;
    /** @type Map<string, { pattern: string; method: string; mutate: boolean; interceptAction?: 'modify'|'block'; amendHeaders: Record<string,string>; replacePostBody: string; settle: (cap: Record<string, unknown>) => void; settled: boolean; timeoutTimer: NodeJS.Timeout | null }>} */
    this.captureById = new Map();
    /** @type Map<string, { url: string; method: string; headers?: Record<string, string> }> */
    this.requestMetaById = new Map();
    /** @type Map<string, { url: string; response: Record<string, unknown> }> */
    this.responseMetaById = new Map();
    this.isDebugging = false;
    this.fetchInterceptDepth = 0;
    this.currentStep = '';
    /** Last `show` passed to {@link execute}; used instead of `isVisible()` to avoid nuking the runner when the OS hides/minimizes the window. */
    this.lastRunnerShowPreference = null;
    /**
     * Last explicit SCROLL_TO target for restabilizing before SCREENSHOT (sites may nudge scroll during the capture delay).
     * Cleared on navigation and steps that move the viewport (click/hover/type).
     * @type {{ left: number; top: number; setAt: number } | null}
     */
    this.lastExplicitScroll = null;
    /** Set via `e2e:signal-cancel` so in-flight `execute` can abort without waiting for step timeout. */
    this.executeCancelRequested = false;
    /**
     * Flow-run scoped: while count is positive and the runner is user-visible, OS pointer/keyboard are blocked so stray
     * clicks/hover cannot disturb automation (`sendInputEvent` still works). Nested TRIGGER flows use refcounting.
     */
    this.visibleRunnerInputLockCount = 0;
  }

  /**
   * Installs a one-time gate so physical keyboard does not reach the guest while {@link visibleRunnerInputLockCount} is active.
   * Mouse uses {@link BrowserWindow#setIgnoreMouseEvents} separately (stealth mode already sets that).
   * @param {Electron.WebContents} wc
   */
  installRunnerWebContentsInputGate(wc) {
    if (!wc || wc.isDestroyed() || wc.awE2eInputGateInstalled) return;
    wc.awE2eInputGateInstalled = true;
    wc.on('before-input-event', (event) => {
      if (this.visibleRunnerInputLockCount > 0 && this.lastRunnerShowPreference !== false) {
        event.preventDefault();
      }
    });
  }

  acquireVisibleRunnerInputLock() {
    this.visibleRunnerInputLockCount++;
    if (this.visibleRunnerInputLockCount === 1) {
      this.syncVisibleRunnerInputLockWithWindow();
    }
  }

  releaseVisibleRunnerInputLock() {
    if (this.visibleRunnerInputLockCount <= 0) return;
    this.visibleRunnerInputLockCount--;
    if (this.visibleRunnerInputLockCount === 0) {
      this.clearVisibleRunnerInputLock();
    }
  }

  /** Applies mouse passthrough when a visible flow holds the lock and the runner window exists. */
  syncVisibleRunnerInputLockWithWindow() {
    if (this.visibleRunnerInputLockCount <= 0) return;
    const win = this.window;
    if (!win || win.isDestroyed()) return;
    if (this.lastRunnerShowPreference === false) return;
    try {
      win.setIgnoreMouseEvents(true);
    } catch (_) {}
  }

  /** Restores mouse hits when the lock refcount reaches zero (visible runner only). */
  clearVisibleRunnerInputLock() {
    const win = this.window;
    if (!win || win.isDestroyed()) return;
    if (this.lastRunnerShowPreference === false) return;
    try {
      win.setIgnoreMouseEvents(false);
    } catch (_) {}
  }

  /**
   * CSS `:hover` and mega-menus need real pointer delivery; stealth / input-lock modes block it.
   * @returns {() => void} call in `finally` to restore prior runner chrome
   */
  prepareRunnerForPointerHover() {
    const win = this.window;
    if (!win || win.isDestroyed()) return () => {};
    const preferHidden = this.lastRunnerShowPreference === false;
    const restoreInputLock =
      this.visibleRunnerInputLockCount > 0 && !preferHidden;
    if (preferHidden) {
      clearE2eRunnerStealth(win);
    } else if (restoreInputLock) {
      try {
        win.setIgnoreMouseEvents(false);
      } catch (_) {}
    }
    return () => {
      if (preferHidden) {
        applyE2eRunnerStealth(win);
      } else if (restoreInputLock) {
        this.syncVisibleRunnerInputLockWithWindow();
      }
    };
  }

  /** Called from renderer when the user cancels a flow (ipc send — does not queue behind `e2e:execute`). */
  signalExecuteCancel() {
    this.executeCancelRequested = true;
  }

  /**
   * Rejects when {@link signalExecuteCancel} fires; stops navigation when possible.
   * @template T
   * @param {Promise<T>} promise
   * @returns {Promise<T>}
   */
  async raceWithExecuteCancel(promise) {
    let iv = null;
    try {
      return await Promise.race([
        promise,
        new Promise((_, rej) => {
          iv = setInterval(() => {
            if (!this.executeCancelRequested) return;
            if (iv) clearInterval(iv);
            iv = null;
            try {
              const wc = this.window?.webContents;
              if (wc && !wc.isDestroyed()) wc.stop();
            } catch (_) {}
            rej(new Error('Flow run cancelled by user.'));
          }, 80);
        }),
      ]);
    } finally {
      if (iv) clearInterval(iv);
    }
  }

  /** E2E WAIT step: interruptible sleep. */
  async sleepE2eWaitMs(totalMs) {
    const end = Date.now() + Math.max(0, Number(totalMs) || 0);
    while (Date.now() < end) {
      if (this.executeCancelRequested) {
        throw new Error('Flow run cancelled by user.');
      }
      await new Promise((r) => setTimeout(r, Math.min(100, end - Date.now())));
    }
  }

  /**
   * Clears cookies, storage, and cache for the E2E runner partition only (see `E2E_RUNNER_PARTITION`).
   */
  async clearRunnerSession() {
    this.teardownCaptureState();
    const ses = session.fromPartition(E2E_RUNNER_PARTITION);
    try {
      await ses.clearStorageData({
        storages: [
          'cookies',
          'filesystem',
          'indexdb',
          'localstorage',
          'shadercache',
          'websql',
          'serviceworkers',
          'cachestorage',
        ],
      });
    } catch (err) {
      console.warn('[E2E] clearRunnerSession failed:', err.message || err);
    }
    this.lastExplicitScroll = null;
  }

  /**
   * `sendInputEvent` and `capturePage` require an OS-backed surface; a fully hidden runner often ignores input
   * or captures stale pixels on Windows (see debug H5: winVisible false at SCREENSHOT).
   * When the user disables “Show E2E window”, we still call `show()` but apply stealth (opacity 0, no taskbar,
   * off-screen) so compositing works without a visible browser chrome.
   */
  async ensureRunnerWindowSurface() {
    const win = this.window;
    if (!win || win.isDestroyed()) return;
    const preferHidden = this.lastRunnerShowPreference === false;
    try {
      if (!preferHidden) {
        clearE2eRunnerStealth(win);
      }
      if (!win.isVisible()) {
        if (preferHidden) applyE2eRunnerStealth(win);
        win.show();
      } else if (preferHidden) {
        applyE2eRunnerStealth(win);
      }
      if (!preferHidden) win.focus();
      /** Before the first `loadURL`, the guest is often `about:blank` with no reliable `load` event — paint settle would hang until step timeout (see debug H3: no preLoad, then CLOSE ~10s later). */
      let url = '';
      try {
        url = String(win.webContents.getURL() || '');
      } catch (_) {}
      const noCommittedDoc =
        !url || url === 'about:blank' || url.startsWith('chrome-error://');
      if (!noCommittedDoc) {
        await awaitGuestPaintSettled(win.webContents);
      }
    } catch (_) {}
    this.syncVisibleRunnerInputLockWithWindow();
  }

  /** Hide runner again after SCREENSHOT when the flow runs with `show: false`. */
  restoreRunnerHiddenIfPreferred(showPreference) {
    if (showPreference) return;
    const win = this.window;
    if (!win || win.isDestroyed()) return;
    try {
      win.hide();
      clearE2eRunnerStealth(win);
    } catch (_) {}
  }

  async execute(
    action,
    selector,
    value,
    timeout = 5000,
    show = true,
    ipcSender = null,
    screenshotPath,
    screenshotFileName,
  ) {
    if (action === 'OPEN_PAGE') action = 'NAVIGATE_TO';
    if (action !== 'GET_CURRENT_URL') {
      console.log(`[E2E] Executing ${action} (show: ${show})`);
    }
    this.executeCancelRequested = false;

    const showPreferenceChanged =
      this.window &&
      !this.window.isDestroyed() &&
      this.lastRunnerShowPreference !== null &&
      this.lastRunnerShowPreference !== show;

    if (showPreferenceChanged) {
      console.log(
        `[E2E] Runner show preference changed (${this.lastRunnerShowPreference} → ${show}), recreating window...`,
      );
      this.window.close();
      this.window = null;
      this.lastRunnerShowPreference = null;
      this.lastExplicitScroll = null;
    }

    if (!this.window || this.window.isDestroyed()) {
      console.log(`[E2E] Creating new window (show: ${show})`);
      const wantInitialChrome = !!show;
      this.window = new BrowserWindow({
        /** Native window color behind the guest until the document paints (not the site’s CSS). White matches a normal browser chrome. */
        show: false,
        width: 1280,
        height: 800,
        title: 'API Workbench - E2E Runner',
        icon: resolveWindowIcon(),
        backgroundColor: '#ffffff',
        webPreferences: {
          partition: E2E_RUNNER_PARTITION,
          preload: E2E_PICK_BRIDGE_PRELOAD,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: false,
          backgroundThrottling: false,
          /**
           * Must stay false: `webContents.capturePage()` throws
           * "Current display surface not available for capture" for true offscreen windows.
           * Hidden runs use `show: false` on a normal window instead.
           */
          offscreen: false,
        }
      });

      this.window.setMenuBarVisibility(false);
      this.window.setAutoHideMenuBar(true);

      const win = this.window;
      win.once('ready-to-show', () => {
        try {
          if (wantInitialChrome && win && !win.isDestroyed()) win.show();
        } catch (_) {}
      });
      setTimeout(() => {
        try {
          if (
            wantInitialChrome &&
            win &&
            !win.isDestroyed() &&
            !win.isVisible()
          ) {
            win.show();
          }
        } catch (_) {}
      }, 2500);

      applyE2eRunnerChromeLikeUserAgent(this.window.webContents);
      this.installRunnerWebContentsInputGate(this.window.webContents);

      win.webContents.on('did-finish-load', () => {
        void applyGuestWindowCloseShield(win.webContents);
      });
      void applyGuestWindowCloseShield(win.webContents);
    }

    this.lastRunnerShowPreference = show;

    if (show && this.window && !this.window.isDestroyed()) {
      try {
        /** Picker sessions call `hide()`; flow steps need a real surface again for HUD + capturePage. */
        clearE2eRunnerStealth(this.window);
        if (!this.window.isVisible()) this.window.show();
        this.window.focus();
      } catch (_) {}
      this.syncVisibleRunnerInputLockWithWindow();
    }

    this.currentStep = action;
    /** Open page: avoid `executeJavaScript` on `about:blank` right before `loadURL` (renderer edge cases). */
    const skipInitialHud = show && action === 'NAVIGATE_TO';
    if (show && !skipInitialHud) {
      await this.injectHUD().catch((err) => console.warn('[E2E] injectHUD:', err?.message || err));
      await this.updateHUD('running', action, selector);
    }

    try {
      let result;
      switch (action) {
        case 'NAVIGATE_TO': {
          this.lastExplicitScroll = null;
          const navUrl = selector || value;
          if (!navUrl || !String(navUrl).trim()) {
            throw new Error('NAVIGATE_TO requires a URL in Selector / URL');
          }
          const navTimeoutMs = Math.max(Number(timeout) || 5000, 500);
          // Same as CLICK / SCREENSHOT: hidden runs must `show()` (stealth) before navigation so load commits reliably.
          await this.raceWithExecuteCancel(
            Promise.race([
              (async () => {
                await this.ensureRunnerWindowSurface();
                const resolvedUrl = normalizeE2eBrowseUrl(String(navUrl));
                applyE2eRunnerChromeLikeUserAgent(this.window.webContents);
                console.log('[E2E] Open page loadURL →', resolvedUrl, 'UA →', this.window.webContents.getUserAgent());
                await loadUrlReportingFailures(this.window.webContents, resolvedUrl);
                await awaitGuestPaintSettled(this.window.webContents);
                await awaitSpaLateRenderSettled(this.window.webContents, Math.min(navTimeoutMs, 4000));
                await new Promise((r) => setTimeout(r, 200));
                const loadedUrl = this.window.webContents.getURL();
                if (!loadedUrl || loadedUrl === 'about:blank' || loadedUrl.startsWith('chrome-error://')) {
                  throw new Error(
                    `Open page did not load (address is "${loadedUrl || ''}"). Check the URL and protocol — local dev servers usually need http://localhost, not https.`,
                  );
                }
                if (show) {
                  await this.injectHUD().catch((err) => console.warn('[E2E] injectHUD:', err?.message || err));
                  await this.updateHUD('running', action, selector);
                }
              })(),
              new Promise((_, reject) =>
                setTimeout(
                  () =>
                    reject(
                      new Error(
                        `Open page timed out after ${navTimeoutMs} ms (navigation or paint did not finish). Increase Timeout or check the URL.`,
                      ),
                    ),
                  navTimeoutMs,
                ),
              ),
            ]),
          );
          result = { success: true };
          break;
        }

        case 'CLICK': {
          this.lastExplicitScroll = null;
          const subCf = parseSubframeTerminalSelector(selector);
          const compoundJson = JSON.stringify(subCf ? subCf.inner : String(selector ?? ''));
          const clickWaitMs = Math.max(Number(timeout) || 5000, 500);
          const shadowBoost =
            !subCf && e2eSelectorPrefersDomClick(selector) ? Math.min(4000, clickWaitMs) : 0;
          const effectiveClickWaitMs = clickWaitMs + shadowBoost;
          const clickPollMs = 250;
          const clickMaxAttempts = Math.max(1, Math.ceil(effectiveClickWaitMs / clickPollMs));

          const domFallbackClickScript = `
            (async function() {
              ${guestDeepSelectorHelperSource()}
              const compound = ${compoundJson};
              const findEl = () => awResolveDeepSelector(document, compound);
              let el = findEl();
              for (let i = 0; i < ${clickMaxAttempts}; i++) {
                if (el) break;
                await new Promise(r => setTimeout(r, ${clickPollMs}));
                el = findEl();
              }
              if (!el) {
                throw new Error(
                  'Element not found: ' + compound +
                  '. If this is a cookie banner or SPA widget, add a Wait step before the click or increase Timeout.',
                );
              }
              el.scrollIntoView({ behavior: 'auto', block: 'center' });
              await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
              var r = el.getBoundingClientRect();
              var x = r.left + Math.min(r.width / 2, Math.max(r.width - 1, 0));
              var y = r.top + Math.min(r.height / 2, Math.max(r.height - 1, 0));
              var base = {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: x,
                clientY: y,
                button: 0,
                buttons: 1,
                composed: true
              };
              try { el.dispatchEvent(new MouseEvent('mousemove', base)); } catch (_c0) {}
              try { el.dispatchEvent(new MouseEvent('mouseover', base)); } catch (_c1) {}
              try {
                el.dispatchEvent(new PointerEvent('pointerdown', {
                  bubbles: true,
                  cancelable: true,
                  view: window,
                  clientX: x,
                  clientY: y,
                  composed: true,
                  pointerId: 1,
                  pointerType: 'mouse',
                  isPrimary: true,
                  pressure: 0.5
                }));
              } catch (_c2) {}
              try { el.dispatchEvent(new MouseEvent('mousedown', base)); } catch (_c3) {}
              try {
                if (typeof el.focus === 'function') el.focus({ preventScroll: true });
              } catch (_c4) {}
              try { el.click(); } catch (_c5) {}
              try {
                var tag = (el.tagName || '').toUpperCase();
                var role = el.getAttribute && el.getAttribute('role');
                if (tag === 'BUTTON' || tag === 'A' || role === 'button') {
                  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
                  el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
                }
              } catch (_c6) {}
              try {
                el.dispatchEvent(new MouseEvent('mouseup', {
                  bubbles: true,
                  cancelable: true,
                  view: window,
                  clientX: x,
                  clientY: y,
                  button: 0,
                  buttons: 0,
                  composed: true
                }));
              } catch (_c7) {}
              try {
                el.dispatchEvent(new PointerEvent('pointerup', {
                  bubbles: true,
                  cancelable: true,
                  view: window,
                  clientX: x,
                  clientY: y,
                  composed: true,
                  pointerId: 1,
                  pointerType: 'mouse',
                  isPrimary: true,
                  buttons: 0
                }));
              } catch (_c8) {}
              return true;
            })()
          `;

          const prepareCenterScript = `
            (async function() {
              ${guestDeepSelectorHelperSource()}
              const compound = ${compoundJson};
              const findEl = () => awResolveDeepSelector(document, compound);
              let el = findEl();
              for (let i = 0; i < ${clickMaxAttempts}; i++) {
                if (el) break;
                await new Promise(r => setTimeout(r, ${clickPollMs}));
                el = findEl();
              }
              if (!el) {
                throw new Error(
                  'Element not found: ' + compound +
                  '. If this is a cookie banner or SPA widget, add a Wait step before the click or increase Timeout.',
                );
              }
              el.scrollIntoView({ behavior: 'auto', block: 'center' });
              await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
              var center = awClientCenterInTopWindow(el);
              return { ok: true, ix: center.ix, iy: center.iy };
            })()
          `;

          await this.raceWithExecuteCancel(
            (async () => {
              const wc = this.window.webContents;
              await this.ensureRunnerWindowSurface();

              if (!subCf) {
                const preferDomClick = e2eSelectorPrefersDomClick(selector);
                if (preferDomClick) {
                  await runScopedGuestScript(wc, selector, domFallbackClickScript);
                } else {
                  let nativeClicked = false;
                  try {
                    const pos = await evaluateScopedGuestScript(wc, selector, prepareCenterScript);
                    if (
                      pos &&
                      pos.ok === true &&
                      typeof pos.ix === 'number' &&
                      typeof pos.iy === 'number'
                    ) {
                      try {
                        await sendNativeClickAtContentCoordinates(wc, pos.ix, pos.iy);
                        nativeClicked = true;
                      } catch (nativeErr) {
                        console.warn(
                          '[E2E] Native click failed, using DOM events:',
                          nativeErr?.message || nativeErr,
                        );
                      }
                    }
                  } catch (prepErr) {
                    console.warn(
                      '[E2E] Native click prepare failed, using DOM events:',
                      prepErr instanceof Error ? prepErr.message : prepErr,
                    );
                  }
                  if (!nativeClicked) {
                    await runScopedGuestScript(wc, selector, domFallbackClickScript);
                  }
                }
              } else {
                await runScopedGuestScript(wc, selector, domFallbackClickScript);
              }

              await awaitGuestPaintSettled(wc);
              await new Promise((r) => setTimeout(r, 480));
            })(),
          );
          result = { success: true };
          break;
        }

        case 'HOVER':
        case 'MOVE_TO': {
          this.lastExplicitScroll = null;
          /** MOVE_TO kept as legacy alias — same behavior as HOVER. */
          const subH = parseSubframeTerminalSelector(selector);
          const compoundJsonH = JSON.stringify(subH ? subH.inner : String(selector ?? ''));
          const hoverWaitMs = Math.max(Number(timeout) || 5000, 500);
          const hoverPollMs = 250;
          const hoverMaxAttempts = Math.max(1, Math.ceil(hoverWaitMs / hoverPollMs));
          const hoverScript = `
            (async function() {
              ${guestDeepSelectorHelperSource()}
              const compound = ${compoundJsonH};
              if (!compound) throw new Error('Selector is required');
              let resolved = null;
              for (let i = 0; i < ${hoverMaxAttempts}; i++) {
                resolved = awResolveHoverTarget(document, compound);
                if (resolved) break;
                await new Promise(r => setTimeout(r, ${hoverPollMs}));
              }
              if (!resolved) {
                throw new Error(
                  'Element not found: ' + compound +
                  '. Megamenu/submenu selectors often include .active or .submenu-active from picking while the menu was open — add a Hover step on the parent menu item first, or re-pick the closed-menu target.',
                );
              }
              const el = resolved.el;
              el.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
              await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
              const r = el.getBoundingClientRect();
              const x = r.left + Math.min(r.width / 2, Math.max(r.width - 1, 0));
              const y = r.top + Math.min(r.height / 2, Math.max(r.height - 1, 0));
              awDispatchHoverChain(el, x, y);
              return true;
            })()
          `;
          const prepareHoverCenterScript = `
            (async function() {
              ${guestDeepSelectorHelperSource()}
              const compound = ${compoundJsonH};
              if (!compound) throw new Error('Selector is required');
              let resolved = null;
              for (let i = 0; i < ${hoverMaxAttempts}; i++) {
                resolved = awResolveHoverTarget(document, compound);
                if (resolved) break;
                await new Promise(r => setTimeout(r, ${hoverPollMs}));
              }
              if (!resolved) {
                throw new Error(
                  'Element not found: ' + compound +
                  '. Megamenu/submenu selectors often include .active or .submenu-active from picking while the menu was open — add a Hover step on the parent menu item first, or re-pick the closed-menu target.',
                );
              }
              const el = resolved.el;
              el.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
              await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
              var center = awClientCenterInTopWindow(el);
              return { ok: true, ix: center.ix, iy: center.iy, matched: resolved.matched || compound };
            })()
          `;
          await this.raceWithExecuteCancel(
            (async () => {
              const wc = this.window.webContents;
              await this.ensureRunnerWindowSurface();
              const restorePointerDelivery = this.prepareRunnerForPointerHover();

              try {
                if (!subH) {
                  try {
                    const pos = await evaluateScopedGuestScript(wc, selector, prepareHoverCenterScript);
                    if (
                      pos &&
                      pos.ok === true &&
                      typeof pos.ix === 'number' &&
                      typeof pos.iy === 'number'
                    ) {
                      try {
                        await deliverNativeHoverAtContentCoordinates(
                          wc,
                          pos.ix,
                          pos.iy,
                          this.isDebugging,
                        );
                      } catch (nativeErr) {
                        console.warn(
                          '[E2E] Native hover failed, using DOM events:',
                          nativeErr?.message || nativeErr,
                        );
                      }
                    }
                  } catch (prepErr) {
                    console.warn(
                      '[E2E] Native hover prepare failed, using DOM events:',
                      prepErr instanceof Error ? prepErr.message : prepErr,
                    );
                  }
                }

                await runScopedGuestScript(wc, selector, hoverScript);
                await awaitGuestPaintSettled(wc);
                await new Promise((r) => setTimeout(r, 180));
              } finally {
                restorePointerDelivery();
              }
            })(),
          );
          result = { success: true };
          break;
        }

        case 'TYPE_TEXT': {
          this.lastExplicitScroll = null;
          const subT = parseSubframeTerminalSelector(selector);
          const compoundJsonT = JSON.stringify(subT ? subT.inner : String(selector ?? ''));
          const typeScript = `
            (async function() {
              ${guestDeepSelectorHelperSource()}
              const compound = ${compoundJsonT};
              const findEl = () => awResolveDeepSelector(document, compound);
              let el = findEl();
              for (let i = 0; i < 5; i++) {
                if (el) break;
                await new Promise(r => setTimeout(r, 500));
                el = findEl();
              }
              if (el) {
                el.focus();
                el.value = ${JSON.stringify(value)};
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
                el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
                el.blur();
                return true;
              }
              throw new Error('Element not found: ' + compound);
            })()
          `;
          await this.raceWithExecuteCancel(
            (async () => {
              await runScopedGuestScript(this.window.webContents, selector, typeScript);
              await awaitGuestPaintSettled(this.window.webContents);
            })(),
          );
          result = { success: true };
          break;
        }

        case 'SCROLL_TO': {
          const valScroll = String(value ?? '').trim();
          const parts = valScroll.split(/[\s,]+/).filter((p) => p.length > 0);
          let left = 0;
          let top = 0;
          if (parts.length === 1) {
            top = parseFloat(parts[0]);
            if (!Number.isFinite(top)) {
              throw new Error(
                'SCROLL_TO: Value must be a number (document scroll Y in px) or two numbers x,y',
              );
            }
          } else if (parts.length >= 2) {
            left = parseFloat(parts[0]);
            top = parseFloat(parts[1]);
            if (!Number.isFinite(left) || !Number.isFinite(top)) {
              throw new Error('SCROLL_TO: scroll x and y must be numbers');
            }
          } else {
            throw new Error(
              'SCROLL_TO: Set Value to scroll position (e.g. 800 or 0,800), or use Set position on the step editor.',
            );
          }
          await this.raceWithExecuteCancel(
            (async () => {
              await this.ensureRunnerWindowSurface();
              await awaitGuestPaintSettled(this.window.webContents);
              await new Promise((r) => setTimeout(r, 80));
              let scrollOutcome = { ok: false };
              try {
                const scrollJsResult = await executeScrollGuestScript(
                  this.window.webContents,
                  scrollGuestApplyAndVerify(left, top),
                );
                const parsedScroll = await parseScrollGuestJsonResult(scrollJsResult);
                scrollOutcome = {
                  ok: false,
                  ...(parsedScroll && typeof parsedScroll === 'object' ? parsedScroll : {}),
                };
              } catch (scrollErr) {
                console.warn('[E2E] SCROLL_TO guest script error:', scrollErr?.message || scrollErr);
              }
              if (!scrollOutcome.ok) {
                console.warn(
                  '[E2E] SCROLL_TO target may not match page (inner scroll container or layout). Wanted',
                  left,
                  top,
                  'effective',
                  scrollOutcome.at,
                );
              }
              await awaitGuestPaintSettled(this.window.webContents);
              this.lastExplicitScroll = { left, top, setAt: Date.now() };
            })(),
          );
          result = { success: true };
          break;
        }

        case 'SCREENSHOT': {
          await this.ensureRunnerWindowSurface();
          try {
            result = await this.raceWithExecuteCancel(
              (async () => {
            await new Promise((r) => setTimeout(r, 420));
            const ls = this.lastExplicitScroll;
            if (
              ls &&
              this.window &&
              !this.window.isDestroyed() &&
              Number.isFinite(ls.left) &&
              Number.isFinite(ls.top) &&
              Date.now() - ls.setAt <= 120000
            ) {
              try {
                const rawRe = await executeScrollGuestScript(
                  this.window.webContents,
                  scrollGuestApplyAndVerify(ls.left, ls.top),
                );
                await parseScrollGuestJsonResult(rawRe);
              } catch (_reapplyErr) {
                /* capture still attempted */
              }
              await awaitGuestPaintSettled(this.window.webContents);
              await new Promise((r) => setTimeout(r, 80));
            }
            let image;
            try {
              image = await this.window.webContents.capturePage();
            } catch (capErr) {
              const msg = capErr && capErr.message ? String(capErr.message) : String(capErr);
              if (/display surface/i.test(msg) && this.window && !this.window.isDestroyed()) {
                try {
                  await this.ensureRunnerWindowSurface();
                  await new Promise((r) => setTimeout(r, 80));
                  image = await this.window.webContents.capturePage();
                } catch (retryErr) {
                  throw retryErr instanceof Error ? retryErr : new Error(String(retryErr));
                }
              } else {
                throw capErr instanceof Error ? capErr : new Error(String(capErr));
              }
            }
            const buf = image.toPNG();
            const rawPath = String(screenshotPath ?? '').trim();
            const nameHint = String(screenshotFileName ?? '').trim();
            const defaultDir = path.join(app.getPath('userData'), 'e2e-screenshots');
            const fileName = resolveScreenshotBasename(nameHint);

            let outPath;
            if (!rawPath) {
              await fsp.mkdir(defaultDir, { recursive: true });
              outPath = path.join(defaultDir, fileName);
            } else {
              const normalized = path.normalize(rawPath);
              if (!path.isAbsolute(normalized)) {
                await fsp.mkdir(defaultDir, { recursive: true });
                if (looksLikePngFilePath(normalized)) {
                  const bn = path.basename(normalized);
                  const safeBn = sanitizeScreenshotBasename(bn) || fileName;
                  outPath = path.join(defaultDir, safeBn);
                } else {
                  const dirUnder = resolveScreenshotDirUnderDefault(defaultDir, normalized);
                  await fsp.mkdir(dirUnder, { recursive: true });
                  outPath = path.join(dirUnder, fileName);
                }
              } else {
                let st = null;
                try {
                  st = await fsp.stat(normalized);
                } catch {
                  st = null;
                }
                if (st && st.isDirectory()) {
                  outPath = path.join(normalized, fileName);
                } else if (st && st.isFile()) {
                  outPath = normalized;
                } else if (!st) {
                  if (looksLikePngFilePath(normalized)) {
                    outPath = normalized;
                  } else {
                    await fsp.mkdir(normalized, { recursive: true });
                    outPath = path.join(normalized, fileName);
                  }
                } else {
                  throw new Error(`Cannot save screenshot: unsupported path type: ${normalized}`);
                }
              }
            }

            await fsp.mkdir(path.dirname(outPath), { recursive: true });
            await fsp.writeFile(outPath, buf);
            return { success: true, data: { savedPath: outPath } };
              })(),
            );
          } finally {
            this.restoreRunnerHiddenIfPreferred(show);
          }
          break;
        }

        case 'WAIT':
          await this.sleepE2eWaitMs(parseInt(value, 10) || 1000);
          result = { success: true };
          break;

        case 'ASSERT_ELEMENT': {
          const subA = parseSubframeTerminalSelector(selector);
          const compoundJsonA = JSON.stringify(subA ? subA.inner : String(selector ?? ''));
          const assertScript = `
            (function() {
              ${guestDeepSelectorHelperSource()}
              const compound = ${compoundJsonA};
              return !!awResolveDeepSelector(document, compound);
            })()
          `;
          const exists = await this.raceWithExecuteCancel(
            evaluateScopedGuestScript(this.window.webContents, selector, assertScript),
          );
          if (!exists) throw new Error(`Assertion failed: Element ${selector} not found`);
          result = { success: true };
          break;
        }

        case 'GET_CURRENT_URL':
          result = {
            success: true,
            data: { url: String(this.window.webContents.getURL() || '') },
          };
          break;

        case 'ASSERT_URL':
          const currentUrl = this.window.webContents.getURL();
          if (!currentUrl.includes(selector)) {
            throw new Error(`Assertion failed: URL "${currentUrl}" does not contain "${selector}"`);
          }
          result = { success: true };
          break;

        case 'WAIT_FOR_URL':
          const targetUrl = selector;
          const waitStart = Date.now();
          let match = false;
          while (Date.now() - waitStart < (timeout || 10000)) {
            if (this.executeCancelRequested) {
              throw new Error('Flow run cancelled by user.');
            }
            if (this.window.webContents.getURL().includes(targetUrl)) {
              match = true;
              break;
            }
            await new Promise(r => setTimeout(r, 500));
          }
          if (!match) throw new Error(`Timeout waiting for URL to contain: ${targetUrl}`);
          result = { success: true };
          break;

        case 'WAIT_FOR_PAGE_URL': {
          let operator = 'equals';
          try {
            const opts = typeof value === 'string' ? JSON.parse(value || '{}') : value || {};
            operator = opts.operator === 'contains' ? 'contains' : 'equals';
          } catch (_) {}
          const expectedNorm = normalizePageUrlForE2e(String(selector || '').trim());
          const pageWaitStart = Date.now();
          const pageWaitBudget = Math.max(Number(timeout) || 10000, 500);
          let lastSeenUrl = '';
          let pageMatched = false;
          while (Date.now() - pageWaitStart < pageWaitBudget) {
            if (this.executeCancelRequested) {
              throw new Error('Flow run cancelled by user.');
            }
            lastSeenUrl = String(this.window.webContents.getURL() || '');
            const currentNorm = normalizePageUrlForE2e(lastSeenUrl);
            const matched =
              expectedNorm.length > 0 &&
              (operator === 'contains'
                ? currentNorm.includes(expectedNorm)
                : currentNorm === expectedNorm);
            if (matched) {
              pageMatched = true;
              break;
            }
            await new Promise((r) => setTimeout(r, 250));
          }
          if (!pageMatched) {
            throw new Error(
              `Timeout waiting for page URL (${operator} "${selector}"). Last URL: ${lastSeenUrl}`,
            );
          }
          result = { success: true, data: { url: lastSeenUrl } };
          break;
        }

        case 'ELEMENT_EXISTS': {
          const subE = parseSubframeTerminalSelector(selector);
          const compoundJsonE = JSON.stringify(subE ? subE.inner : String(selector ?? ''));
          const existsScript = `
            (async function() {
              ${guestDeepSelectorHelperSource()}
              const compound = ${compoundJsonE};
              const findEl = () => awResolveDeepSelector(document, compound);
              let el = findEl();
              for (let i = 0; i < 6; i++) {
                if (el) break;
                await new Promise(r => setTimeout(r, 400));
                el = findEl();
              }
              return JSON.stringify({ ok: true, exists: !!el });
            })()
          `;
          const rawEx = await this.raceWithExecuteCancel(
            evaluateScopedGuestScript(this.window.webContents, selector, existsScript),
          );
          let parsedEx;
          try {
            parsedEx = typeof rawEx === 'string' ? JSON.parse(rawEx) : rawEx;
          } catch (_) {
            throw new Error('ELEMENT_EXISTS: invalid JSON from page');
          }
          if (!parsedEx || !parsedEx.ok) throw new Error('ELEMENT_EXISTS failed');
          result = { success: true, data: { exists: !!parsedEx.exists } };
          break;
        }

        case 'READ_ELEMENT_DOM': {
          let prop = 'innerText';
          try {
            const parsedProp = typeof value === 'string' && value.trim() ? JSON.parse(value) : {};
            prop =
              parsedProp.prop === 'innerHTML'
                ? 'innerHTML'
                : parsedProp.prop === 'textContent'
                  ? 'textContent'
                  : 'innerText';
          } catch (_) {}
          const subR = parseSubframeTerminalSelector(selector);
          const compoundJsonR = JSON.stringify(subR ? subR.inner : String(selector ?? ''));
          const propJ = JSON.stringify(prop);
          const readScript = `
            (async function() {
              ${guestDeepSelectorHelperSource()}
              const compound = ${compoundJsonR};
              const prop = ${propJ};
              const findEl = () => awResolveDeepSelector(document, compound);
              let el = findEl();
              for (let i = 0; i < 6; i++) {
                if (el) break;
                await new Promise(r => setTimeout(r, 400));
                el = findEl();
              }
              if (!el) return JSON.stringify({ ok: false, error: 'Element not found' });
              let text = '';
              if (prop === 'innerHTML') text = el.innerHTML || '';
              else if (prop === 'textContent') text = el.textContent || '';
              else text = (el.innerText != null ? el.innerText : (el.textContent || '')) || '';
              return JSON.stringify({ ok: true, text });
            })()
          `;
          const rawRead = await this.raceWithExecuteCancel(
            evaluateScopedGuestScript(this.window.webContents, selector, readScript),
          );
          let parsedRead;
          try {
            parsedRead = typeof rawRead === 'string' ? JSON.parse(rawRead) : rawRead;
          } catch (_) {
            throw new Error('READ_ELEMENT_DOM: invalid JSON from page');
          }
          if (!parsedRead || !parsedRead.ok) throw new Error(parsedRead.error || 'READ_ELEMENT_DOM failed');
          result = { success: true, data: { text: parsedRead.text } };
          break;
        }

        case 'START_HTTP_CAPTURE': {
          let spec = {};
          try {
            spec = typeof value === 'string' ? JSON.parse(value || '{}') : value || {};
          } catch (_) {
            spec = {};
          }
          await this.registerHttpCapture(spec, ipcSender);
          result = { success: true };
          break;
        }

        case 'WAIT_FOR_HTTP_CAPTURE': {
          const lid = String(selector || '').trim();
          const cap = await this.waitForHttpCapture(lid, timeout || 10000);
          result = { success: true, data: cap };
          break;
        }

        case 'PEEK_HTTP_CAPTURE': {
          const lid = String(selector || '').trim();
          const reg = lid ? this.captureById.get(lid) : null;
          result = {
            success: true,
            data: reg?.pendingCapture ?? null,
          };
          break;
        }

        case 'STOP_HTTP_CAPTURE': {
          this.teardownCaptureState();
          result = { success: true };
          break;
        }

        case 'CLOSE':
          this.teardownCaptureState();
          if (this.window) {
            this.window.close();
            this.window = null;
          }
          this.lastRunnerShowPreference = null;
          this.lastExplicitScroll = null;
          result = { success: true };
          break;

        default:
          throw new Error(`Unknown E2E action: ${action}`);
      }

      if (show) await this.updateHUD('success', action, selector);
      return result;

    } catch (err) {
      if (show) await this.updateHUD('failed', action, selector);
      throw err;
    }
  }

  async injectHUD() {
    if (!this.window) return;
    const hudCss = `
      #aw-e2e-hud {
        position: fixed;
        bottom: 20px;
        left: 20px;
        top: auto;
        right: auto;
        width: 280px;
        background: rgba(15, 23, 42, 0.85);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        padding: 16px;
        color: white;
        font-family: 'Inter', system-ui, sans-serif;
        z-index: 2147483647;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
        pointer-events: none;
        transition: all 0.3s ease;
        opacity: 0.9;
      }
      .hud-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
      .hud-dot { width: 8px; height: 8px; background: #3b82f6; border-radius: 50%; box-shadow: 0 0 10px #3b82f6; animation: hud-pulse 1.5s infinite; }
      .hud-title { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #94a3b8; }
      .hud-step { font-size: 14px; font-weight: 600; color: #f1f5f9; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .hud-status { font-size: 11px; color: #3b82f6; font-weight: 500; }
      
      @keyframes hud-pulse { 0% { opacity: 0.4; } 50% { opacity: 1; } 100% { opacity: 0.4; } }
      
      .aw-highlight {
        outline: 3px solid #3b82f6 !important;
        outline-offset: 2px !important;
        box-shadow: 0 0 15px rgba(59, 130, 246, 0.5) !important;
        transition: outline 0.2s ease !important;
        position: relative !important;
      }
    `;

    await this.window.webContents.executeJavaScript(`
      (function() {
        if (document.getElementById('aw-e2e-hud')) return;
        const style = document.createElement('style');
        style.textContent = \`${hudCss}\`;
        document.head.appendChild(style);

        const hud = document.createElement('div');
        hud.id = 'aw-e2e-hud';
        hud.innerHTML = \`
          <div class="hud-header">
            <div class="hud-dot"></div>
            <div class="hud-title">API Workbench E2E</div>
          </div>
          <div class="hud-step" id="aw-hud-step">Waiting...</div>
          <div class="hud-status" id="aw-hud-status">Initializing Engine</div>
        \`;
        document.body.appendChild(hud);
      })()
    `);
  }

  async updateHUD(state, action, details = '') {
    if (!this.window) return;
    const statusText = state === 'running' ? 'Executing Operation...' : state === 'success' ? 'Step Completed' : 'Step Failed';
    const statusColor = state === 'running' ? '#3b82f6' : state === 'success' ? '#10b981' : '#ef4444';

    const actionJ = JSON.stringify(String(action ?? ''));
    const statusTextJ = JSON.stringify(statusText);
    const statusColorJ = JSON.stringify(statusColor);
    const detailsJ = JSON.stringify(String(details ?? ''));

    await this.window.webContents.executeJavaScript(`
      (function() {
        const stepEl = document.getElementById('aw-hud-step');
        const statusEl = document.getElementById('aw-hud-status');
        const dotEl = document.querySelector('.hud-dot');
        if (!stepEl) return;

        stepEl.textContent = ${actionJ};
        statusEl.textContent = ${statusTextJ};
        statusEl.style.color = ${statusColorJ};
        if (dotEl) dotEl.style.background = ${statusColorJ};

        document.querySelectorAll('.aw-highlight').forEach(function (el) {
          el.classList.remove('aw-highlight');
        });

        /** Compound selectors (?>>>, |>|, subframe tokens) throw from querySelector and break inject. Skip or catch. */
        const detailsRaw = ${detailsJ};
        try {
          var canHudQuery =
            !!detailsRaw &&
            (detailsRaw.startsWith('#') || detailsRaw.startsWith('.')) &&
            detailsRaw.indexOf('>>>') < 0 &&
            detailsRaw.indexOf('|>|') < 0 &&
            detailsRaw.indexOf('__AW_SUBFRAME__') < 0;
          if (!canHudQuery) return;
          var targetHud = document.querySelector(detailsRaw);
          if (targetHud) targetHud.classList.add('aw-highlight');
        } catch (_) {}
      })()
    `);
  }

  /**
   * Match outgoing URLs against the UI pattern field (listener / interceptor).
   * - `*` or `**` alone → match any URL
   * - ends with `**` → prefix match (text before `**` must appear in the URL), e.g. `api/v1/**`, `/api/**`
   * - ends with `*` → prefix match, e.g. `/api/*`
   * - otherwise → substring contains (legacy), e.g. `submit`, `api/login`
   */
  awUrlMatchesPattern(url, rawPattern) {
    const clean = String(rawPattern || '')
      .toLowerCase()
      .trim()
      .replace(/^\/+/, '');
    const u = String(url || '').toLowerCase();
    if (!clean) return false;
    if (clean === '*' || clean === '**') return !!u;
    if (clean.endsWith('**') && clean.length > 2) {
      const prefix = clean.slice(0, -2);
      return prefix ? u.includes(prefix) : !!u;
    }
    if (clean.endsWith('*') && clean.length > 1) {
      const prefix = clean.slice(0, -1);
      return prefix ? u.includes(prefix) : !!u;
    }
    return u.includes(clean);
  }

  awMethodMatches(want, actual) {
    const w = String(want || '').trim().toUpperCase();
    if (!w || w === '*' || w === '**') return true;
    return String(actual || '').toUpperCase() === w;
  }

  sweepCaptureReg(reg, listenerIdTrim) {
    if (reg.settled) return;
    reg.settled = true;
    if (reg.timeoutTimer) {
      clearTimeout(reg.timeoutTimer);
      reg.timeoutTimer = null;
    }
    this.captureById.delete(listenerIdTrim);
    if (reg.mutate) void this.adjustFetchInterceptdepth(-1);
  }

  async ensureCdpNetworkAttached() {
    if (!this.window || this.window.isDestroyed()) return;
    const dbg = this.window.webContents.debugger;
    if (this.isDebugging) return;

    dbg.attach('1.3');
    await dbg.sendCommand('Network.enable');
    this.isDebugging = true;

    dbg.on('detach', () => {
      this.isDebugging = false;
      this.teardownCaptureState();
    });

    dbg.on('message', async (_e, method, params) => {
      await this.handleCdpMessage(method, params);
    });
  }

  async adjustFetchInterceptdepth(delta) {
    if (!this.window || !this.isDebugging || this.window.isDestroyed()) return;
    const dbg = this.window.webContents.debugger;
    this.fetchInterceptDepth = Math.max(0, this.fetchInterceptDepth + delta);
    try {
      if (this.fetchInterceptDepth > 0) {
        await dbg.sendCommand('Fetch.enable', {
          patterns: [{ urlPattern: '*', requestStage: 'Request' }],
        });
      } else {
        await dbg.sendCommand('Fetch.disable');
      }
    } catch (err) {
      console.warn('[E2E] Fetch.enable/disable:', err.message || err);
    }
  }

  async handleCdpMessage(method, params) {
    if (!this.window || this.window.isDestroyed() || !this.window.webContents) return;
    const dbg = this.window.webContents.debugger;

    if (method === 'Fetch.requestPaused' && params?.requestId) {
      const req = params.request;
      if (!req) {
        await dbg.sendCommand('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
        return;
      }
      const url = req.url || '';
      const methodName = req.method || 'GET';
      let mutated = false;
      for (const [_id, reg] of this.captureById.entries()) {
        if (reg.settled || !reg.mutate) continue;
        if (
          !this.awUrlMatchesPattern(url, reg.pattern) ||
          !this.awMethodMatches(reg.method, methodName)
        )
          continue;
        mutated = true;
        const listenerIdTrim = String(_id).trim();
        const action = reg.interceptAction === 'block' ? 'block' : 'modify';
        if (action === 'block') {
          await dbg
            .sendCommand('Fetch.failRequest', {
              requestId: params.requestId,
              errorReason: 'BlockedByClient',
            })
            .catch(() => {});
          this.sweepCaptureReg(reg, listenerIdTrim);
          break;
        }
        const hdrs = [];
        const base = req.headers || {};
        if (typeof base === 'object' && !Array.isArray(base)) {
          for (const k of Object.keys(base)) hdrs.push({ name: k, value: String(base[k]) });
        }
        const amend = reg.amendHeaders || {};
        for (const nk of Object.keys(amend)) {
          const vv = amend[nk];
          const idx = hdrs.findIndex((h) => h.name.toLowerCase() === nk.toLowerCase());
          if (idx >= 0) hdrs.splice(idx, 1);
          if (vv === null || vv === undefined) continue;
          hdrs.push({ name: nk, value: String(vv) });
        }
        const btNorm = String(reg.replaceBodyType || 'none').trim();
        if (
          btNorm === 'binary' &&
          reg.replaceBinaryContentType &&
          String(reg.replaceBinaryContentType).trim()
        ) {
          const ct = String(reg.replaceBinaryContentType).trim();
          if (ct && !hdrs.some((h) => h.name.toLowerCase() === 'content-type')) {
            hdrs.push({ name: 'Content-Type', value: ct });
          }
        }
        let outUrl = url;
        const qRows = reg.amendQueryParams;
        if (Array.isArray(qRows) && qRows.length > 0) {
          outUrl = applyInterceptQueryMutations(url, qRows);
        }
        const opts = { requestId: params.requestId, headers: hdrs, url: outUrl };
        const postDataB64 = await resolveInterceptPostDataBase64(reg);
        if (postDataB64 !== 'SKIP') opts.postData = postDataB64;
        await dbg.sendCommand('Fetch.continueRequest', opts).catch(async () => {
          await dbg.sendCommand('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
        });
        break;
      }
      if (!mutated)
        await dbg.sendCommand('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
      return;
    }

    if (method === 'Network.requestWillBeSent') {
      const rid = params.requestId;
      const r = params.request;
      if (rid && r) {
        const hflat = {};
        if (r.headers && typeof r.headers === 'object' && !Array.isArray(r.headers))
          Object.assign(hflat, r.headers);
        else if (Array.isArray(r.headers))
          for (const h of r.headers) if (h?.name) hflat[h.name] = h.value ?? '';
        this.requestMetaById.set(rid, { url: r.url, method: r.method, headers: hflat });

        /** Outgoing-request phase listeners settle here (before response bodies exist). */
        const earlyCapture = this.normalizeCapture({
          url: r.url || '',
          method: r.method || 'GET',
          requestHeaders: hflat,
          requestBody: typeof r.postData === 'string' && r.postData ? r.postData : undefined,
          responseStatus: 0,
          responseHeaders: {},
          responseBody: '',
        });
        this.trySettleMatches(earlyCapture, 'request');
      }
      return;
    }

    if (method === 'Network.responseReceived') {
      const rid = params.requestId;
      const response = params.response;
      if (!rid || !response) return;
      this.responseMetaById.set(rid, {
        url: response.url || '',
        response,
      });
      return;
    }

    if (method !== 'Network.loadingFinished') return;
    const rid = params.requestId;
    const rspEntry = this.responseMetaById.get(rid);
    const rm = this.requestMetaById.get(rid);
    const responseToUse = rspEntry?.response ?? null;
    if (!responseToUse) return;

    let urlMatch =
      rspEntry?.url ||
      responseToUse.url ||
      rm?.url ||
      '';
    const meth = rm?.method ? rm.method : 'GET';

    let bodyStr = '';
    try {
      const rb = await dbg.sendCommand('Network.getResponseBody', { requestId: rid });
      const raw = rb.body || '';
      bodyStr = rb.base64Encoded ? Buffer.from(raw, 'base64').toString('utf8') : raw;
    } catch (_) {
      bodyStr = 'Response body unavailable (navigation occurred)';
    }

    let postData = '';
    try {
      const pd = await dbg
        .sendCommand('Network.getRequestPostData', { requestId: rid })
        .catch(() => ({ postData: '' }));
      postData = pd.postData || '';
    } catch (_) {}

    const capture = this.normalizeCapture({
      url: urlMatch,
      method: meth,
      requestHeaders: (rm && rm.headers) || {},
      requestBody: postData || undefined,
      responseStatus: responseToUse.status,
      responseHeaders: responseToUse.headers || {},
      responseBody: bodyStr,
    });

    this.trySettleMatches(capture, 'response');

    this.requestMetaById.delete(rid);
    this.responseMetaById.delete(rid);
  }

  normalizeCapture(parts) {
    return {
      url: parts.url,
      method: parts.method || 'GET',
      requestHeaders: parts.requestHeaders || {},
      requestBody: parts.requestBody,
      status: parts.responseStatus,
      headers: parts.responseHeaders || {},
      body: parts.responseBody || '',
    };
  }

  trySettleMatches(capture, phase = 'response') {
    const url = capture.url || '';
    const method = capture.method || 'GET';

    for (const [lid, reg] of this.captureById.entries()) {
      if (reg.settled) continue;
      const regPhase = reg.matchPhase || 'response';
      if (regPhase !== phase) continue;
      if (
        !this.awUrlMatchesPattern(url, reg.pattern) ||
        !this.awMethodMatches(reg.method, method)
      )
        continue;

      const listenerTrim = lid.trim();

      if (typeof reg.resolveWait === 'function') {
        const done = reg.resolveWait;
        this.sweepCaptureReg(reg, listenerTrim);
        try {
          done(capture);
        } catch (_) {}
      } else if (reg.mutate) {
        reg.pendingCapture = capture;
      } else {
        const sender = reg.notifySender;
        if (sender && !sender.isDestroyed()) {
          try {
            sender.send('e2e:http-capture', { listenerId: listenerTrim, data: capture });
          } catch (_) {}
        }
        this.sweepCaptureReg(reg, listenerTrim);
      }
      return;
    }
  }

  async registerHttpCapture(spec, notifySender) {
    if (!this.window || this.window.isDestroyed()) throw new Error('E2E window not ready');
    const listenerId = String(spec.listenerId || '').trim();
    if (!listenerId) throw new Error('listenerId required');
    const urlPattern = String(spec.urlPattern || '');
    const method = String(spec.method || '').trim();
    const mutate = !!spec.mutate;
    const amendHeaders = {};
    const rawAmend = spec.amendHeaders;
    if (rawAmend && typeof rawAmend === 'object' && !Array.isArray(rawAmend))
      Object.assign(amendHeaders, rawAmend);
    else if (Array.isArray(rawAmend))
      for (const row of rawAmend) {
        if (!row || row.enabled === false || !row.key?.trim()) continue;
        const k = row.key.trim();
        if (row.mode === 'remove') amendHeaders[k] = null;
        else amendHeaders[k] = String(row.value ?? '');
      }

    const replacePostBody = String(spec.replacePostBody || '');
    const replaceBodyTypeRaw = String(spec.replaceBodyType || 'none').trim();
    const replaceBodyType = INTERCEPT_REPLACE_BODY_TYPES.has(replaceBodyTypeRaw)
      ? replaceBodyTypeRaw
      : 'none';
    const replaceBinaryFilePath = String(spec.replaceBinaryFilePath || '');
    const replaceBinaryContentType = String(spec.replaceBinaryContentType || '');
    const matchPhase =
      mutate || spec.matchPhase !== 'request' ? 'response' : 'request';
    const interceptAction = spec.interceptAction === 'block' ? 'block' : 'modify';

    const amendQueryParams = Array.isArray(spec.amendQueryParams) ? spec.amendQueryParams : [];

    this.captureById.set(listenerId, {
      pattern: urlPattern,
      method,
      mutate,
      interceptAction,
      matchPhase,
      amendHeaders,
      amendQueryParams,
      replaceBodyType,
      replacePostBody,
      replaceBinaryFilePath,
      replaceBinaryContentType,
      pendingCapture: null,
      settle: null,
      settled: false,
      resolveWait: null,
      rejectWait: null,
      timeoutTimer: null,
      notifySender:
        !mutate &&
        notifySender &&
        typeof notifySender.isDestroyed === 'function' &&
        !notifySender.isDestroyed()
          ? notifySender
          : null,
    });

    await this.ensureCdpNetworkAttached();
    if (mutate) await this.adjustFetchInterceptdepth(1);
  }

  async waitForHttpCapture(listenerIdRaw, timeout) {
    const listenerIdTrim = String(listenerIdRaw || '').trim();
    if (!listenerIdTrim) throw new Error('listenerId missing');
    let reg = this.captureById.get(listenerIdTrim);
    if (!reg) throw new Error(`No START_HTTP_CAPTURE for ${listenerIdTrim}`);
    await this.ensureCdpNetworkAttached();

    if (reg.pendingCapture) {
      const c = reg.pendingCapture;
      this.sweepCaptureReg(reg, listenerIdTrim);
      return c;
    }

    return await new Promise((resolve, reject) => {
      reg.resolveWait = resolve;
      reg.rejectWait = reject;
      reg.timeoutTimer = setTimeout(() => {
        const msg = `Timeout waiting for capture: ${listenerIdTrim}`;
        if (typeof reg.rejectWait === 'function') {
          try {
            reg.rejectWait(new Error(msg));
          } catch (_) {}
        }
        this.sweepCaptureReg(reg, listenerIdTrim);
      }, Math.max(Number(timeout) || 10000, 500));
    });
  }

  teardownCaptureState() {
    for (const [lid, reg] of this.captureById.entries()) {
      if (reg.timeoutTimer) clearTimeout(reg.timeoutTimer);
      if (!reg.settled && typeof reg.rejectWait === 'function') {
        try {
          reg.rejectWait(new Error('E2E debugger detached'));
        } catch (_) {}
      }
      this.sweepCaptureReg(reg, lid.trim());
    }
    this.captureById.clear();
    this.requestMetaById.clear();
    this.responseMetaById.clear();
    this.fetchInterceptDepth = 0;
    if (this.window && !this.window.isDestroyed() && this.isDebugging) {
      this.window.webContents.debugger
        .sendCommand('Fetch.disable')
        .catch(() => {});
    }
  }

  /** Stops active HTTP listeners/interceptors without closing the runner window. */
  teardownHttpCaptures() {
    this.teardownCaptureState();
  }
}

const e2eService = new E2eService();
/** @see scrollGuestReadPositionSnapshot — used by scroll picker to match SCROLL_TO probing. */
e2eService.executeScrollGuestScript = executeScrollGuestScript;
e2eService.scrollGuestReadPositionSnapshot = scrollGuestReadPositionSnapshot;
e2eService.parseScrollGuestJsonResult = parseScrollGuestJsonResult;

ipcMain.on('e2e:signal-cancel', () => {
  e2eService.signalExecuteCancel();
});

ipcMain.handle('e2e:visible-runner-input-lock', (_event, payload = {}) => {
  try {
    const acquire = payload && payload.acquire === true;
    if (acquire) {
      e2eService.acquireVisibleRunnerInputLock();
    } else {
      e2eService.releaseVisibleRunnerInputLock();
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle(
  'e2e:execute',
  async (event, { action, selector, value, timeout, show, screenshotPath, screenshotFileName }) => {
  try {
    return await e2eService.execute(
      action,
      selector,
      value,
      timeout ?? 5000,
      show !== false,
      event.sender,
      screenshotPath,
      screenshotFileName,
    );
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
  },
);

ipcMain.handle('e2e:clear-runner-session', async () => {
  try {
    await e2eService.clearRunnerSession();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

module.exports = e2eService;
