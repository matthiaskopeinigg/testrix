import type { HttpResponseTabOnSendId } from '../config/http-settings.schema';
import type { RequestResponseTabId } from '../config/request-runs-session.schema';
import type { HttpResponseSnapshot } from './outgoing-request.schema';
import { previewKind } from './response-body-display';
import { parseSetCookieHeaders } from './response-cookies';

export type ResolveResponseTabAfterSendInput = {
  readonly currentTab: RequestResponseTabId;
  readonly pinnedBaselineId: string | null;
  readonly snapshot: HttpResponseSnapshot;
  readonly runCount: number;
  readonly defaultTabOnSend: HttpResponseTabOnSendId;
};

/**
 * Chooses the response sub-tab after a successful send.
 * Keeps the user's current tab when it remains valid; otherwise applies the configured default.
 */
export function resolveResponseTabAfterSend(input: ResolveResponseTabAfterSendInput): RequestResponseTabId {
  if (input.pinnedBaselineId) {
    return 'diff';
  }

  if (isResponseTabAvailable(input.currentTab, input.snapshot, input.runCount)) {
    return input.currentTab;
  }

  return coerceDefaultTabForSnapshot(input.defaultTabOnSend, input.snapshot, input.runCount);
}

/** Whether a response sub-tab can be shown for the latest snapshot. */
export function isResponseTabAvailable(
  tab: RequestResponseTabId,
  snapshot: HttpResponseSnapshot,
  runCount: number,
): boolean {
  switch (tab) {
    case 'preview':
      return previewKind(snapshot) !== 'none';
    case 'cookies':
      return parseSetCookieHeaders(snapshot.headers).length > 0;
    case 'redirects':
      return (snapshot.redirects?.length ?? 0) > 0;
    case 'snapshots':
      return runCount > 0;
    default:
      return true;
  }
}

function coerceDefaultTabForSnapshot(
  preferred: HttpResponseTabOnSendId,
  snapshot: HttpResponseSnapshot,
  runCount: number,
): RequestResponseTabId {
  if (isResponseTabAvailable(preferred, snapshot, runCount)) {
    return preferred;
  }
  if (preferred === 'preview' && isResponseTabAvailable('body', snapshot, runCount)) {
    return 'body';
  }
  return 'body';
}
