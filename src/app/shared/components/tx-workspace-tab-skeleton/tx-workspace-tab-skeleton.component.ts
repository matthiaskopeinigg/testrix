import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type TxWorkspaceTabSkeletonVariant = 'request' | 'folder' | 'generic';

/**
 * Chrome placeholder shown while a workspace tab host mounts for the first time.
 */
@Component({
  selector: 'tx-workspace-tab-skeleton',
  standalone: true,
  templateUrl: './tx-workspace-tab-skeleton.component.html',
  styleUrl: './tx-workspace-tab-skeleton.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tx-workspace-tab-skeleton-host',
    role: 'status',
    'aria-busy': 'true',
    'aria-label': 'Loading tab',
  },
})
export class TxWorkspaceTabSkeletonComponent {
  readonly variant = input<TxWorkspaceTabSkeletonVariant>('request');

  /** Placeholder section tab chips. */
  protected sectionSlots(): readonly number[] {
    return this.variant() === 'folder' ? [0, 1, 2, 3, 4] : [0, 1, 2, 3, 4, 5];
  }
}
