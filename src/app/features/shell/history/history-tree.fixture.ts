import type { HistoryItem } from '@shared/config';

/** Sample history rows for unit tests (not shipped as defaults). */
export const HISTORY_ITEMS_FIXTURE: HistoryItem[] = [
  {
    id: 'hist-login',
    label: 'POST /login',
    method: 'POST',
    url: '/login',
    requestedAt: '2026-01-01T14:30:00.000Z',
    order: 0,
    snapshot: {
      id: 'snap-login',
      capturedAt: '2026-01-01T14:30:00.250Z',
      requestSummary: { method: 'POST', url: '/login', environmentId: null },
      status: { code: 200, text: 'OK', ok: true },
      timing: { totalMs: 250 },
      size: { headersBytes: 120, bodyBytes: 48 },
      headers: [{ key: 'Content-Type', value: 'application/json' }],
      redirects: [],
      body: { encoding: 'text', text: '{"ok":true}' },
    },
  },
  {
    id: 'hist-users',
    label: 'GET /users',
    method: 'GET',
    url: '/users',
    requestedAt: '2026-01-01T12:00:00.000Z',
    order: 10,
    snapshot: {
      id: 'snap-users',
      capturedAt: '2026-01-01T12:00:00.120Z',
      requestSummary: { method: 'GET', url: '/users', environmentId: null },
      status: { code: 404, text: 'Not Found', ok: false },
      timing: { totalMs: 120 },
      size: { headersBytes: 80, bodyBytes: 0 },
      headers: [],
      redirects: [],
      body: { encoding: 'text', text: '' },
    },
  },
];
