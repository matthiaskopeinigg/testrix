/* global window, document */

const $ = (id) => document.getElementById(id);

/**
 * Platform-keyed copy for the help modal. The actual installer/uninstaller
 * pipeline is Windows-first today, but every supported platform has a path
 * shown in the help so the same UI can be reused on macOS and Linux without
 * code changes.
 */
const HELP_COPY = {
  win: {
    intro:
      'This uninstaller removes Testrix from your computer. It stays running until you click <strong>Uninstall</strong>, so you can cancel any time before that.',
    removes: [
      'Application files at the install location (Program Files or your user profile).',
      'Desktop and Start menu shortcuts created by the installer.',
      'The matching <em>Apps &amp; Features</em> uninstall entry.',
    ],
    userdata:
      'Optional: deletes Testrix data folders — settings JSON, profiles, collections, environments, test suites, history, and team Git workspaces (including custom config or team repo locations).',
  },
  mac: {
    intro:
      'This uninstaller removes Testrix from your Mac. The application stays running until you click <strong>Uninstall</strong>, so you can cancel any time before that.',
    removes: [
      'The <em>Testrix.app</em> bundle in your Applications folder.',
      'Any dock or login-item references managed by the installer.',
    ],
    userdata:
      'Optional: deletes Testrix data folders — settings JSON, profiles, collections, environments, test suites, history, and team Git workspaces.',
  },
  linux: {
    intro:
      'This uninstaller removes Testrix from your system. The application stays running until you click <strong>Uninstall</strong>, so you can cancel any time before that.',
    removes: [
      'The application files at the install location (AppImage or extracted folder).',
      'The matching <code>.desktop</code> entry under <code>~/.local/share/applications</code>.',
    ],
    userdata:
      'Optional: deletes Testrix data folders — settings JSON, profiles, collections, environments, test suites, history, and team Git workspaces.',
  },
};

const state = {
  busy: false,
  info: null,
};

