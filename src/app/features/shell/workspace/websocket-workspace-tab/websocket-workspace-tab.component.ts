import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { CollectionsService } from '@app/core/collections/collections.service';
import { findCollectionNode } from '@app/features/shell/collections/collection-tree.mutations';
import { TxBannerComponent } from '@app/shared/components/tx-banner/tx-banner.component';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';

@Component({
  selector: 'app-websocket-workspace-tab',
  standalone: true,
  imports: [TxBannerComponent, TxButtonComponent],
  templateUrl: './websocket-workspace-tab.component.html',
  styleUrl: './websocket-workspace-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WebsocketWorkspaceTabComponent {
  private readonly collectionsService = inject(CollectionsService);

  readonly resourceId = input.required<string>();
  readonly active = input(false);

  protected readonly missing = computed(() => !this.wsMeta());

  protected readonly wsPath = computed(() => this.wsMeta()?.wsPath ?? '/');

  protected readonly title = computed(() => this.wsMeta()?.label ?? 'WebSocket');

  private readonly wsMeta = computed(() => {
    const loc = findCollectionNode(this.collectionsService.nodes(), this.resourceId());
    if (loc?.node.data?.kind === 'websocket') {
      return {
        label: loc.node.label,
        wsPath: loc.node.data.wsPath ?? '/',
      };
    }
    return null;
  });

  protected handleConnect(): void {
    // Connection wiring is out of scope for the tab shell.
  }
}
