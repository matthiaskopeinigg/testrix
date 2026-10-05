import { Injectable, inject } from '@angular/core';
import type { TxRailItemId } from '@testrix/ui';

import { ShellStateService } from '../../core/shell-state.service';
import { WorkbenchStore } from '../workbench/workbench.store';
import type { HelpSectionId } from './help-registry';

export interface HelpOpenTarget {
  readonly section: HelpSectionId;
  readonly articleId?: string;
}

/**
 * Resolves contextual Help targets from the active rail and focused workbench tab.
 */
@Injectable({ providedIn: 'root' })
export class HelpContextService {
  private readonly shell = inject(ShellStateService);
  private readonly workbench = inject(WorkbenchStore);

  contextualTarget(): HelpOpenTarget {
    const focused = this.workbench.focusedGroup();
    const tab = focused?.tabs.find((item) => item.id === focused.activeTabId);
    if (tab?.kind === 'collab-review')
      return { section: 'workspaces', articleId: 'collab-share' };
    if (
      tab?.kind === 'http' ||
      tab?.kind === 'websocket' ||
      tab?.kind === 'history' ||
      tab?.kind === 'database-query'
    ) {
      return { section: 'workbench', articleId: 'workbench-editors' };
    }
    const rail = this.shell.activeRail();
    return targetForRail(rail);
  }

  openContextualHelp(): void {
    this.shell.openHelp(this.contextualTarget());
  }

  openArticle(section: HelpSectionId, articleId: string): void {
    this.shell.openHelp({ section, articleId });
  }
}

function targetForRail(rail: TxRailItemId): HelpOpenTarget {
  switch (rail) {
    case 'collections':
      return { section: 'collections', articleId: 'collections-tree' };
    case 'environments':
      return { section: 'environments', articleId: 'environments-vars' };
    case 'database':
      return { section: 'database', articleId: 'database-sidebar' };
    case 'services':
      return { section: 'services', articleId: 'services-catalog' };
    case 'tools':
      return { section: 'tools', articleId: 'tools-uuid' };
    case 'history':
      return { section: 'workbench', articleId: 'workbench-history' };
    default:
      return { section: 'start', articleId: 'start-local' };
  }
}
