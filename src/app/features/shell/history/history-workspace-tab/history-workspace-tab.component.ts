import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';

import { formatHttpBodyForPreview } from '@shared/http/http-body-editor-language';
import type { HttpResponseHeader } from '@shared/http/outgoing-request.schema';
import type { HttpResponseSnapshot } from '@shared/http/outgoing-request.schema';

import { HistoryService } from '@app/core/history/history.service';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxBannerComponent } from '@app/shared/components/tx-banner/tx-banner.component';

import {
  formatHistoryBodyPreview,
  formatHistoryByteSize,
  historyStatusTone,
} from '../history-entry-display';

type CollapseKey =
  | 'request'
  | 'headers'
  | 'params'
  | 'requestBody'
  | 'response'
  | 'responseHeaders'
  | 'responseBody';

@Component({
  selector: 'app-history-workspace-tab',
  standalone: true,
  imports: [DatePipe, TxButtonComponent, TxIconComponent, TxBannerComponent],
  templateUrl: './history-workspace-tab.component.html',
  styleUrl: './history-workspace-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryWorkspaceTabComponent {
  private readonly historyService = inject(HistoryService);

  readonly resourceId = input.required<string>();
  readonly active = input(false);

  protected readonly copiedKey = signal<string | null>(null);
  protected readonly collapsed = signal<Record<CollapseKey, boolean>>({
    request: false,
    headers: false,
    params: false,
    requestBody: false,
    response: false,
    responseHeaders: false,
    responseBody: false,
  });

  protected readonly item = computed(() => this.historyService.getItem(this.resourceId()));
  protected readonly snapshot = computed(() => {
    const entry = this.item();
    return entry ? this.historyService.resolveSnapshot(entry) : null;
  });
  protected readonly requestCapture = computed(() => this.item()?.request ?? null);
  protected readonly missing = computed(() => !this.item());

  protected readonly method = computed(
    () => this.snapshot()?.requestSummary.method ?? this.item()?.method ?? 'GET',
  );
  protected readonly url = computed(
    () => this.snapshot()?.requestSummary.url ?? this.item()?.url ?? '',
  );
  protected readonly statusCode = computed(() => this.snapshot()?.status.code);
  protected readonly statusText = computed(() => this.snapshot()?.status.text ?? '');
  protected readonly statusTone = computed(() => historyStatusTone(this.statusCode()));
  protected readonly durationMs = computed(() => this.snapshot()?.timing.totalMs ?? 0);
  protected readonly bodySizeLabel = computed(() => {
    const snap = this.snapshot();
    if (!snap) {
      return '0 B';
    }
    return formatHistoryByteSize(snap.size.bodyBytes);
  });
  protected readonly startedAt = computed(() => this.item()?.requestedAt ?? '');
  protected readonly finishedAt = computed(() => this.snapshot()?.capturedAt ?? '');
  protected readonly requestHeaders = computed(() => this.requestCapture()?.headers ?? []);
  protected readonly queryParams = computed(() => this.requestCapture()?.queryParams ?? []);
  protected readonly requestBody = computed(() => this.requestCapture()?.body ?? '');
  protected readonly responseHeaders = computed(() => this.snapshot()?.headers ?? []);
  protected readonly responseBody = computed(() => formatHistoryBodyPreview(this.snapshot()));

  protected handleToggleSection(key: CollapseKey): void {
    this.collapsed.update((state) => ({ ...state, [key]: !state[key] }));
  }

  protected isCollapsed(key: CollapseKey): boolean {
    return this.collapsed()[key];
  }

  protected async handleCopy(content: string, key: string): Promise<void> {
    if (!content.trim()) {
      return;
    }
    try {
      await navigator.clipboard.writeText(content);
      this.copiedKey.set(key);
      setTimeout(() => {
        if (this.copiedKey() === key) {
          this.copiedKey.set(null);
        }
      }, 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  protected formatRequestBody(body: string): string {
    if (!body) {
      return '';
    }
    try {
      return formatHttpBodyForPreview(body, 'json', false);
    } catch {
      return body;
    }
  }

}
