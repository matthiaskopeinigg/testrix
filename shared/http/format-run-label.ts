import type { HttpResponseSnapshot } from './outgoing-request.schema';

/** Dropdown / list label for a stored response run. */
export function formatRunLabel(run: HttpResponseSnapshot): string {
  const when = new Date(run.capturedAt).toLocaleString();
  return `${when} · ${run.status.code} · ${run.timing.totalMs} ms · ${run.size.bodyBytes} B`;
}
