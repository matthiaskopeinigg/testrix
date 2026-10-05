import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { PackSelectionTreeNodeComponent } from './pack-selection-tree-node.component';
import type { PackTreeNode } from './pack-selection-tree';

export type { PackTreeNode } from './pack-selection-tree';
export {
  collectionNodesToPackTree,
  serviceNodesToPackTree,
  environmentsToPackTree,
  databaseNodesToPackTree,
  queryNodesToPackTree,
  templatesToPackTree,
  collectAllPackTreeIds,
  collectAllCollectionTreeIds,
  collectAllServiceTreeIds,
  collectAllEnvironmentIds,
  collectAllDatabaseTreeIds,
  collectAllQueryTreeIds,
  collectAllFlowTemplateIds,
} from './pack-selection-tree';

@Component({
  selector: 'tx-pack-selection-tree',
  standalone: true,
  imports: [PackSelectionTreeNodeComponent],
  templateUrl: './pack-selection-tree.component.html',
  styleUrl: './pack-selection-tree.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PackSelectionTreeComponent {
  readonly nodes = input.required<readonly PackTreeNode[]>();
  readonly selectedIds = input.required<ReadonlySet<string>>();
  readonly expandedIds = input.required<ReadonlySet<string>>();

  readonly selectedIdsChange = output<ReadonlySet<string>>();
  readonly expandedIdsChange = output<ReadonlySet<string>>();
}
