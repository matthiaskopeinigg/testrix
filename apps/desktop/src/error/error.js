const COPY = {
  boot: {
    eyebrow: 'Startup',
    title: "Couldn't start",
    message: 'Testrix did not finish loading. Retry, or quit and try again.',
    action: 'Retry',
    chrome: 'Testrix',
  },
  app: {
    eyebrow: 'Workbench',
    title: 'Workbench stopped',
    message: 'The window closed unexpectedly. Local files on this PC were not removed.',
    action: 'Relaunch',
    chrome: 'Testrix',
  },
};

const params = new URLSearchParams(window.location.search);
const kind = params.get('kind') === 'app' ? 'app' : 'boot';
const copy = COPY[kind];
const code = params.get('code') || (kind === 'app' ? 'APP_RENDERER_CRASH' : 'APP_BOOT_TIMEOUT');
const message = params.get('message') || copy.message;
const version = params.get('version');

const root = document.querySelector('.tx-error');
root?.classList.add(kind === 'app' ? 'is-app' : 'is-boot');
document.title = copy.title;

const setText = (id, value) => {
  const node = document.getElementById(id);
  if (node) {
    node.textContent = value;
  }
};

setText('chrome-title', copy.chrome);
setText('error-eyebrow', copy.eyebrow);
setText('error-title', copy.title);
setText('error-message', message);
setText('error-code', code);
setText('error-version', version ? 'v' + version : 'Local workbench');

const relaunch = document.getElementById('btn-relaunch');
if (relaunch) {
  relaunch.textContent = copy.action;
}

const api = window.testrixError;
const quit = () => {
  if (api) {
    void api.quit();
    return;
  }
  window.close();
};

const retry = () => {
  if (api) {
    void api.relaunch();
    return;
  }
  window.location.reload();
};

document.getElementById('btn-quit')?.addEventListener('click', quit);
document.getElementById('btn-close')?.addEventListener('click', quit);
document.getElementById('btn-relaunch')?.addEventListener('click', retry);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    quit();
  }
  if (event.key === 'Enter' && event.target.tagName !== 'INPUT') {
    retry();
  }
});
