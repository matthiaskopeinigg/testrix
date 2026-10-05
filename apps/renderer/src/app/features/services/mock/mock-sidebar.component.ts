import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { TxCheckComponent, TxHintComponent, TxInputComponent } from '@testrix/ui';

import { DesktopApiService } from '../../../core/desktop-api.service';
import { ServicesStore } from '../services.store';
import { ServiceListPaneComponent } from '../shared/service-list-pane.component';
import type { ServiceTreeNode } from '@testrix/contracts';

@Component({
  selector: 'tx-mock-sidebar',
  standalone: true,
  imports: [
    TxCheckComponent,
    TxHintComponent,
    TxInputComponent,
    ServiceListPaneComponent,
  ],
  templateUrl: './mock-sidebar.component.html',
  styleUrl: './mock-sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display:flex;flex:1;flex-direction:column;min-height:0;' },
})
export class MockSidebarComponent {
  readonly store = inject(ServicesStore);
  private readonly desktop = inject(DesktopApiService);

  readonly renamingId = input<string | null>(null);
  readonly emptyMenu = output<MouseEvent>();
  readonly menu = output<{
    readonly node: ServiceTreeNode<Record<string, unknown>>;
    readonly event: MouseEvent;
  }>();
  readonly rename = output<{ readonly id: string; readonly name: string }>();
  readonly renameDone = output<void>();

  readonly optionsOpen = signal(false);
  readonly options = computed(() => this.desktop.mocks().options);
  readonly isRunning = computed(() => this.store.mockStatus().running);
  readonly statusLabel = computed(() => this.store.mockStatus().label);
  readonly statusError = computed(() => this.store.mockStatus().error);

  toggleOptions(): void {
    this.optionsOpen.update((open) => !open);
  }

  startServer(): void {
    void this.store.startMocks();
  }

  stopServer(): void {
    void this.store.stopMocks();
  }

  patchHost(host: string): void {
    void this.store.patchMocksOptions({ host });
  }

  patchPort(raw: string | number): void {
    const port = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(port))
      return;
    void this.store.patchMocksOptions({ port: Math.max(1, Math.min(65535, Math.floor(port))) });
  }

  patchDelay(raw: string | number): void {
    const delayMs = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(delayMs))
      return;
    void this.store.patchMocksOptions({ delayMs: Math.max(0, Math.floor(delayMs)) });
  }

  patchCors(cors: boolean): void {
    void this.store.patchMocksOptions({ cors });
  }

  patchAutoStart(autoStartOnLaunch: boolean): void {
    void this.store.patchMocksOptions({ autoStartOnLaunch });
  }
}
