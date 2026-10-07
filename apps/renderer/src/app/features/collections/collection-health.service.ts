import { computed, inject, Injectable } from '@angular/core';
import { environmentVariableMap } from '@testrix/contracts';

import {
  indexCollectionHealth,
  scanCollectionHealth,
  type CollectionHealthIssue,
  type CollectionHealthSeverity,
} from './collection-health';
import { CollectionHealthDialogService } from './collection-health-dialog.service';
import { CollectionsStore } from './collections.store';
import { EnvironmentsStore } from '../environments/environments.store';

export interface CollectionHealthMark {
  readonly severity: CollectionHealthSeverity;
  readonly label: string;
  readonly issues: readonly CollectionHealthIssue[];
}

@Injectable({ providedIn: 'root' })
export class CollectionHealthService {
  private readonly collections = inject(CollectionsStore);
  private readonly environments = inject(EnvironmentsStore);
  private readonly dialog = inject(CollectionHealthDialogService);

  /** Live scan of the open tree against the active environment. */
  readonly issues = computed(() => {
    const env = this.environments.items().find((item) => item.id === this.environments.activeId());
    return scanCollectionHealth({
      tree: this.collections.tree(),
      envVars: env ? environmentVariableMap(env.variables) : {},
    });
  });

  private readonly index = computed(() =>
    indexCollectionHealth(this.collections.tree(), this.issues()),
  );

  markFor(nodeId: string): CollectionHealthMark | null {
    const index = this.index();
    const direct = index.byNodeId.get(nodeId);
    if (direct && direct.length > 0) {
      const primary = direct.find((issue) => issue.severity === 'error') ?? direct[0];
      return { severity: primary.severity, label: primary.message, issues: direct };
    }
    const folder = index.folders.get(nodeId);
    if (!folder)
      return null;
    const noun = folder.count === 1 ? 'issue' : 'issues';
    return { severity: folder.severity, label: `${folder.count} ${noun}`, issues: folder.issues };
  }

  /** Opens the issue list for one node, or the whole tree when `nodeId` is null. */
  show(nodeId: string | null = null): void {
    const issues = nodeId ? this.issuesFor(nodeId) : this.issues();
    if (issues.length === 0)
      return;
    this.dialog.open(issues);
  }

  private issuesFor(nodeId: string): readonly CollectionHealthIssue[] {
    const index = this.index();
    return index.byNodeId.get(nodeId) ?? index.folders.get(nodeId)?.issues ?? [];
  }
}
