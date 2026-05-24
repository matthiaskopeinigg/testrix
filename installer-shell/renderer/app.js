/* global window, document */

const $ = (id) => document.getElementById(id);

/**
 * Platform-keyed copy for the help modal. The same wizard renderer is used by
 * the Windows, macOS, and Linux setup shells; only the platform backend differs.
 */
const HELP_COPY = {
  win: {
    intro:
      'This installer copies Testrix to your computer and creates Start menu and desktop shortcuts.',
    scope: [
      ['Only for me', 'installs under your user profile. No administrator rights required.'],
      ['Everyone on this PC', 'installs under Program Files. Windows will prompt for administrator rights.'],
    ],
    uninstall:
      'Open <em>Windows Settings → Apps → Installed apps</em>, find <strong>Testrix</strong>, and choose Uninstall.',
  },
  mac: {
    intro:
      'This installer copies Testrix into your <em>Applications</em> folder. Unsigned builds may still show a Gatekeeper warning the first time you launch them.',
    scope: [
      ['Only for me', 'installs into <em>~/Applications</em>. No administrator rights required.'],
      ['Everyone on this Mac', 'installs into <em>/Applications</em>. Will prompt for administrator rights.'],
    ],
    uninstall:
      'Open <em>Finder → Applications</em>, drag <strong>Testrix</strong> to the Trash, then empty the Trash. If macOS reports the app is quarantined, run <code>xattr -dr com.apple.quarantine /Applications/API\\ Workbench.app</code> for machine installs or the same command against <code>~/Applications/API\\ Workbench.app</code> for user installs.',
  },
  linux: {
    intro:
      'This installer copies Testrix to your system and registers a desktop entry for the application menu.',
    scope: [
      ['Only for me', 'installs under <code>~/.local/share/testrix</code>. No root privileges required.'],
      ['Everyone on this system', 'installs under <code>/opt/testrix</code>. Will prompt for root privileges.'],
    ],
    uninstall:
      'Run the installed app with <code>--uninstall</code>, or remove the install directory and the <code>testrix.desktop</code> entry from your applications folder.',
  },
};

const state = {
  busy: false,
  payloadOk: false,
  payloadInfo: null,
};

function setBusy(busy) {
  state.busy = busy;
  $('btn-install').disabled = busy;
  $('btn-quit').disabled = busy;
  $('btn-close').disabled = busy;
  document.querySelectorAll('input[name="scope"]').forEach((el) => {
    el.disabled = busy;
  });
  $('install-dir').readOnly = busy;
}

function showProgress(on) {
  const wrap = $('progress-wrap');
  if (on) wrap.classList.add('active');
  else wrap.classList.remove('active');
}

function setProgressIndeterminate(on) {
  const track = $('progress-track');
  if (on) track.classList.add('indeterminate');
  else track.classList.remove('indeterminate');
}

function setProgressPercent(value) {
  const pct = Math.max(0, Math.min(1, Number(value) || 0));
  const fill = $('progress-fill');
  const label = $('progress-percent');
  const track = $('progress-track');
  fill.style.width = `${pct * 100}%`;
  label.textContent = `${Math.round(pct * 100)}%`;
  track.setAttribute('aria-valuenow', String(Math.round(pct * 100)));
}

function setProgressLabel(text) {
  $('progress-label').textContent = text;
}

function resetProgress() {
  setProgressIndeterminate(false);
  setProgressPercent(0);
  setProgressLabel('Preparing…');
}

/**
 * Renders the styled "Installation failed" alert beneath the form. Accepts
 * either a plain string or an object returned from the install IPC so we can
 * include the failing relative path when present.
 */
function setInstallError(input) {
  const wrap = $('install-error-wrap');
  const msgEl = $('install-error');
  if (!input) {
    wrap.classList.add('hidden');
    msgEl.textContent = '';
    return;
  }
  const message =
    typeof input === 'string' ? input : input.message || 'Install failed.';
  const failedFile = typeof input === 'object' ? input.failedFile : null;
  const code = typeof input === 'object' ? input.code : null;
  const parts = [message];
  if (failedFile) parts.push(`(file: ${failedFile})`);
  if (code && !message.includes(code)) parts.push(`[${code}]`);
  msgEl.textContent = parts.join(' ');
  wrap.classList.remove('hidden');
}

function setPayloadWarning(msg) {
  const wrap = $('payload-warning');
  const p = $('payload-msg');
  if (!msg) {
    wrap.classList.add('hidden');
    p.textContent = '';
    return;
  }
  p.textContent = msg;
  wrap.classList.remove('hidden');
}

function getScope() {
  const checked = document.querySelector('input[name="scope"]:checked');
  return checked ? checked.value : 'user';
}

async function refreshPaths() {
  const scope = getScope();
  const paths = await window.setupApi.getDefaultPaths(scope);
  $('install-dir').value = paths.installDir;
}

async function validatePayload() {
  const res = await window.setupApi.getPayloadInfo();
  state.payloadInfo = res;
  if (!res.ok) {
    state.payloadOk = false;
    setPayloadWarning(res.message || 'Payload is missing or invalid.');
    return;
  }
  state.payloadOk = true;
  setPayloadWarning('');
  if (res.version) $('meta-version').textContent = `Version ${res.version}`;
}

