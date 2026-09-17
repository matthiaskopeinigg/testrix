const api = window.testrixSetup;

function $(id) {
  return document.getElementById(id);
}

function show(id, visible) {
  $(id).classList.toggle('hidden', !visible);
}

async function main() {
  if (!api) {
    return;
  }
  const meta = await api.getMeta();
  const uninstall = meta.mode === 'uninstall';
  document.documentElement.dataset.theme = meta.theme;
  document.querySelector('.setup')?.classList.toggle('is-uninstall', uninstall);
  $('meta-version').textContent = 'v' + meta.version;
  $('chrome-title').textContent = uninstall ? 'Testrix Uninstall' : 'Testrix Setup';
  $('hero-title').textContent = uninstall ? 'Uninstall Testrix' : 'Install Testrix';
  $('meta-tagline').textContent = uninstall ? 'Removes this copy from the PC' : 'Stays on this machine';
  $('btn-primary').textContent = uninstall ? 'Uninstall' : 'Install';
  $('btn-primary').classList.toggle('btn--danger', uninstall);
  $('btn-primary').classList.toggle('btn--primary', !uninstall);
  show('install-fields', !uninstall);
  show('uninstall-fields', uninstall);
  $('install-dir').value = meta.defaultDir;
  $('info-path').textContent = meta.installDir || 'Not found';
  if (uninstall) {
    $('help-body').textContent =
      'This removes Testrix from this computer. User data stays unless you tick the checkbox.';
    $('done-title').textContent = 'Uninstall finished';
    $('done-copy').textContent = 'Testrix has been removed.';
  }

  api.onProgress((event) => {
    show('panel-form', false);
    show('panel-progress', event.phase !== 'done');
    show('panel-done', event.phase === 'done');
    $('progress-label').textContent = event.label;
    if (event.percent !== null) {
      $('progress-percent').textContent = event.percent + '%';
      $('progress-fill').style.width = event.percent + '%';
    }
    const err = $('progress-error');
    err.classList.toggle('hidden', event.phase !== 'error');
    err.textContent = event.error || '';
    if (event.phase === 'error') {
      $('btn-primary').disabled = false;
    } else if (event.phase !== 'done') {
      $('btn-primary').disabled = true;
    }
    if (event.phase === 'done') {
      $('btn-cancel').textContent = 'Close';
      show('btn-help', false);
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

  $('btn-min').addEventListener('click', () => api.windowMinimize());
  $('btn-win-close').addEventListener('click', () => api.windowClose());
  $('btn-cancel').addEventListener('click', () => {
    if ($('btn-cancel').textContent === 'Close') {
      void api.windowClose();
      return;
    }
    void api.cancel();
  });
  $('btn-open').addEventListener('click', () => api.launchApp());
  $('btn-browse').addEventListener('click', async () => {
    const next = await api.chooseDirectory($('install-dir').value);
    if (next) {
      $('install-dir').value = next;
    }
  });
  $('btn-help').addEventListener('click', () => $('help').classList.remove('hidden'));
  $('help-scrim').addEventListener('click', () => $('help').classList.add('hidden'));
  $('help-done').addEventListener('click', () => $('help').classList.add('hidden'));

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
    if (event.key === 'Escape') {
      void api.cancel();
    }
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
