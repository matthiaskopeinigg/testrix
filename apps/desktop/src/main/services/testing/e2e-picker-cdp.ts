import type { BrowserWindow, WebFrameMain } from 'electron';

import { collectPageFrames } from './e2e-frames';
import { PICK_ELEMENT_AT_POINT_FN, pickHintForKind } from './e2e-picker-targets';

/** Deep query helper (light DOM + open shadow roots). Injected into page scripts. */
export const DEEP_QUERY_HELPER = `function __txQuery(sel) {
  function deep(root, s) {
    if (!root || !s) return null;
    try {
      var hit = root.querySelector(s);
      if (hit) return hit;
    } catch (_) {}
    var nodes = root.querySelectorAll ? root.querySelectorAll('*') : [];
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].shadowRoot) {
        var nested = deep(nodes[i].shadowRoot, s);
        if (nested) return nested;
      }
    }
    return null;
  }
  return deep(document, sel);
}`;

interface PickHit {
  readonly selector: string;
  readonly click: boolean;
  readonly cancel: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Resolves when the E2E window starts closing, so Pick does not wait out a hung page script. */
async function untilWindowCloses<T>(win: BrowserWindow, work: Promise<T>): Promise<T | 'closed'> {
  if (win.isDestroyed())
    return 'closed';
  return new Promise((resolve) => {
    const finishClosed = () => {
      cleanup();
      resolve('closed');
    };
    const finishValue = (value: T) => {
      cleanup();
      resolve(value);
    };
    const cleanup = () => {
      win.removeListener('close', finishClosed);
      win.removeListener('closed', finishClosed);
    };
    win.once('close', finishClosed);
    win.once('closed', finishClosed);
    work.then(finishValue, finishClosed);
  });
}

async function injectInAllFrames(win: BrowserWindow, script: string): Promise<void> {
  if (win.isDestroyed())
    return;
  for (const frame of collectPageFrames(win))
    await injectInFrame(frame, script);
}

async function injectInFrame(frame: WebFrameMain, script: string): Promise<void> {
  try {
    if (frame.isDestroyed())
      return;
    await frame.executeJavaScript(script);
  } catch {
    // Cross-origin / detached frames can reject.
  }
}

/**
 * Hit-test in the frame that received the pointer event.
 * clientX/clientY are CSS viewport pixels, so the highlight stays on the
 * element under the cursor after a Type step scrolls the page.
 */
function buildE2ePickerHitScript(kind?: string | null): string {
  const kindJson = JSON.stringify(kind ?? '');
  return `(() => {
    var pick = (${PICK_ELEMENT_AT_POINT_FN});
    if (window.__txPickCancel === true)
      return { selector: '', click: false, cancel: true };
    var click = window.__txPickClick;
    if (click) window.__txPickClick = null;
    var at = window.__txPickAt;
    var point = click || at;
    if (!point) {
      pick(-1, -1, '');
      return { selector: '', click: false, cancel: false };
    }
    if (!click && typeof point.t === 'number' && Date.now() - point.t > 300) {
      pick(-1, -1, '');
      return { selector: '', click: false, cancel: false };
    }
    var selector = '';
    try { selector = pick(point.x, point.y, ${kindJson}) || ''; } catch (_) { selector = ''; }
    return { selector: selector, click: !!click, cancel: false };
  })()`;
}

/**
 * Picker that resolves the element with document.elementFromPoint in the frame
 * under the cursor. CDP viewport coordinates drift after scroll and DPI scaling,
 * which highlighted the block above Registrieren instead of the button.
 */
export async function pickSelectorWithCdp(
  win: BrowserWindow,
  options: { readonly timeoutMs?: number; readonly kind?: string | null } = {},
): Promise<{ ok: boolean; selector?: string; cancelled?: boolean; error?: string }> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const kind = options.kind ?? null;
  const webContents = win.webContents;

  let cancelledByKey = false;
  const onBeforeInput = (
    event: { preventDefault: () => void },
    input: { type: string; key: string },
  ) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      cancelledByKey = true;
      event.preventDefault();
    }
  };
  webContents.on('before-input-event', onBeforeInput);

  if (webContents.debugger.isAttached())
    await webContents.debugger.sendCommand('Overlay.hideHighlight').catch(() => undefined);

  try {
    const armed = await untilWindowCloses(win, injectInAllFrames(win, buildE2ePickerPointerScript()));
    if (armed === 'closed' || win.isDestroyed())
      return { ok: false, cancelled: true };

    const deadline = Date.now() + timeoutMs;
    const hitScript = buildE2ePickerHitScript(kind);

    while (Date.now() < deadline) {
      if (win.isDestroyed())
        return { ok: false, cancelled: true };
      if (cancelledByKey)
        return { ok: false, cancelled: true };

      const frames = collectPageFrames(win);
      let clicked: PickHit | null = null;
      for (const frame of frames) {
        const pending: Promise<PickHit | null> = frame.isDestroyed()
          ? Promise.resolve(null)
          : frame.executeJavaScript(hitScript).then((value) => (value ?? null) as PickHit | null).catch(() => null);
        const hit = await untilWindowCloses(win, pending);
        if (hit === 'closed' || win.isDestroyed())
          return { ok: false, cancelled: true };
        if (!hit)
          continue;
        if (hit.cancel)
          return { ok: false, cancelled: true };
        if (hit.click && hit.selector) {
          clicked = hit;
          break;
        }
      }
      if (clicked)
        return { ok: true, selector: clicked.selector };

      const waited = await untilWindowCloses(win, sleep(32));
      if (waited === 'closed' || win.isDestroyed())
        return { ok: false, cancelled: true };
    }

    return { ok: false, error: 'Timed out waiting for a click. Try Pick on page again.' };
  } finally {
    webContents.removeListener('before-input-event', onBeforeInput);
    if (!win.isDestroyed()) {
      await injectInAllFrames(win, buildE2ePickerPointerTeardownScript()).catch(() => undefined);
      await injectInAllFrames(win, `(() => { window.__txE2ePick = false; })()`).catch(() => undefined);
      if (webContents.debugger.isAttached())
        await webContents.debugger.sendCommand('Overlay.hideHighlight').catch(() => undefined);
    }
  }
}

