import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TxOverlayComponent, TxOverlayHostDirective } from '@testrix/ui';

import { CollectionHealthDialogService } from './collection-health-dialog.service';
import { CollectionsStore } from './collections.store';
import { WorkbenchStore } from '../workbench/workbench.store';

@Component({
  selector: 'tx-collection-health-dialog',
  standalone: true,
  imports: [TxOverlayComponent],
  templateUrl: './collection-health-dialog.component.html',
  styleUrl: './collection-health-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [TxOverlayHostDirective],
})
export class CollectionHealthDialogComponent {
  readonly dialog = inject(CollectionHealthDialogService);
  private readonly collections = inject(CollectionsStore);
  private readonly workbench = inject(WorkbenchStore);
  readonly titleId = 'tx-collection-health-title';

  close(): void {
    this.dialog.close();
  }

  openIssue(nodeId: string): void {
    const node = this.collections.nodeById(nodeId);
    if (!node || (node.kind !== 'http' && node.kind !== 'websocket'))
      return;
    this.workbench.openFromNode(node);
    this.dialog.close();
  }
}
