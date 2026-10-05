import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { TxEmptyStateComponent, TxHintComponent } from '@testrix/ui';

import { ConfirmDialogService } from '../../core/confirm-dialog.service';
import { languageFromContentType } from '../workbench/request/code-editor-language';
import { CodeHighlightComponent } from '../workbench/request/code-highlight.component';
import { diffSideBySide } from '../workbench/request/response-diff';
import { WorkbenchStore } from '../workbench/workbench.store';
import {
  formatHistoryBody,
  formatHistoryHeaders,
  formatHistoryDateTime,
  historyContentType,
  historyFinishedAt,
  historyStatusTone,
  isHistoryBodyTruncated,
  parseHistoryQueryParams,
  shortHistoryId,
} from './history-display';
import { HistoryStore } from './history.store';

type CollapseKey =
  | 'request'
  | 'headers'
  | 'params'
  | 'requestBody'
  | 'response'
  | 'responseHeaders'
  | 'responseBody';

@Component({
  selector: 'tx-history-viewer',
  standalone: true,
  imports: [TxEmptyStateComponent, TxHintComponent, CodeHighlightComponent],
  templateUrl: './history-viewer.component.html',
  styleUrl: './history-viewer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryViewerComponent {
  private readonly history = inject(HistoryStore);
  private readonly workbench = inject(WorkbenchStore);
  private readonly confirm = inject(ConfirmDialogService);

  readonly entryId = input.required<string>();

  protected readonly copiedKey = signal<string | null>(null);
  protected readonly compareOpen = signal(false);
  protected readonly collapsed = signal<Record<CollapseKey, boolean>>({
    request: false,
    headers: false,
    params: true,
    requestBody: true,
    response: false,
    responseHeaders: true,
    responseBody: false,
  });

  protected readonly entry = computed(() => this.history.entryById(this.entryId()));
  protected readonly entryList = computed(() => {
    const entry = this.entry();
    return entry ? [entry] : [];
  });
  protected readonly missing = computed(() => !this.entry());

  protected readonly method = computed(() => this.entry()?.method ?? 'GET');
  protected readonly url = computed(() => this.entry()?.url ?? '');
  protected readonly requestName = computed(() => this.entry()?.requestName?.trim() ?? '');
  protected readonly statusTone = computed(() => {
    const entry = this.entry();
    return entry ? historyStatusTone(entry.status, entry.error) : 'err';
  });
  protected readonly statusCode = computed(() => {
    const entry = this.entry();
    if (!entry)
      return '—';
    if (entry.error?.trim() || entry.status < 0)
      return 'ERR';
    return String(entry.status);
  });
  protected readonly statusText = computed(() => {
    const entry = this.entry();
    if (!entry || entry.error?.trim() || entry.status < 0)
      return entry?.error?.trim() || 'Failed';
    return entry.statusText.trim() || 'OK';
  });
  protected readonly durationLabel = computed(() => {
    const ms = this.entry()?.durationMs ?? 0;
    return `${Math.max(0, Math.round(ms))} ms`;
  });
  protected readonly sizeLabel = computed(() => this.entry()?.sizeLabel || '0 B');
  protected readonly startedLabel = computed(() => formatHistoryDateTime(this.entry()?.at ?? ''));
  protected readonly finishedLabel = computed(() => {
    const entry = this.entry();
    if (!entry)
      return '—';
    return formatHistoryDateTime(historyFinishedAt(entry.at, entry.durationMs));
  });
  protected readonly shortId = computed(() => shortHistoryId(this.entryId()));
  protected readonly errorText = computed(() => this.entry()?.error?.trim() || null);
  protected readonly requestHeaders = computed(() => this.entry()?.requestHeaders ?? []);
  protected readonly responseHeaders = computed(() => this.entry()?.responseHeaders ?? []);
  protected readonly queryParams = computed(() => parseHistoryQueryParams(this.url()));
  protected readonly requestHeadersText = computed(() => formatHistoryHeaders(this.requestHeaders()));
  protected readonly responseHeadersText = computed(() => formatHistoryHeaders(this.responseHeaders()));
  protected readonly queryParamsText = computed(() => formatHistoryHeaders(this.queryParams()));
  protected readonly requestBody = computed(() => this.entry()?.requestBody ?? '');
  protected readonly responseBody = computed(() => this.entry()?.responseBody ?? '');
  protected readonly requestContentType = computed(() => historyContentType(this.requestHeaders()) ?? '');
  protected readonly contentType = computed(() => historyContentType(this.responseHeaders()));
  protected readonly requestBodyFormatted = computed(() =>
    formatHistoryBody(this.requestBody(), this.requestContentType()),
  );
  protected readonly responseBodyFormatted = computed(() =>
    formatHistoryBody(this.responseBody(), this.contentType() ?? ''),
  );
  protected readonly requestBodyLanguage = computed(() =>
    languageFromContentType(this.requestContentType(), this.requestBody()),
  );
  protected readonly responseBodyLanguage = computed(() =>
    languageFromContentType(this.contentType() ?? '', this.responseBody()),
  );
  protected readonly requestBodyTruncated = computed(() => isHistoryBodyTruncated(this.requestBody()));
  protected readonly responseBodyTruncated = computed(() => isHistoryBodyTruncated(this.responseBody()));

  protected readonly previousEntry = computed(() => {
    const entry = this.entry();
    if (!entry)
      return null;
    const siblings = this.history.entries().filter((item) => item.requestId === entry.requestId);
    const index = siblings.findIndex((item) => item.id === entry.id);
    if (index < 0 || index >= siblings.length - 1)
      return null;
    return siblings[index + 1] ?? null;
  });

  protected readonly canComparePrevious = computed(() => Boolean(this.previousEntry()));

  protected readonly compareRows = computed(() => {
    const prev = this.previousEntry();
    const entry = this.entry();
    if (!prev || !entry)
      return [];
    return diffSideBySide(prev.responseBody, entry.responseBody);
  });

  protected isCollapsed(key: CollapseKey): boolean {
    return this.collapsed()[key];
  }

  protected handleToggle(key: CollapseKey): void {
    this.collapsed.update((state) => ({ ...state, [key]: !state[key] }));
  }

  protected async handleCopy(content: string, key: string): Promise<void> {
    if (!content.trim())
      return;
    try {
      await navigator.clipboard.writeText(content);
      this.copiedKey.set(key);
      window.setTimeout(() => {
        if (this.copiedKey() === key)
          this.copiedKey.set(null);
      }, 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  protected handleCopyUrl(): void {
    void this.handleCopy(this.url(), 'url');
  }

  protected handleToggleCompare(): void {
    if (!this.canComparePrevious())
      return;
    this.compareOpen.update((open) => !open);
  }

  protected handleReplay(): void {
    const entry = this.entry();
    if (!entry)
      return;
    this.workbench.openEditableFromHistory(entry);
  }

  protected async handleDelete(): Promise<void> {
    const entry = this.entry();
    if (!entry)
      return;
    const ok = await this.confirm.ask({
      title: 'Delete history entry',
      body: 'Remove this snapshot from history? This cannot be undone.',
      confirmLabel: 'Delete',
    });
    if (!ok)
      return;
    await this.history.remove(entry.id);
    this.workbench.closeHistoryTabs([entry.id]);
  }
}
