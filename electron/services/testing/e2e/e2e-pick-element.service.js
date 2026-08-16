const { ipcMain } = require('electron');
const { logError, logInfo } = require('./logger.service');
const { getRelayBootstrapScript, compileFramePickerScript } = require('./e2e-picker-frame-scripts');

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
  "try{typeof window.__AW_PICK_TEARDOWN__==='function'&&window.__AW_PICK_TEARDOWN__()}catch(e){}";

/**
 * CMP / cookie banners usually live in separate WebFrameMain trees; parent-document JS never sees their DOM.
 */
async function injectPickerIntoAllFrames(webContents, pickGen) {
  const main = webContents.mainFrame;
  if (!main || main.isDestroyed()) return;

  await main.executeJavaScript(getRelayBootstrapScript(), true).catch(() => {});

  let list;
  try {
    list = main.framesInSubtree;
  } catch (_) {
    list = [];
  }

  for (let i = 0; i < list.length; i++) {
    const frame = list[i];
    if (!frame || frame.isDestroyed() || frame.detached) continue;
    const isTopFrame = frame.parent == null;
    const script = compileFramePickerScript({
      pickGen,
      isTopFrame,
      processId: frame.processId,
      routingId: frame.routingId,
    });
    await frame.executeJavaScript(script, true).catch(() => {});
  }
}

async function teardownPickerInAllFrames(webContents) {
  const main = webContents.mainFrame;
  if (!main || main.isDestroyed()) return;
  let list;
  try {
    list = main.framesInSubtree;
  } catch (_) {
    list = [];
  }
  for (let i = 0; i < list.length; i++) {
    const frame = list[i];
    if (!frame || frame.isDestroyed()) continue;
    await frame.executeJavaScript(TEARDOWN_SCRIPT, true).catch(() => {});
  }
}

/** @type {{ cancel: () => void, done: Promise<void> } | null} */
let activeSession = null;

function closeActiveSession() {
  const session = activeSession;
  activeSession = null;
  if (!session) {
    return Promise.resolve();
  }
  try {
    session.cancel();
  } catch (_) {}
  return session.done.then(
    () => undefined,
    () => undefined,
  );
}

module.exports = { closeActiveSession, runPickElementSession };