/** Hint bar + pick-mode flags. The highlight box is painted by the hit-test script. */
export function buildE2ePickerHintScript(kind?: string | null): string {
  const label = JSON.stringify(pickHintForKind(kind));
  return `(() => {
    try { if (typeof window.__TX_PICK_HINT_TEARDOWN__ === 'function') window.__TX_PICK_HINT_TEARDOWN__(); } catch (_) {}
    window.__txE2ePass = true;
    window.__txE2ePick = true;
    var banner = document.getElementById('tx-e2e-guard-banner');
    if (banner) banner.style.display = 'none';
    var ringRun = document.getElementById('tx-e2e-target');
    if (ringRun) ringRun.style.display = 'none';
    var hint = document.createElement('div');
    hint.id = '__tx-picker-hint';
    hint.setAttribute('style', [
      'position:fixed',
      'top:0',
      'left:0',
      'right:0',
      'z-index:2147483647',
      'padding:10px 16px',
      'font:650 13px/1.4 system-ui,sans-serif',
      'background:rgba(12,14,18,0.94)',
      'color:#f4f6f8',
      'text-align:center',
      'pointer-events:none',
      'border-bottom:1px solid rgba(232,93,138,0.55)',
      'box-shadow:0 8px 24px rgba(0,0,0,0.35)',
    ].join(';'));
    hint.textContent = ${label};
    (document.documentElement || document.body).appendChild(hint);
    window.__TX_PICK_HINT_TEARDOWN__ = function () {
      if (hint && hint.parentNode) hint.parentNode.removeChild(hint);
      var box = document.getElementById('__tx-pick-box');
      if (box && box.parentNode) box.parentNode.removeChild(box);
      window.__txE2ePass = false;
      window.__txE2ePick = false;
      try { delete window.__TX_PICK_HINT_TEARDOWN__; } catch (_) {}
    };
    return { ok: true };
  })()`;
}

export function buildE2ePickerHintTeardownScript(): string {
  return `(() => {
    try { if (typeof window.__TX_PICK_HINT_TEARDOWN__ === 'function') window.__TX_PICK_HINT_TEARDOWN__(); } catch (_) {}
    var box = document.getElementById('__tx-pick-box');
    if (box && box.parentNode) box.parentNode.removeChild(box);
    window.__txE2ePass = false;
    window.__txE2ePick = false;
  })()`;
}

function buildE2ePickerPointerScript(): string {
  return `(() => {
    function armPass() {
      window.__txE2ePick = true;
      try {
        Object.defineProperty(window, '__txE2ePass', {
          configurable: true,
          enumerable: true,
          get: function () { return true; },
          set: function () {},
        });
      } catch (_) {
        window.__txE2ePass = true;
      }
    }
    if (typeof window.__TX_PICK_POINTER_TEARDOWN__ === 'function') {
      armPass();
      return { ok: true, already: true };
    }
    armPass();
    window.__txPickAt = null;
    window.__txPickClick = null;
    window.__txPickCancel = false;

    function onMove(ev) {
      window.__txPickAt = { x: ev.clientX, y: ev.clientY, t: Date.now() };
    }
    function onDown(ev) {
      // Capture early — some CMPs cancel click after pointerdown/mousedown.
      if (ev.button != null && ev.button !== 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
      window.__txPickAt = { x: ev.clientX, y: ev.clientY, t: Date.now() };
      window.__txPickClick = { x: ev.clientX, y: ev.clientY, t: Date.now() };
    }
    function onKey(ev) {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        window.__txPickCancel = true;
      }
    }

    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('click', onDown, true);
    window.addEventListener('keydown', onKey, true);

    window.__TX_PICK_POINTER_TEARDOWN__ = function () {
      try {
        window.removeEventListener('mousemove', onMove, true);
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerdown', onDown, true);
        window.removeEventListener('mousedown', onDown, true);
        window.removeEventListener('click', onDown, true);
        window.removeEventListener('keydown', onKey, true);
      } catch (_) {}
      window.__txPickAt = null;
      window.__txPickClick = null;
      window.__txPickCancel = false;
      var box = document.getElementById('__tx-pick-box');
      if (box && box.parentNode) box.parentNode.removeChild(box);
      try {
        Object.defineProperty(window, '__txE2ePass', {
          configurable: true,
          enumerable: true,
          writable: true,
          value: false,
        });
      } catch (_) {
        window.__txE2ePass = false;
      }
      window.__txE2ePick = false;
      try { delete window.__TX_PICK_POINTER_TEARDOWN__; } catch (_) {}
    };
    return { ok: true };
  })()`;
}

function buildE2ePickerPointerTeardownScript(): string {
  return `(() => {
    try { if (typeof window.__TX_PICK_POINTER_TEARDOWN__ === 'function') window.__TX_PICK_POINTER_TEARDOWN__(); } catch (_) {}
    var box = document.getElementById('__tx-pick-box');
    if (box && box.parentNode) box.parentNode.removeChild(box);
  })()`;
}
