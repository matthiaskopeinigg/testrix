import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { TxBannerComponent } from '@app/shared/components/tx-banner/tx-banner.component';

export type WsConnectionState = 'idle' | 'connecting' | 'connected';

@Component({
  selector: 'app-ws-tab-messages-panel',
  standalone: true,
  imports: [TxBannerComponent],
  template: `
    <section class="ws-messages-panel" aria-label="WebSocket messages">
      <header class="ws-messages-panel__header">
        <h2 class="ws-messages-panel__title">Messages</h2>
      </header>
      <div class="ws-messages-panel__body">
        <tx-banner variant="info" [title]="emptyTitle()">
          {{ emptyMessage() }}
        </tx-banner>
      </div>
    </section>
  `,
  styleUrl: './ws-tab-messages-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WsTabMessagesPanelComponent {
  readonly connectionState = input<WsConnectionState>('idle');

  protected readonly emptyTitle = computed(() => {
    if (this.connectionState() === 'connected') {
      return 'No messages yet';
    }
    return 'Not connected';
  });

  protected readonly emptyMessage = computed(() => {
    if (this.connectionState() === 'connected') {
      return 'Connected — sent and received messages will appear here.';
    }
    return 'Connect to view sent and received WebSocket messages.';
  });
}