async function runPickElementSession(payload) {
  await closeActiveSession();
  try {
    // eslint-disable-next-line global-require
    require('./e2e-pick-scroll-position.service').closeActiveScrollSession();
  } catch (_) {}

  const svc = getE2eService();
  const reuseSession = Boolean(payload && payload.reuseSession);

  if (!reuseSession) {
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
            'Provide preceding browser steps in the flow, or an http(s) fallback URL after environment resolution.',
        };
      }
    } catch (err) {
      logError('e2e pick-element: preceding steps failed', err);
      return {
        ok: false,
        error: err && err.message ? String(err.message) : 'Failed to replay browser steps',
      };
    }
  }

  try {
    svc.releaseVisibleRunnerInputLock();
  } catch (_) {}

  const win = svc.window;
  if (!win || win.isDestroyed()) {
    return {
      ok: false,
      error: reuseSession
        ? 'No browser session after preparing the flow. Add a Navigate step before this one, then try Pick on page again.'
        : 'E2E browser window is not available.',
    };
  }

  try {
    if (typeof svc.ensureRunnerWindowSurface === 'function') {
      await svc.ensureRunnerWindowSurface();
    }
  } catch (_) {}
  try {
    win.setIgnoreMouseEvents(false);
    if (!win.isVisible()) win.show();
    win.focus();
  } catch (_) {}

  const pickGenToken = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  /** @type {ReturnType<typeof setTimeout>[]} */
  const reinjectTimers = [];

  const scheduleReinjectPickers = (delayMs = 220) => {
    const timer = setTimeout(() => {
      const idx = reinjectTimers.indexOf(timer);
      if (idx >= 0) reinjectTimers.splice(idx, 1);
      if (!win || win.isDestroyed()) return;
      void injectPickerIntoAllFrames(win.webContents, pickGenToken).catch(() => {});
    }, delayMs);
    reinjectTimers.push(timer);
  };

  const onFrameFinishLoad = () => scheduleReinjectPickers();
  const onFrameCreated = () => scheduleReinjectPickers(50);
  const onInPageNavigate = () => scheduleReinjectPickers(80);

  let settled = false;
  /** @type {((r: unknown) => void) | null} */
  let resolveOuter = null;
  /** @type {(() => void) | null} */
  let settleDone = null;
  const sessionDone = new Promise((resolve) => {
    settleDone = resolve;
  });

  /** Cancels picker when Escape is pressed even if focus is inside an iframe. */
  let onBeforePickInput = null;

  const cleanupIpcAndClosed = () => {
    ipcMain.removeListener('e2e:pick-element:result', onResult);
    ipcMain.removeListener('e2e:pick-element:cancel', onCancel);
    while (reinjectTimers.length) {
      clearTimeout(reinjectTimers.pop());
    }
    if (win && !win.isDestroyed()) {
      const wc = win.webContents;
      try {
        wc.removeListener('did-frame-finish-load', onFrameFinishLoad);
      } catch (_) {}
      try {
        wc.removeListener('frame-created', onFrameCreated);
      } catch (_) {}
      try {
        wc.removeListener('did-navigate-in-page', onInPageNavigate);
      } catch (_) {}
      try {
        wc.removeListener('did-frame-navigate', onInPageNavigate);
      } catch (_) {}
    }
    if (onBeforePickInput && win && !win.isDestroyed()) {
      try {
        win.webContents.removeListener('before-input-event', onBeforePickInput);
      } catch (_) {}
      onBeforePickInput = null;
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
    if (activeSession && activeSession.done === sessionDone) {
      activeSession = null;
    }
    try {
      if (win && !win.isDestroyed()) {
        await teardownPickerInAllFrames(win.webContents);
      }
    } catch (_) {}
    /** Hide after pick or Cancel so the runner does not stay open in front of the editor. */
    if (win && !win.isDestroyed()) {
      try {
        win.hide();
      } catch (_) {}
    }
    if (resolveOuter) resolveOuter(result);
    if (settleDone) settleDone();
  };

  const onResult = (_e, data) => {
    const sel = data && typeof data.selector === 'string' ? data.selector : '';
    void finish({ ok: true, selector: sel });
  };

  const onCancel = () => void finish({ ok: false, cancelled: true });

  ipcMain.on('e2e:pick-element:result', onResult);
  ipcMain.on('e2e:pick-element:cancel', onCancel);

  const listeners = { onClosed: null };
  listeners.onClosed = () => void finish({ ok: false, cancelled: true });
  win.once('closed', listeners.onClosed);

  activeSession = {
    cancel: () => void finish({ ok: false, cancelled: true }),
    done: sessionDone,
  };

  return new Promise((resolve) => {
    resolveOuter = resolve;
    void (async () => {
      try {
        await injectPickerIntoAllFrames(win.webContents, pickGenToken);
      } catch (err) {
        logError('e2e pick-element: inject failed', err);
        await finish({
          ok: false,
          error: err && err.message ? String(err.message) : 'Failed to inject element picker',
        });
        return;
      }
      const wc = win.webContents;
      try {
        wc.on('did-frame-finish-load', onFrameFinishLoad);
      } catch (_) {}
      try {
        wc.on('frame-created', onFrameCreated);
      } catch (_) {}
      try {
        wc.on('did-navigate-in-page', onInPageNavigate);
      } catch (_) {}
      try {
        wc.on('did-frame-navigate', onInPageNavigate);
      } catch (_) {}
      scheduleReinjectPickers(150);
      scheduleReinjectPickers(400);
      scheduleReinjectPickers(1000);
      onBeforePickInput = (_e, input) => {
        if (input.type === 'keyDown' && input.key === 'Escape') {
          void finish({ ok: false, cancelled: true });
        }
      };
      wc.on('before-input-event', onBeforePickInput);
      logInfo('e2e pick-element: session active (all WebFrameMain trees)');
    })();
  });
}