function setBusy(busy) {
  state.busy = busy;
  $('btn-uninstall').disabled = busy;
  $('btn-quit').disabled = busy;
  $('btn-close').disabled = busy;
  $('chk-remove-data').disabled = busy;
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
 * Renders the styled "Uninstall failed" alert beneath the form. Accepts either
 * a plain string or an object from the uninstall IPC so we can surface a `code`
 * (e.g. ELEVATION_DENIED) and an optional path hint.
 */
function setUninstallError(input) {
  const wrap = $('uninstall-error-wrap');
  const msgEl = $('uninstall-error');
  if (!input) {
    wrap.classList.add('hidden');
    msgEl.textContent = '';
    return;
  }
  const message =
    typeof input === 'string' ? input : input.message || 'Uninstall failed.';
  const code = typeof input === 'object' ? input.code : null;
  const path = typeof input === 'object' ? input.path : null;
  const parts = [message];
  if (path) parts.push(`(path: ${path})`);
  if (code && !message.includes(code)) parts.push(`[${code}]`);
  msgEl.textContent = parts.join(' ');
  wrap.classList.remove('hidden');
}

function setMissingWarning(msg) {
  const wrap = $('missing-warning');
  const p = $('missing-msg');
  if (!msg) {
    wrap.classList.add('hidden');
    p.textContent = '';
    return;
  }
  p.textContent = msg;
  wrap.classList.remove('hidden');
}

function formatScope(scope) {
  if (scope === 'machine') return 'Everyone on this PC';
  if (scope === 'user') return 'Only for me';
  if (scope === 'unknown') return 'Unknown';
  return scope;
}

function formatDataDeletionSummary(info) {
  const targets = info?.dataDeletionTargets?.length
    ? info.dataDeletionTargets
    : info?.userDataPath
      ? [info.userDataPath]
      : [];

  if (targets.length === 0) {
    return 'Deletes Testrix settings, profiles, collections, test suites, and team Git data.';
  }

  const primary = info.userDataPath || targets[0];
  const extraCount = targets.filter((target) => target !== primary).length;
  if (extraCount > 0) {
    return `Deletes ${primary} plus ${extraCount} linked folder${extraCount === 1 ? '' : 's'} (profiles, collections, test suites, team Git data, settings JSON).`;
  }

  return `Deletes ${primary} including profiles, collections, test suites, team Git data, and settings JSON.`;
}

/**
 * Pretty-renders the install info into the read-only summary rows. When info
 * is unavailable (e.g. running the uninstaller from outside an install dir)
 * we render dashes and disable the Uninstall button via setMissingWarning.
 */
function renderInstallInfo(info) {
  state.info = info;
  if (!info || !info.ok) {
    $('info-scope').textContent = '—';
    $('info-path').textContent = '—';
    $('chk-remove-data-path').textContent =
      info?.userDataPath
        ? formatDataDeletionSummary(info)
        : 'Deletes Testrix settings, profiles, collections, test suites, and team Git data.';
    setMissingWarning(info?.message || 'Cannot determine the install location.');
    $('btn-uninstall').disabled = true;
    return;
  }
  setMissingWarning('');
  $('info-scope').textContent = formatScope(info.scope);
  $('info-path').textContent = info.installDir || '—';
  if (info.version) $('meta-version').textContent = `Version ${info.version}`;
  if (info.userDataPath || info.dataDeletionTargets?.length) {
    $('chk-remove-data-path').textContent = formatDataDeletionSummary(info);
  }
}

/* ────────────────────────────────────────────────────────── help modal */

function renderHelpContent(platform) {
  const copy = HELP_COPY[platform] || HELP_COPY.win;
  $('help-intro').innerHTML = copy.intro;
  $('help-userdata').innerHTML = copy.userdata;
  const list = $('help-removes-list');
  list.innerHTML = copy.removes.map((line) => `<li>${line}</li>`).join('');
}

function openHelp() {
  $('help-modal').classList.remove('hidden');
  $('btn-help-done').focus();
}

function closeHelp() {
  $('help-modal').classList.add('hidden');
  $('btn-info').focus();
}

function wireExternalLinks() {
  document.body.addEventListener('click', (event) => {
    const target = event.target.closest('[data-href]');
    if (!target) return;
    event.preventDefault();
    const url = target.getAttribute('data-href');
    if (url) window.uninstallerApi.openExternal(url);
  });
}

/* ─────────────────────────────────────────────────────────── init */

async function init() {
  $('btn-titlebar-min').addEventListener('click', () => window.uninstallerApi.minimize());
  $('btn-titlebar-close').addEventListener('click', () => window.uninstallerApi.quit());

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

  const [ver, platform, info] = await Promise.all([
    window.uninstallerApi.getVersion(),
    window.uninstallerApi.getPlatform(),
    window.uninstallerApi.getInstallInfo(),
  ]);

  if (ver) $('meta-version').textContent = `Version ${ver}`;
  renderHelpContent(platform);
  renderInstallInfo(info);

  $('btn-quit').addEventListener('click', () => window.uninstallerApi.quit());

  window.uninstallerApi.onProgress(({ phase, percent }) => {
    const labels = {
      preparing: 'Preparing…',
      'removing-shortcuts': 'Removing shortcuts…',
      'removing-registry': 'Removing system entries…',
      'removing-data': 'Removing user data…',
      'removing-app': 'Removing application files…',
      finalizing: 'Finalizing…',
      done: 'Done',
    };
    if (labels[phase]) setProgressLabel(labels[phase]);
    if (percent == null) {
      setProgressIndeterminate(true);
    } else {
      setProgressIndeterminate(false);
      setProgressPercent(percent);
    }
  });

  $('btn-uninstall').addEventListener('click', async () => {
    if (state.busy) return;
    if (!state.info || !state.info.ok) return;
    setUninstallError('');
    setBusy(true);
    resetProgress();
    showProgress(true);

    const removeUserData = $('chk-remove-data').checked;
    const res = await window.uninstallerApi.uninstall({ removeUserData });

    setBusy(false);

    if (!res.ok) {
      showProgress(false);
      setUninstallError(res);
      return;
    }

    showProgress(false);
    $('panel-uninstall').classList.add('hidden');
    $('panel-done').classList.remove('hidden');
    $('done-subtitle').textContent = 'Testrix has been removed from this computer.';
    $('btn-uninstall').classList.add('hidden');
    $('btn-quit').classList.add('hidden');
    $('btn-close').classList.remove('hidden');
  });

  $('btn-close').addEventListener('click', () => window.uninstallerApi.quit());
}

init().catch((e) => {
  setUninstallError(e && e.message ? e.message : String(e));
});