/* ────────────────────────────────────────────────────────── help modal */

/**
 * Renders the platform-specific copy into the help modal. Called once on init
 * so the modal is ready before the user clicks the help button.
 *
 * @param {'win' | 'mac' | 'linux'} platform
 */
function renderHelpContent(platform) {
  const copy = HELP_COPY[platform] || HELP_COPY.win;
  $('help-intro').innerHTML = copy.intro;
  $('help-uninstall').innerHTML = copy.uninstall;
  const list = $('help-scope-list');
  list.innerHTML = copy.scope
    .map(([title, body]) => `<li><strong>${title}</strong> &mdash; ${body}</li>`)
    .join('');
}

function openHelp() {
  const modal = $('help-modal');
  modal.classList.remove('hidden');
  $('btn-help-done').focus();
}

function closeHelp() {
  $('help-modal').classList.add('hidden');
  $('btn-info').focus();
}

/**
 * Intercepts clicks on any anchor with `data-href` and routes the URL through
 * the secure `openExternal` IPC instead of letting the renderer navigate.
 */
function wireExternalLinks() {
  document.body.addEventListener('click', (event) => {
    const target = event.target.closest('[data-href]');
    if (!target) return;
    event.preventDefault();
    const url = target.getAttribute('data-href');
    if (url) window.setupApi.openExternal(url);
  });
}

/* ─────────────────────────────────────────────────────────── init */

async function init() {
  $('btn-titlebar-min').addEventListener('click', () => window.setupApi.minimize());
  $('btn-titlebar-close').addEventListener('click', () => window.setupApi.quit());

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('help-modal').classList.contains('hidden')) {
      closeHelp();
    }
  });

  $('btn-info').addEventListener('click', openHelp);
  $('btn-help-close').addEventListener('click', closeHelp);
  $('btn-help-done').addEventListener('click', closeHelp);
  $('help-modal-backdrop').addEventListener('click', closeHelp);
  wireExternalLinks();

  const [ver, platform] = await Promise.all([
    window.setupApi.getVersion(),
    window.setupApi.getPlatform(),
  ]);
  if (ver) $('meta-version').textContent = `Version ${ver}`;
  renderHelpContent(platform);

  await validatePayload();
  await refreshPaths();

  document.querySelectorAll('input[name="scope"]').forEach((el) => {
    el.addEventListener('change', refreshPaths);
  });

  $('btn-quit').addEventListener('click', () => window.setupApi.quit());

  /*
   * Listen for live progress from the install handler. Stays subscribed for the
   * whole renderer lifetime — the handler is a no-op when no install is in
   * flight.
   */
  window.setupApi.onProgress(({ phase, percent }) => {
    if (phase === 'preparing') {
      setProgressIndeterminate(false);
      setProgressPercent(0);
      setProgressLabel('Preparing…');
      return;
    }
    if (phase === 'copying') {
      if (percent == null) {
        setProgressIndeterminate(true);
        setProgressLabel('Copying files (admin)…');
      } else {
        setProgressIndeterminate(false);
        setProgressPercent(percent);
        setProgressLabel('Copying files…');
      }
      return;
    }
    if (phase === 'finalizing') {
      setProgressIndeterminate(false);
      setProgressPercent(1);
      setProgressLabel('Finalizing…');
      return;
    }
    if (phase === 'done') {
      setProgressIndeterminate(false);
      setProgressPercent(1);
      setProgressLabel('Done');
    }
  });

  $('btn-install').addEventListener('click', async () => {
    if (state.busy) return;
    if (!state.payloadOk) {
      setInstallError('Cannot install: payload is missing or invalid.');
      return;
    }
    setInstallError('');
    setBusy(true);
    resetProgress();
    showProgress(true);

    const scope = getScope();
    const installDir = $('install-dir').value.trim();
    const launchWhenReady = $('chk-launch').checked;
    const res = await window.setupApi.install({ scope, installDir, launchWhenReady });

    setBusy(false);

    if (!res.ok) {
      showProgress(false);
      setInstallError(res);
      return;
    }

    /*
     * When the user opted into "Launch when ready", fire the app and quit the
     * installer immediately — there's nothing left for them to confirm. The
     * done panel only shows when launch is unchecked, so the user can read the
     * success message and close manually.
     */
    if (launchWhenReady && res.mainExePath) {
      await window.setupApi.launchApp(res.mainExePath);
      await window.setupApi.quit();
      return;
    }

    showProgress(false);
    $('panel-install').classList.add('hidden');
    $('panel-done').classList.remove('hidden');
    $('btn-install').classList.add('hidden');
    $('btn-quit').classList.add('hidden');
    $('launch-wrap').classList.add('hidden');
    $('btn-close').classList.remove('hidden');
  });

  $('btn-close').addEventListener('click', () => window.setupApi.quit());
}

init().catch((e) => {
  setInstallError(e && e.message ? e.message : String(e));
});
