import { screen, type BrowserWindow, type WebContents, type WebFrameMain } from 'electron';

import { collectPageFrames, toTopLevelPoint } from './e2e-frames';
import {
  BUILD_SHORT_CSS_SELECTOR_FN,
  pickHintForKind,
  SNAP_ELEMENT_TO_PICK_KIND_FN,
} from './e2e-picker-targets';

/**
 * High-contrast pick highlight — readable on magenta, white, dark, and brand-colored controls.
 * Yellow wash shifts any fill; black ring reads on light/saturated surfaces.
 */
const E2E_PICK_RECT = {
  color: { r: 255, g: 220, b: 0, a: 0.42 },
  outlineColor: { r: 10, g: 12, b: 16, a: 1 },
} as const;

/** Expand the highlight slightly past the border box so the ring stays visible. */
const E2E_PICK_PAD_PX = 3;

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

interface PickPointerState {
  readonly at: { readonly x: number; readonly y: number } | null;
  readonly click: { readonly x: number; readonly y: number } | null;
  readonly cancel: boolean;
}

function quadBounds(quad: number[] | undefined): {
  x: number;
  y: number;
  width: number;
  height: number;
} | null {
  if (!quad || quad.length < 8)
    return null;
  const xs = [quad[0]!, quad[2]!, quad[4]!, quad[6]!];
  const ys = [quad[1]!, quad[3]!, quad[5]!, quad[7]!];
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const width = Math.max(...xs) - x;
  const height = Math.max(...ys) - y;
  if (!(width > 0 && height > 0))
    return null;
  return { x, y, width, height };
}

async function reinforceHighlightFromBackendNode(
  webContents: WebContents,
  backendNodeId: number,
): Promise<void> {
  try {
    const pushed = (await webContents.debugger.sendCommand('DOM.pushNodesByBackendIdsToFrontend', {
      backendNodeIds: [backendNodeId],
    })) as { nodeIds?: number[] };
    const nodeId = pushed.nodeIds?.[0];
    if (typeof nodeId !== 'number')
      return;
    const box = (await webContents.debugger.sendCommand('DOM.getBoxModel', { nodeId })) as {
      model?: {
        border?: number[];
        padding?: number[];
        content?: number[];
      };
    };
    // Prefer border box so padded buttons highlight fully (not just the text content box).
    const bounds =
      quadBounds(box.model?.border) ??
      quadBounds(box.model?.padding) ??
      quadBounds(box.model?.content);
    if (!bounds)
      return;
    const pad = E2E_PICK_PAD_PX;
    await webContents.debugger.sendCommand('Overlay.highlightRect', {
      x: Math.round(bounds.x - pad),
      y: Math.round(bounds.y - pad),
      width: Math.round(bounds.width + pad * 2),
      height: Math.round(bounds.height + pad * 2),
      color: E2E_PICK_RECT.color,
      outlineColor: E2E_PICK_RECT.outlineColor,
    });
  } catch {
    // Ignore highlight failures.
  }
}

async function resolveObjectId(
  webContents: WebContents,
  backendNodeId: number,
): Promise<string | null> {
  const resolved = (await webContents.debugger.sendCommand('DOM.resolveNode', {
    backendNodeId,
  })) as { object?: { objectId?: string } };
  return resolved.object?.objectId ?? null;
}

async function snapObjectId(
  webContents: WebContents,
  objectId: string,
  kind?: string | null,
): Promise<string | null> {
  const snapped = (await webContents.debugger.sendCommand('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: SNAP_ELEMENT_TO_PICK_KIND_FN,
    arguments: [{ value: kind ?? '' }],
    returnByValue: false,
  })) as {
    result?: { objectId?: string; subtype?: string; type?: string };
    exceptionDetails?: unknown;
  };
  if (snapped.exceptionDetails)
    return null;
  if (snapped.result?.subtype === 'null' || snapped.result?.type === 'undefined')
    return null;
  // When the snap returns `this`, some CDP builds omit objectId — keep the original.
  return snapped.result?.objectId ?? objectId;
}

async function cssSelectorFromObjectId(
  webContents: WebContents,
  objectId: string,
): Promise<string> {
  const evaluated = (await webContents.debugger.sendCommand('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: BUILD_SHORT_CSS_SELECTOR_FN,
    returnByValue: true,
  })) as { result?: { value?: unknown } };
  const value = evaluated.result?.value;
  return typeof value === 'string' ? value.trim() : '';
}

async function backendNodeIdFromObjectId(
  webContents: WebContents,
  objectId: string,
): Promise<number | null> {
  const described = (await webContents.debugger.sendCommand('DOM.describeNode', {
    objectId,
  })) as { node?: { backendNodeId?: number } };
  const id = described.node?.backendNodeId;
  return typeof id === 'number' ? id : null;
}

