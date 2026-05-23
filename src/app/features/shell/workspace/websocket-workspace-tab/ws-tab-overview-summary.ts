import type {
  CollectionFolderAuth,
  CollectionWebsocketSettings,
  WebsocketTabSectionId,
} from '@shared/config';

import type { TxIconName } from '@app/shared/icons/tx-icon.registry';

import { countDescribedKeyValueRows } from '../collection-folder-workspace-tab/folder-tab-overview-summary';
import { formatRequestAuthLabel } from '../request-workspace-tab/request-tab-overview-summary';

export interface WsOverviewConfigCard {
  readonly section: WebsocketTabSectionId;
  readonly label: string;
  readonly value: string;
  readonly icon: TxIconName;
}

/** Builds jump cards for the WebSocket configuration grid. */
export function buildWsOverviewConfigCards(
  settings: CollectionWebsocketSettings,
): readonly WsOverviewConfigCard[] {
  const queryCount = countDescribedKeyValueRows(settings.queryParams);
  const headerCount = countDescribedKeyValueRows(settings.headers);

  const paramsValue =
    queryCount === 0
      ? 'No query parameters'
      : `${queryCount} query param${queryCount === 1 ? '' : 's'}`;

  const preLen = settings.scripts.pre.trim().length;
  const postLen = settings.scripts.post.trim().length;
  const scriptsValue =
    preLen === 0 && postLen === 0
      ? 'No scripts'
      : `${preLen > 0 ? 'Before connect' : ''}${preLen > 0 && postLen > 0 ? ' · ' : ''}${postLen > 0 ? 'On message' : ''}`;

  const timeoutMs = settings.transport.timeoutMs;
  const settingsValue =
    timeoutMs !== undefined && timeoutMs > 0
      ? `${timeoutMs} ms timeout · ${settings.transport.followRedirects === false ? 'No redirects' : 'Follow redirects'}`
      : settings.transport.followRedirects === false
        ? 'No redirect follow'
        : 'Default transport';

  const messageTrimmed = settings.message.trim();
  const messageValue =
    messageTrimmed.length === 0
      ? 'No default message'
      : `${messageTrimmed.length} character${messageTrimmed.length === 1 ? '' : 's'}`;

  const docsTrimmed = settings.docs.trim();
  const docsValue = docsTrimmed.length > 0 ? `${docsTrimmed.length} chars documented` : 'No documentation';

  return [
    { section: 'params', label: 'Params', value: paramsValue, icon: 'hash' },
    { section: 'auth', label: 'Auth', value: formatRequestAuthLabel(settings.auth), icon: 'lock' },
    {
      section: 'headers',
      label: 'Headers',
      value:
        headerCount === 0
          ? 'No handshake headers'
          : `${headerCount} header${headerCount === 1 ? '' : 's'}`,
      icon: 'layers',
    },
    { section: 'message', label: 'Message', value: messageValue, icon: 'fileText' },
    { section: 'scripts', label: 'Scripts', value: scriptsValue, icon: 'code' },
    { section: 'settings', label: 'Settings', value: settingsValue, icon: 'sliders' },
    { section: 'docs', label: 'Docs', value: docsValue, icon: 'fileText' },
  ];
}

/** Short auth label for overview hints. */
export function formatWsAuthSummary(auth: CollectionFolderAuth): string {
  return formatRequestAuthLabel(auth);
}
