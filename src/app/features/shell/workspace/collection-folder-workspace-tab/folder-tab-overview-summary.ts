import type {
  CollectionDescribedKeyValueRow,
  CollectionFolderSettings,
  CollectionFolderTabSectionId,
} from '@shared/config';

import type { TxIconName } from '@app/shared/icons/tx-icon.registry';

import { formatRequestAuthLabel } from '../request-workspace-tab/request-tab-overview-summary';

export interface FolderOverviewInheritedVariable {
  readonly source: string;
  readonly key: string;
}

export interface FolderOverviewOwnVariable {
  readonly key: string;
  readonly valuePreview: string;
}

export interface FolderOverviewConfigCard {
  readonly section: CollectionFolderTabSectionId;
  readonly label: string;
  readonly value: string;
  readonly icon: TxIconName;
}

export interface FolderOverviewContentsCounts {
  readonly requests: number;
  readonly folders: number;
}

/** Counts described key/value rows with a non-empty key. */
export function countDescribedKeyValueRows(rows: readonly CollectionDescribedKeyValueRow[]): number {
  return rows.filter((row) => row.key.trim().length > 0).length;
}

/** Builds jump cards for the folder configuration grid. */
export function buildFolderOverviewConfigCards(
  settings: CollectionFolderSettings,
): readonly FolderOverviewConfigCard[] {
  const variableCount = countDescribedKeyValueRows(settings.variables);
  const headerCount = countDescribedKeyValueRows(settings.headers);

  const preLen = settings.scripts.pre.trim().length;
  const postLen = settings.scripts.post.trim().length;
  const scriptsValue =
    preLen === 0 && postLen === 0
      ? 'No scripts'
      : `${preLen > 0 ? 'Pre-request' : ''}${preLen > 0 && postLen > 0 ? ' · ' : ''}${postLen > 0 ? 'Post-response' : ''}`;

  const timeoutMs = settings.transport.timeoutMs;
  const settingsValue =
    timeoutMs !== undefined && timeoutMs > 0
      ? `${timeoutMs} ms timeout · ${settings.transport.followRedirects === false ? 'No redirects' : 'Follow redirects'}`
      : settings.transport.followRedirects === false
        ? 'No redirect follow'
        : 'Default transport';

  const docsTrimmed = settings.docs.trim();
  const docsValue = docsTrimmed.length > 0 ? `${docsTrimmed.length} chars documented` : 'No documentation';

  return [
    {
      section: 'variables',
      label: 'Variables',
      value:
        variableCount === 0
          ? 'No collection variables'
          : `${variableCount} collection variable${variableCount === 1 ? '' : 's'}`,
      icon: 'hash',
    },
    {
      section: 'headers',
      label: 'Headers',
      value:
        headerCount === 0
          ? 'No default headers'
          : `${headerCount} default header${headerCount === 1 ? '' : 's'}`,
      icon: 'layers',
    },
    { section: 'auth', label: 'Auth', value: formatRequestAuthLabel(settings.auth), icon: 'lock' },
    { section: 'script', label: 'Scripts', value: scriptsValue, icon: 'code' },
    { section: 'settings', label: 'Settings', value: settingsValue, icon: 'sliders' },
    { section: 'docs', label: 'Docs', value: docsValue, icon: 'fileText' },
  ];
}

/** Truncates a variable value for overview display. */
export function previewFolderVariableValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '—';
  }
  const maxLen = 48;
  if (trimmed.length <= maxLen) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLen - 1)}…`;
}
