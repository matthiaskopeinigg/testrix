import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { CollabChangeKind } from '@testrix/contracts';

/**
 * Small glyph beside a changed item, matching the shapes used in the trees.
 */
@Component({
  selector: 'tx-collab-kind-icon',
  standalone: true,
  templateUrl: './collab-kind-icon.component.html',
  styleUrl: './collab-kind-icon.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollabKindIconComponent {
  readonly kind = input<CollabChangeKind>('workspace');
}
