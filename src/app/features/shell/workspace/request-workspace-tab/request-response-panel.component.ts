import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  resolveRequestRunSession,
  type RequestResponseTabId,
} from '@shared/config/request-runs-session.schema';

import { ConfigService } from '@app/core/config/config.service';
import { HttpRequestService } from '@app/core/http/http-request.service';
import { TxNotificationService } from '@app/core/notifications/tx-notification.service';
import { TxButtonComponent } from '@app/shared/components/forms/tx-button/tx-button.component';
import { TxFormFieldComponent } from '@app/shared/components/forms/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/forms/tx-input/tx-input.component';
import { TxPromptDialogComponent } from '@app/shared/components/overlays/tx-prompt-dialog/tx-prompt-dialog.component';
import { TxResponseViewerComponent } from '@app/shared/components/editors/tx-response-viewer/tx-response-viewer.component';

@Component({
  selector: 'app-request-response-panel',
  standalone: true,
  imports: [
    FormsModule,
    TxPromptDialogComponent,
    TxResponseViewerComponent,
    TxButtonComponent,
    TxFormFieldComponent,
    TxInputComponent,
  ],
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

    @if (http.selectedSnapshot()?.body?.text) {
      <div class="request-response-panel__capture">
        <tx-form-field label="JSONPath" controlId="response-jsonpath">
          <tx-input
            id="response-jsonpath"
            [ngModel]="jsonPath()"
            (ngModelChange)="jsonPath.set($event)"
            placeholder="$.data.id"
          />
        </tx-form-field>
        <tx-form-field label="Environment variable" controlId="response-env-key">
          <tx-input
            id="response-env-key"
            [ngModel]="variableKey()"
            (ngModelChange)="variableKey.set($event)"
            placeholder="lastId"
          />
        </tx-form-field>
        <tx-button variant="secondary" (pressed)="handleCaptureJsonPath()">Set env var</tx-button>
      </div>
    }

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
  private readonly notifications = inject(TxNotificationService);
  protected readonly http = inject(HttpRequestService);

  readonly requestId = input.required<string>();

  protected readonly namePromptOpen = signal(false);
  protected readonly jsonPath = signal('$.');
  protected readonly variableKey = signal('lastValue');

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

  protected handleCaptureJsonPath(): void {
    const ok = this.http.captureJsonPathToEnvironment(
      this.requestId(),
      this.jsonPath(),
      this.variableKey(),
    );
    if (ok) {
      this.notifications.showSuccess(`Saved ${this.variableKey()} from JSONPath`);
    }
  }
}
