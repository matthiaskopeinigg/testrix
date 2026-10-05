import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  TxButtonComponent,
  TxCheckComponent,
  TxInputComponent,
  TxOverlayComponent,
  TxSelectComponent,
  type TxSelectOption,
} from '@testrix/ui';

import { WorkspacesStore } from '../workspaces/workspaces.store';
import { CollabStore } from './collab.store';

/**
 * Two short steps: reach the repository, then pick which of its workspaces come to
 * this PC and, optionally, publish a local one into it.
 */
@Component({
  selector: 'tx-collab-connect-dialog',
  standalone: true,
  imports: [TxOverlayComponent, TxButtonComponent, TxInputComponent, TxCheckComponent, TxSelectComponent],
  templateUrl: './collab-connect-dialog.component.html',
  styleUrl: './collab-connect-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollabConnectDialogComponent {
  readonly collab = inject(CollabStore);
  private readonly workspaces = inject(WorkspacesStore);

  readonly publishable = this.collab.publishableWorkspaces;

  readonly publishOptions = computed<readonly TxSelectOption[]>(() =>
    this.publishable().map((item) => ({ value: item.id, label: item.name })),
  );

  readonly publishLabel = computed(() => {
    const id = this.collab.publishDraftId();
    const name = this.publishable().find((item) => item.id === id)?.name ?? this.defaultPublish()?.name;
    return name ? `Also publish ${name}` : 'Also publish a workspace';
  });

  readonly finishLabel = computed(() => {
    const picked = this.collab.pickedRemoteIds().size;
    const publishing = this.collab.publishDraftId() !== null;
    if (picked > 0 && publishing)
      return 'Add and publish';
    if (publishing)
      return 'Publish and open';
    return picked === 1 ? 'Add workspace' : `Add ${picked} workspaces`;
  });

  handleAdvancedToggle(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLDetailsElement)
      this.collab.connectAdvanced.set(target.open);
  }

  togglePublish(checked: boolean): void {
    this.collab.publishDraftId.set(checked ? this.defaultPublish()?.id ?? null : null);
  }

  /** The active workspace when it is local, otherwise the first local one. */
  private defaultPublish(): { readonly id: string; readonly name: string } | null {
    const activeId = this.workspaces.activeId();
    const items = this.publishable();
    return items.find((item) => item.id === activeId) ?? items[0] ?? null;
  }
}
