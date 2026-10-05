import { SETTINGS_KV_SOURCE_ID, type FolderTabSection } from '@testrix/contracts';

import type { ShellStateService } from '../../../core/shell-state.service';
import type { CollectionsStore } from '../../collections/collections.store';
import type { WorkbenchStore } from '../workbench.store';

/**
 * Opens the folder (or Settings HTTP) that owns an inherited key/value row.
 */
export function openInheritedKvSource(
  sourceId: string | undefined,
  section: FolderTabSection,
  deps: {
    readonly collections: CollectionsStore;
    readonly workbench: WorkbenchStore;
    readonly shell: ShellStateService;
  },
): void {
  if (!sourceId || sourceId === SETTINGS_KV_SOURCE_ID) {
    deps.shell.openSettings('http', 'http-headers');
    return;
  }
  const folder = deps.collections.folderById(sourceId);
  if (!folder)
    return;
  deps.workbench.openFromCollectionFolder(folder, section);
}
