import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TxButtonComponent, TxOverlayComponent, TxOverlayHostDirective } from '@testrix/ui';

import { UpdateStore } from './update.store';
import { parseReleaseNotes } from './update-view';

/** Shown once after Setup relaunches Testrix on a new version. */
@Component({
  selector: 'tx-whats-new-dialog',
  standalone: true,
  imports: [TxButtonComponent, TxOverlayComponent],
  templateUrl: './whats-new-dialog.component.html',
  styleUrl: './whats-new-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [TxOverlayHostDirective],
})
export class WhatsNewDialogComponent {
  readonly updates = inject(UpdateStore);
  readonly titleId = 'tx-whats-new-title';

  readonly version = computed(() => this.updates.status().currentVersion);
  readonly previous = computed(() => this.updates.status().updatedFrom);
  readonly blocks = computed(() => {
    const release = this.updates.status().release;
    return release && release.version === this.version() ? parseReleaseNotes(release.notes) : [];
  });

  close(): void {
    this.updates.closeWhatsNew();
  }
}