async function resolveAtPoint(
  webContents: WebContents,
  x: number,
  y: number,
  kind?: string | null,
): Promise<{ backendNodeId: number; selector: string } | null> {
  let dpr = 1;
  try {
    const evaluated = (await webContents.debugger.sendCommand('Runtime.evaluate', {
      expression: 'window.devicePixelRatio || 1',
      returnByValue: true,
    })) as { result?: { value?: unknown } };
    if (typeof evaluated.result?.value === 'number' && evaluated.result.value > 0)
      dpr = evaluated.result.value;
  } catch {
    // Keep dpr = 1.
  }

  const points: Array<{ x: number; y: number }> = [
    { x: Math.round(x), y: Math.round(y) },
  ];
  if (dpr !== 1) {
    points.push({ x: Math.round(x * dpr), y: Math.round(y * dpr) });
    points.push({ x: Math.round(x / dpr), y: Math.round(y / dpr) });
  }

  for (const point of points) {
    try {
      const located = (await webContents.debugger.sendCommand('DOM.getNodeForLocation', {
        x: point.x,
        y: point.y,
        includeUserAgentShadowDOM: true,
      })) as { backendNodeId?: number; nodeId?: number };
      const backendNodeId =
        typeof located.backendNodeId === 'number' ? located.backendNodeId : null;
      if (backendNodeId == null)
        continue;
      const objectId = await resolveObjectId(webContents, backendNodeId);
      if (!objectId)
        continue;
      const snappedId = await snapObjectId(webContents, objectId, kind);
      if (!snappedId)
        continue;
      const snappedBackend = await backendNodeIdFromObjectId(webContents, snappedId);
      const selector = await cssSelectorFromObjectId(webContents, snappedId);
      if (!selector || snappedBackend == null)
        continue;
      return { backendNodeId: snappedBackend, selector };
    } catch {
      // Try next coordinate scaling.
    }
  }
  return null;
}

