const params = new URLSearchParams(window.location.search);
const version = params.get('version');
const preview = params.get('preview') === '1';
const node = document.getElementById('tx-splash-version');
if (node) {
  node.textContent = version ? 'v' + version : '';
}
if (preview) {
  document.body.classList.add('is-preview');
}
document.getElementById('tx-splash-close')?.addEventListener('click', () => {
  window.close();
});
window.addEventListener('keydown', (event) => {
  if (preview && event.key === 'Escape') {
    window.close();
  }
});
