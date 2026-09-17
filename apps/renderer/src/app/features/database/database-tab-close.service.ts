import { Injectable, inject } from '@angular/core';

import { parseDatabaseConnectionTabNodeId } from '@testrix/contracts';

import { ConfirmDialogService } from '../../core/confirm-dialog.service';
import { DesktopApiService } from '../../core/desktop-api.service';
import { WorkbenchStore } from '../workbench/workbench.store';
import { DatabaseStore } from './database.store';
import { DatabaseTxnTracker } from './database-txn.tracker';

@Injectable({ providedIn: 'root' })
export class DatabaseTabCloseService {
  private readonly workbench = inject(WorkbenchStore);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly txn = inject(DatabaseTxnTracker);
  private readonly desktop = inject(DesktopApiService);
  private readonly database = inject(DatabaseStore);

  async close(groupId: string, tabId: string): Promise<void> {
    if (!(await this.confirmTabs([tabId])))
      return;
    await this.rollback(tabId);
    this.discardPending([tabId]);
    this.workbench.close(groupId, tabId);
  }

  async closeOthers(groupId: string, keepId: string): Promise<void> {
    const group = this.workbench.groups().find((item) => item.id === groupId);
    const ids = (group?.tabs ?? []).filter((tab) => tab.id !== keepId).map((tab) => tab.id);
    if (!(await this.confirmTabs(ids)))
      return;
    for (const id of ids)
      await this.rollback(id);
    this.discardPending(ids);
    this.workbench.closeOthers(groupId, keepId);
  }

  async closeToTheRight(groupId: string, tabId: string): Promise<void> {
    const group = this.workbench.groups().find((item) => item.id === groupId);
    const index = group?.tabs.findIndex((tab) => tab.id === tabId) ?? -1;
    const ids = (group?.tabs ?? []).slice(index + 1).map((tab) => tab.id);
    if (!(await this.confirmTabs(ids)))
      return;
    for (const id of ids)
      await this.rollback(id);
    this.discardPending(ids);
    this.workbench.closeToTheRight(groupId, tabId);
  }

  async closeAllInGroup(groupId: string): Promise<void> {
    const group = this.workbench.groups().find((item) => item.id === groupId);
    const ids = (group?.tabs ?? []).map((tab) => tab.id);
    if (!(await this.confirmTabs(ids)))
      return;
    for (const id of ids)
      await this.rollback(id);
    this.discardPending(ids);
    this.workbench.closeAllInGroup(groupId);
  }

  private async confirmTabs(ids: readonly string[]): Promise<boolean> {
    const pending = this.txn.uncommittedIds(ids);
    if (pending.length === 0)
      return true;
    return this.confirm.ask({
      title: pending.length === 1 ? 'Uncommitted query' : 'Uncommitted queries',
      body: 'Closing rolls back the held transaction. Push first if you want to keep the changes.',
      confirmLabel: 'Rollback',
      cancelLabel: 'Keep tab',
    });
  }

  private async rollback(tabId: string): Promise<void> {
    if (!this.txn.isUncommitted(tabId))
      return;
    await this.desktop.api.database.sessionRollback(tabId);
    this.txn.clear(tabId);
  }

  private discardPending(tabIds: readonly string[]): void {
    const wanted = new Set(tabIds);
    for (const group of this.workbench.groups()) {
      for (const tab of group.tabs) {
        if (!wanted.has(tab.id) || tab.kind !== 'database-connection')
          continue;
        const connectionId = parseDatabaseConnectionTabNodeId(tab.nodeId);
        if (connectionId)
          this.database.discardPendingConnection(connectionId);
      }
    }
  }
}