export async function ensureDebuggerAttached(webContents: WebContents): Promise<boolean> {
  if (webContents.debugger.isAttached())
    return false;
  webContents.debugger.attach('1.3');
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function injectInAllFrames(win: BrowserWindow, script: string): Promise<void> {
  for (const frame of collectPageFrames(win)) {
    try {
      await frame.executeJavaScript(script);
    } catch {
      // Cross-origin / detached frames can reject.
    }
  }
}

async function pollPointerAcrossFrames(win: BrowserWindow): Promise<PickPointerState> {
  let at: { x: number; y: number } | null = null;
  let click: { x: number; y: number } | null = null;
  let cancel = false;
  let clickFrame: WebFrameMain | null = null;

  for (const frame of collectPageFrames(win)) {
    let state: PickPointerState | null = null;
    try {
      state = (await frame.executeJavaScript(buildE2ePickerPointerPollScript())) as PickPointerState;
    } catch {
      continue;
    }
    if (!state)
      continue;
    if (state.cancel)
      cancel = true;
    if (state.click && !click) {
      click = await toTopLevelPoint(frame, state.click);
      clickFrame = frame;
    } else if (state.at && !at && !click) {
      at = await toTopLevelPoint(frame, state.at);
    }
  }

  if (clickFrame) {
    try {
      await clickFrame.executeJavaScript(buildE2ePickerPointerClearClickScript());
    } catch {
      // Ignore.
    }
  }

  return { at, click, cancel };
}

/** Cursor position in the window's content viewport (CSS px), or null if outside. */
function contentPointFromScreen(win: BrowserWindow): { x: number; y: number } | null {
  try {
    if (win.isDestroyed())
      return null;
    const cursor = screen.getCursorScreenPoint();
    const bounds = win.getContentBounds();
    if (
      cursor.x < bounds.x ||
      cursor.y < bounds.y ||
      cursor.x > bounds.x + bounds.width ||
      cursor.y > bounds.y + bounds.height
    )
      return null;
    return {
      x: Math.round(cursor.x - bounds.x),
      y: Math.round(cursor.y - bounds.y),
    };
  } catch {
    return null;
  }
}

const WM_LBUTTONDOWN = 0x0201;

/**
 * Coordinate-based picker (no Overlay.inspectMode — that cancels on CMP/shadow clicks).
 * Resolves nodes with DOM.getNodeForLocation (pierces iframes + open/UA shadow DOM).
 * Hover uses the OS cursor; click uses page capture listeners plus a Win32 hook fallback.
 */
export async function pickSelectorWithCdp(
  win: BrowserWindow,
  options: { readonly timeoutMs?: number; readonly kind?: string | null } = {},
): Promise<{ ok: boolean; selector?: string; cancelled?: boolean; error?: string }> {
  const webContents = win.webContents;
  const timeoutMs = options.timeoutMs ?? 120_000;
  const kind = options.kind ?? null;
  const attachedHere = await ensureDebuggerAttached(webContents);

  let cancelledByKey = false;
  let nativeClick = false;
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

  let unhookMouse: (() => void) | null = null;
  if (process.platform === 'win32') {
    try {
      win.hookWindowMessage(WM_LBUTTONDOWN, () => {
        nativeClick = true;
      });
      unhookMouse = () => {
        try {
          win.unhookWindowMessage(WM_LBUTTONDOWN);
        } catch {
          // Already unhooked / destroyed.
        }
      };
    } catch {
      // hookWindowMessage unavailable.
    }
  }

  try {
    await webContents.debugger.sendCommand('DOM.enable');
    await webContents.debugger.sendCommand('Runtime.enable');
    await webContents.debugger.sendCommand('DOM.getDocument', { depth: 0, pierce: true });
    await webContents.debugger.sendCommand('Overlay.enable');

    await injectInAllFrames(win, buildE2ePickerPointerScript());

    const deadline = Date.now() + timeoutMs;
    let lastKey = '';
    let lastHover: { backendNodeId: number; selector: string } | null = null;
    let lastPoint: { x: number; y: number } | null = null;

    while (Date.now() < deadline) {
      if (win.isDestroyed() || webContents.isDestroyed())
        return { ok: false, cancelled: true };

      // Attach listeners to late-loaded frames; keep the input lock disarmed.
      await injectInAllFrames(win, buildE2ePickerPointerScript()).catch(() => undefined);

      const state = await pollPointerAcrossFrames(win);
      const screenAt = contentPointFromScreen(win);
      if (screenAt)
        lastPoint = screenAt;

      if (cancelledByKey || state.cancel)
        return { ok: false, cancelled: true };

      const clickPoint = state.click ?? (nativeClick ? lastPoint ?? screenAt : null);
      if (nativeClick)
        nativeClick = false;

      if (clickPoint) {
        const resolved =
          (await resolveAtPoint(webContents, clickPoint.x, clickPoint.y, kind).catch(() => null)) ??
          lastHover;
        if (!resolved) {
          await sleep(40);
          continue;
        }
        await webContents.debugger.sendCommand('Overlay.hideHighlight').catch(() => undefined);
        return { ok: true, selector: resolved.selector };
      }

      const hoverPoint = screenAt ?? state.at;
      if (hoverPoint) {
        const key = `${Math.round(hoverPoint.x)},${Math.round(hoverPoint.y)}`;
        if (key !== lastKey) {
          lastKey = key;
          const resolved = await resolveAtPoint(
            webContents,
            hoverPoint.x,
            hoverPoint.y,
            kind,
          ).catch(() => null);
          if (resolved) {
            lastHover = resolved;
            await reinforceHighlightFromBackendNode(webContents, resolved.backendNodeId);
          } else {
            await webContents.debugger.sendCommand('Overlay.hideHighlight').catch(() => undefined);
          }
        }
      }

      await sleep(32);
    }

    return { ok: false, error: 'Timed out waiting for a click. Try Pick on page again.' };
  } finally {
    webContents.removeListener('before-input-event', onBeforeInput);
    unhookMouse?.();
    await injectInAllFrames(win, buildE2ePickerPointerTeardownScript()).catch(() => undefined);
    await injectInAllFrames(
      win,
      `(() => { window.__txE2ePick = false; })()`,
    ).catch(() => undefined);
    await webContents.debugger.sendCommand('Overlay.hideHighlight').catch(() => undefined);
    if (attachedHere && webContents.debugger.isAttached()) {
      try {
        webContents.debugger.detach();
      } catch {
        // Already detached.
      }
    }
  }
}

/** Hint bar + pick-mode flags (no full-screen overlay — CDP resolves under the cursor). */
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
      window.__txPickAt = { x: ev.clientX, y: ev.clientY };
    }
    function onDown(ev) {
      // Capture early — some CMPs cancel click after pointerdown/mousedown.
      if (ev.button != null && ev.button !== 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
      window.__txPickAt = { x: ev.clientX, y: ev.clientY };
      window.__txPickClick = { x: ev.clientX, y: ev.clientY };
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

function buildE2ePickerPointerPollScript(): string {
  return `(() => ({
    at: window.__txPickAt || null,
    click: window.__txPickClick || null,
    cancel: window.__txPickCancel === true,
  }))()`;
}

function buildE2ePickerPointerClearClickScript(): string {
  return `(() => { window.__txPickClick = null; return true; })()`;
}

function buildE2ePickerPointerTeardownScript(): string {
  return `(() => {
    try { if (typeof window.__TX_PICK_POINTER_TEARDOWN__ === 'function') window.__TX_PICK_POINTER_TEARDOWN__(); } catch (_) {}
  })()`;
}
