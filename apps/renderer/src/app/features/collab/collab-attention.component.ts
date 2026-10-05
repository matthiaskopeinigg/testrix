import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TxButtonComponent } from '@testrix/ui';

import { CollabStore } from './collab.store';

/**
 * Thin strip under the titlebar. Only unresolved reviews, credentials, and a
 * missing Git binary interrupt; offline and syncing stay quiet.
 */
@Component({
  selector: 'tx-collab-attention',
  standalone: true,
  imports: [TxButtonComponent],
  templateUrl: './collab-attention.component.html',
  styleUrl: './collab-attention.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollabAttentionComponent {
  readonly collab = inject(CollabStore);

  readonly visible = computed(() => {
    const status = this.collab.status();
    return status.kind === 'shared' && status.attention !== 'none';
  });

  readonly message = computed(() => {
    const status = this.collab.status();
    if (status.attention === 'auth')
      return status.lastError ?? 'Update the access token to keep syncing.';
    if (status.attention === 'tooling')
      return status.lastError ?? 'Install Git to sync this workspace.';
    const review = status.reviews[0];
    if (status.reviews.length > 1)
      return `${status.reviews.length} changes need you.`;
    return review ? `${review.label} changed on another PC.` : 'A change needs you.';
  });
}
