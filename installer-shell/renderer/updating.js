const PHASE_LABELS = {
  waiting: 'Waiting for Testrix to close…',
  preparing: 'Preparing files…',
  extracting: 'Extracting update…',
  copying: 'Installing files…',
  finalizing: 'Finishing up…',
  done: 'Starting Testrix…',
};

const statusEl = document.getElementById('updating-status');
const trackEl = document.getElementById('progress-track');
const fillEl = document.getElementById('progress-fill');
const percentEl = document.getElementById('progress-percent');

/**
 * @param {{ phase?: string, percent?: number | null }} payload
 */
function applyProgress(payload) {
  const phase = String(payload?.phase || '');
  if (statusEl && PHASE_LABELS[phase]) {
    statusEl.textContent = PHASE_LABELS[phase];
  }

  const percent = typeof payload?.percent === 'number' ? payload.percent : null;
  if (percent == null || !Number.isFinite(percent)) {
    trackEl?.classList.add('indeterminate');
    if (fillEl) {
      fillEl.style.width = '';
    }
    if (percentEl) {
      percentEl.textContent = '';
    }
    return;
  }

  const clamped = Math.max(0, Math.min(1, percent));
  trackEl?.classList.remove('indeterminate');
  if (fillEl) {
    fillEl.style.width = `${Math.round(clamped * 100)}%`;
  }
  if (percentEl) {
    percentEl.textContent = `${Math.round(clamped * 100)}%`;
  }
}

const api = window.setupApi;
if (api?.onProgress) {
  api.onProgress(applyProgress);
}
