import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';

import {
  resolveRequestRunSession,
  type RequestResponseTabId,
} from '@shared/config/request-runs-session.schema';

import { ConfigService } from '@app/core/config/config.service';
import { HttpRequestService } from '@app/core/http/http-request.service';
import { TxPromptDialogComponent } from '@app/shared/components/tx-prompt-dialog/tx-prompt-dialog.component';
import { TxResponseViewerComponent } from '@app/shared/components/tx-response-viewer/tx-response-viewer.component';

@Component({
  selector: 'app-request-response-panel',
  standalone: true,
  imports: [TxPromptDialogComponent, TxResponseViewerComponent],
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
      (refreshDiff)="handleRefreshDiff()"
      (pinBaseline)="handlePinBaseline($event)"
    />

    <tx-prompt-dialog
      [open]="namePromptOpen()"
      title="Save as example"
      label="Example name"
      defaultValue="Example"
      confirmLabel="Save example"
      (submitted)="handleNamePromptSubmitted($event)"
      (closed)="handleNamePromptClosed()"
    />
  `,
  styleUrl: './request-response-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequestResponsePanelComponent {
  private readonly configService = inject(ConfigService);
  protected readonly http = inject(HttpRequestService);

  readonly requestId = input.required<string>();

  protected readonly namePromptOpen = signal(false);

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
    this.namePromptOpen.set(true);
  }

  protected handleNamePromptSubmitted(name: string): void {
    this.namePromptOpen.set(false);
    this.http.saveExample(this.requestId(), name);
  }

  protected handleNamePromptClosed(): void {
    this.namePromptOpen.set(false);
  }

  protected handleRefreshDiff(): void {
    this.http.refreshDiff();
  }

  protected handlePinBaseline(snapshotId: string): void {
    this.http.pinBaseline(snapshotId);
  }
}
