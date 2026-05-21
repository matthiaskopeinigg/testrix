import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import {
  resolveRequestRunSession,
  type RequestResponseTabId,
} from '@shared/config/request-runs-session.schema';

import { ConfigService } from '@app/core/config/config.service';
import { HttpRequestService } from '@app/core/http/http-request.service';
import { TxResponseViewerComponent } from '@app/shared/components/tx-response-viewer/tx-response-viewer.component';

@Component({
  selector: 'app-request-response-panel',
  standalone: true,
  imports: [TxResponseViewerComponent],
  template: `
    <tx-response-viewer
      [snapshot]="http.selectedSnapshot()"
      [runs]="http.runs()"
      [inFlight]="http.inFlight()"
      [diff]="http.lastDiff()"
      [activeTab]="activeTab()"
      [selectedRunId]="selectedRunId()"
      [pinnedBaselineId]="http.pinnedBaselineId()"
      [compareBaselineId]="compareBaselineId()"
      (activeTabChange)="handleTabChange($event)"
      (runSelect)="http.selectRun($event)"
      (compareRuns)="handleCompareRuns($event)"
      (saveExample)="handleSaveExample()"
      (saveSnapshot)="handleSaveSnapshot()"
      (refreshDiff)="handleRefreshDiff()"
      (pinBaseline)="handlePinBaseline($event)"
    />
  `,
  styleUrl: './request-response-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequestResponsePanelComponent {
  private readonly configService = inject(ConfigService);
  protected readonly http = inject(HttpRequestService);

  readonly requestId = input.required<string>();

  protected readonly activeTab = computed((): RequestResponseTabId => {
    const session = this.configService.session();
    if (!session) {
      return 'body';
    }
    return resolveRequestRunSession(
      session.workspace.collections.requestRunsById,
      this.requestId(),
    ).activeResponseTab;
  });

  protected readonly selectedRunId = computed(
    () => this.http.selectedSnapshot()?.id ?? null,
  );

  protected readonly compareBaselineId = computed(() => {
    const session = this.configService.session();
    if (!session) {
      return null;
    }
    return (
      resolveRequestRunSession(session.workspace.collections.requestRunsById, this.requestId())
        .compareSelection?.a ?? null
    );
  });

  protected handleTabChange(tab: RequestResponseTabId): void {
    void this.http.setActiveResponseTab(this.requestId(), tab);
  }

  protected handleCompareRuns(event: { readonly a: string; readonly b: string }): void {
    this.http.compareRuns(event.a, event.b);
    void this.http.setActiveResponseTab(this.requestId(), 'diff');
  }

  protected handleSaveExample(): void {
    const name = globalThis.prompt?.('Example name', 'Example') ?? 'Example';
    if (name === null) {
      return;
    }
    this.http.saveExample(this.requestId(), name);
  }

  protected handleSaveSnapshot(): void {
    const name = globalThis.prompt?.('Snapshot name', 'Snapshot') ?? 'Snapshot';
    if (name === null) {
      return;
    }
    this.http.saveSnapshot(this.requestId(), name);
  }

  protected handleRefreshDiff(): void {
    this.http.refreshDiff();
  }

  protected handlePinBaseline(snapshotId: string): void {
    this.http.pinBaseline(snapshotId);
  }
}
