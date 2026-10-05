const api = window.testrixSetup;

let hasLiveProgress = false;
let progressStartedAt = 0;
let elapsedTimer = 0;

function $(id) {
  return document.getElementById(id);
}

function show(id, visible) {
  $(id).classList.toggle('hidden', !visible);
}

/** Formats a duration as `m:ss` for the live elapsed clock. */
function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes + ':' + String(seconds).padStart(2, '0');
}

/** Stops the elapsed clock without clearing the last value. */
function stopElapsed() {
  if (elapsedTimer) {
    clearInterval(elapsedTimer);
    elapsedTimer = 0;
  }
}

/**
 * Refreshes the elapsed clock and the "taking longer" hint.
 * @param {boolean} isSlow
 */
function tickElapsed(isSlow) {
  const elapsed = $('progress-elapsed');
  const hint = $('progress-hint');
  if (!elapsed || !progressStartedAt) {
    return;
  }
  const ms = Date.now() - progressStartedAt;
  elapsed.textContent = formatElapsed(ms);
  if (hint && isSlow && ms >= 20_000 && $('progress-error').classList.contains('hidden')) {
    hint.textContent = 'This is taking longer than usual. Leave this window open.';
  }
}

/** Starts the elapsed clock once per update so a stuck step is obvious. */
function startElapsed() {
  if (!progressStartedAt) {
    progressStartedAt = Date.now();
  }
  if (elapsedTimer) {
    return;
  }
  tickElapsed(true);
  elapsedTimer = setInterval(() => tickElapsed(true), 250);
}

function applyChrome(mode) {
  const uninstall = mode === 'uninstall';
  const updating = mode === 'update';
  const title = uninstall ? 'Testrix Uninstall' : updating ? 'Testrix Update' : 'Testrix Setup';
  document.title = title;
  document.querySelector('.setup')?.classList.toggle('is-uninstall', uninstall);
  document.querySelector('.setup')?.classList.toggle('is-update', updating);
  $('chrome-title').textContent = title;
  $('hero-eyebrow').textContent = uninstall ? 'Remove Testrix' : updating ? 'Software update' : 'Local workbench';
  $('hero-title').textContent = uninstall ? 'Uninstall Testrix' : updating ? 'Installing update' : 'Install Testrix';
  $('meta-tagline').textContent = uninstall ? 'Removes this copy from the PC' : 'Stays on this machine';
  $('btn-primary').textContent = uninstall ? 'Uninstall' : 'Install';
  show('install-fields', !uninstall && !updating);
  show('uninstall-fields', uninstall);
  if (updating) {
    show('panel-form', false);
    show('panel-progress', true);
    $('btn-primary').disabled = true;
    if (!hasLiveProgress) {
      setProgress(null, 'Preparing the update…');
      startElapsed();
    }
    $('help-body').textContent = 'Testrix is installing the downloaded update on this PC.';
    $('done-title').textContent = 'Update installed';
    $('done-copy').textContent = 'Testrix will open with the new version.';
  }
}

function setProgress(percent, label) {
  if (label) {
    $('progress-label').textContent = label;
  }
  const track = $('progress-track');
  const fill = $('progress-fill');
  const waiting = percent === null;
  track.classList.toggle('is-indeterminate', waiting);
  if (waiting) {
    $('progress-percent').textContent = '';
    fill.style.width = '';
    track.removeAttribute('aria-valuenow');
    return;
  }
  $('progress-percent').textContent = percent + '%';
  fill.style.width = percent + '%';
  track.setAttribute('aria-valuenow', String(percent));
}

function queryParam(name) {
  return new URLSearchParams(location.search).get(name) || '';
}

function selectedScope() {
  return document.querySelector('input[name="scope"]:checked')?.value || 'user';
}

let userDir = queryParam('defaultDir');
let machineDir = queryParam('machineDir');

function applyScopeDir() {
  const field = $('install-dir');
  if (!field)
    return;
  const current = field.value.trim();
  const next = selectedScope() === 'machine' ? machineDir : userDir;
  if (!next)
    return;
  if (!current || current === userDir || current === machineDir)
    field.value = next;
}

function closeWindow() {
  if (api)
    void api.windowClose();
  else
    window.close();
}

function bindChrome() {
  $('btn-help').addEventListener('click', () => $('help').classList.remove('hidden'));
  $('help-scrim').addEventListener('click', () => $('help').classList.add('hidden'));
  $('help-done').addEventListener('click', () => $('help').classList.add('hidden'));
  $('btn-min').addEventListener('click', () => {
    if (api)
      void api.windowMinimize();
  });
  $('btn-win-close').addEventListener('click', () => closeWindow());
  $('btn-cancel').addEventListener('click', () => {
    if ($('btn-cancel').textContent === 'Close') {
      closeWindow();
      return;
    }
    if (api)
      void api.cancel();
    else
      window.close();
  });
  document.querySelectorAll('input[name="scope"]').forEach((input) => {
    input.addEventListener('change', applyScopeDir);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape')
      return;
    const root = document.querySelector('.setup');
    if (root?.classList.contains('is-update') && !root.classList.contains('is-update-error'))
      return;
    if ($('help') && !$('help').classList.contains('hidden')) {
      $('help').classList.add('hidden');
      return;
    }
    if ($('btn-cancel').textContent === 'Close') {
      closeWindow();
      return;
    }
    if (api)
      void api.cancel();
    else
      window.close();
  });
}

applyChrome(queryParam('mode') || 'install');
if (userDir)
  $('install-dir').value = userDir;
const knownInstall = queryParam('installDir') || userDir;
if (knownInstall)
  $('info-path').textContent = knownInstall;
const queryVersion = queryParam('version');
if (queryVersion)
  $('meta-version').textContent = 'v' + queryVersion;
bindChrome();

async function main() {
  if (!api) {
    return;
  }
  let uninstall = false;
  api.onProgress((event) => {
    const root = document.querySelector('.setup');
    const updating = root?.classList.contains('is-update');
    root?.classList.toggle('is-update-error', Boolean(updating && event.phase === 'error'));
    root?.classList.toggle('is-update-done', Boolean(updating && event.phase === 'done'));
    show('panel-form', false);
    show('panel-progress', event.phase !== 'done');
    show('panel-done', event.phase === 'done');
    hasLiveProgress = true;
    setProgress(event.percent, event.label);
    const err = $('progress-error');
    err.classList.toggle('hidden', event.phase !== 'error');
    err.textContent = event.error || '';
    if (event.phase === 'done') {
      stopElapsed();
      $('progress-elapsed').textContent = '';
    } else if (event.phase === 'error') {
      stopElapsed();
      const ms = progressStartedAt ? Date.now() - progressStartedAt : 0;
      $('progress-elapsed').textContent = ms ? 'Failed after ' + formatElapsed(ms) : '';
    } else {
      startElapsed();
    }
    if (event.phase === 'error') {
      $('btn-primary').disabled = false;
      if (updating) {
        $('btn-cancel').textContent = 'Close';
        $('btn-cancel').classList.remove('hidden');
      }
    } else if (event.phase !== 'done') {
      $('btn-primary').disabled = true;
    }
    if (event.phase === 'done') {
      $('btn-cancel').textContent = 'Close';
      show('btn-help', false);
      if (updating) {
        $('btn-primary').classList.add('hidden');
        $('btn-open').classList.add('hidden');
        return;
      }
      if (uninstall) {
        $('btn-primary').disabled = false;
        $('btn-primary').textContent = 'Close';
        $('btn-primary').classList.remove('btn--danger');
        $('btn-primary').classList.add('btn--primary');
        $('btn-primary').dataset.done = '1';
        $('btn-cancel').classList.add('hidden');
      } else {
        $('btn-primary').classList.add('hidden');
        $('btn-open').classList.remove('hidden');
      }
    }
  });

  let meta;
  try {
    meta = await api.getMeta();
  } catch {
    meta = null;
  }
  if (meta) {
    uninstall = meta.mode === 'uninstall';
    applyChrome(meta.mode);
    document.documentElement.dataset.theme = meta.theme;
    $('btn-primary').classList.toggle('btn--danger', uninstall);
    $('btn-primary').classList.toggle('btn--primary', !uninstall);
    $('meta-version').textContent = 'v' + meta.version;
    userDir = meta.defaultDir || userDir;
    machineDir = meta.machineDir || machineDir;
    applyScopeDir();
    $('info-path').textContent = meta.installDir || knownInstall || 'Not found';
    if (uninstall) {
      $('help-body').textContent =
        'This removes Testrix from this computer. User data stays unless you tick the checkbox.';
      $('done-title').textContent = 'Uninstall finished';
      $('done-copy').textContent = 'Testrix has been removed.';
    }
  }

  $('btn-open').addEventListener('click', () => api.launchApp());
  $('btn-browse').addEventListener('click', async () => {
    const next = await api.chooseDirectory($('install-dir').value);
    if (next) {
      $('install-dir').value = next;
    }
  });

  $('btn-primary').addEventListener('click', async () => {
    if ($('btn-primary').dataset.done === '1') {
      await api.windowClose();
      return;
    }
    if (uninstall) {
      await api.startUninstall({ removeUserData: $('chk-remove-data').checked });
      return;
    }
    const createShortcuts = $('chk-shortcuts').checked;
    $('done-copy').textContent = createShortcuts
      ? 'Open Testrix now, or start it later from the Start menu or desktop.'
      : 'You can open Testrix now, or close this window.';
    await api.startInstall({
      scope: document.querySelector('input[name="scope"]:checked').value,
      installDir: $('install-dir').value,
      launchWhenReady: false,
      createShortcuts,
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target.tagName !== 'INPUT') {
      if (!$('btn-open').classList.contains('hidden')) {
        $('btn-open').click();
        return;
      }
      $('btn-primary').click();
    }
  });
}

void main();
