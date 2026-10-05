import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { historyStatusClass, type FlowRunEventDetail } from '@testrix/contracts';
import { TxHintComponent } from '@testrix/ui';

import {
  detectBodyKind,
  formatHistoryBody,
  historyStatusTone,
  parseHistoryQueryParams,
  type HistoryBodyKind,
  type HistoryStatusTone,
} from '../../history/history-display';
import { languageFromContentType, type CodeEditorLanguage } from '../../workbench/request/code-editor-language';
import { CodeHighlightComponent } from '../../workbench/request/code-highlight.component';

type ExchangeSection = 'req-headers' | 'req-body' | 'res-headers' | 'res-body';

@Component({
  selector: 'tx-flow-run-exchange',
  standalone: true,
  imports: [TxHintComponent, CodeHighlightComponent],
  templateUrl: './flow-run-exchange.component.html',
  styleUrl: './flow-run-exchange.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlowRunExchangeComponent {
  readonly detail = input.required<FlowRunEventDetail>();
  readonly title = input('HTTP exchange');
  /** When set (e.g. overlay labelledBy), attaches an id to the heading. */
  readonly headingId = input('flow-exchange-title');

  readonly copiedKey = signal<string | null>(null);
  readonly collapsed = signal<ReadonlySet<string>>(new Set());
  private copyTimer: ReturnType<typeof setTimeout> | null = null;
  private didInitCollapse = false;

  constructor() {
    effect(() => {
      this.detail();
      if (this.didInitCollapse)
        return;
      this.didInitCollapse = true;
      const closed = new Set<string>();
      if (this.requestHeaders().length === 0)
        closed.add('req-headers');
      if (!this.requestBodyFormatted())
        closed.add('req-body');
      if (this.responseHeaders().length === 0)
        closed.add('res-headers');
      // Prefer body open when present; collapse empty headers by default when body exists.
      if (this.responseBodyFormatted() && this.responseHeaders().length > 0)
        closed.add('res-headers');
      this.collapsed.set(closed);
    });
  }

  readonly statusTone = computed((): HistoryStatusTone => {
    const status = this.detail().status ?? 0;
    return historyStatusTone(status, null);
  });

  readonly statusLabel = computed(() => {
    const status = this.detail().status;
    if (status === undefined)
      return '';
    const cls = historyStatusClass(status, null);
    if (cls === 'ok')
      return 'OK';
    if (cls === 'redirect')
      return 'Redirect';
    if (cls === 'client')
      return 'Client error';
    if (cls === 'server')
      return 'Server error';
    return 'Error';
  });

  readonly requestHeaders = computed(() => this.headerEntries(this.detail().requestHeaders));
  readonly responseHeaders = computed(() => this.headerEntries(this.detail().headers));

  readonly queryParams = computed(() => parseHistoryQueryParams(this.detail().url ?? ''));

  readonly contentTypeLabel = computed(() => {
    const ct = this.contentType(this.detail().headers);
    if (!ct)
      return '';
    const semi = ct.indexOf(';');
    return semi >= 0 ? ct.slice(0, semi).trim() : ct.trim();
  });

  readonly requestBodyKind = computed((): HistoryBodyKind => {
    const ct = this.contentType(this.detail().requestHeaders);
    return detectBodyKind(this.detail().requestBody ?? '', ct);
  });

  readonly responseBodyKind = computed((): HistoryBodyKind => {
    const ct = this.contentType(this.detail().headers);
    return detectBodyKind(this.detail().body ?? '', ct);
  });

  readonly requestBodyFormatted = computed(() =>
    formatHistoryBody(this.detail().requestBody ?? '', this.contentType(this.detail().requestHeaders)),
  );

  readonly responseBodyFormatted = computed(() =>
    formatHistoryBody(this.detail().body ?? '', this.contentType(this.detail().headers)),
  );

  readonly requestBodyLanguage = computed((): CodeEditorLanguage =>
    languageFromContentType(this.contentType(this.detail().requestHeaders), this.detail().requestBody ?? ''),
  );

  readonly responseBodyLanguage = computed((): CodeEditorLanguage =>
    languageFromContentType(this.contentType(this.detail().headers), this.detail().body ?? ''),
  );

  /** True when any request payload was captured. */
  readonly hasRequest = computed(
    () => this.requestHeaders().length > 0 || !!this.requestBodyFormatted(),
  );

  /** True when any response payload was captured. */
  readonly hasResponse = computed(
    () =>
      this.responseHeaders().length > 0
      || !!this.responseBodyFormatted()
      || this.detail().status !== undefined,
  );

  readonly requestMeta = computed(() => {
    const headers = this.requestHeaders().length;
    const body = this.requestBodyFormatted() ? this.bodyKindLabel(this.requestBodyKind()) : 'empty';
    return `${headers} header${headers === 1 ? '' : 's'} · ${body}`;
  });

  readonly responseMeta = computed(() => {
    const headers = this.responseHeaders().length;
    const body = this.responseBodyFormatted() ? this.bodyKindLabel(this.responseBodyKind()) : 'empty';
    return `${headers} header${headers === 1 ? '' : 's'} · ${body}`;
  });

  headerEntries(
    headers: Readonly<Record<string, string>> | undefined,
  ): readonly { key: string; value: string }[] {
    if (!headers)
      return [];
    return Object.entries(headers)
      .map(([key, value]) => ({ key, value }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  bodyKindLabel(kind: HistoryBodyKind): string {
    if (kind === 'json')
      return 'JSON';
    if (kind === 'xml')
      return 'XML';
    return 'Text';
  }

  isCollapsed(section: ExchangeSection): boolean {
    return this.collapsed().has(section);
  }

  handleToggle(section: ExchangeSection): void {
    const next = new Set(this.collapsed());
    if (next.has(section))
      next.delete(section);
    else
      next.add(section);
    this.collapsed.set(next);
  }

  async handleCopy(key: string, value: string): Promise<void> {
    if (!value.trim())
      return;
    try {
      await navigator.clipboard.writeText(value);
      this.copiedKey.set(key);
      if (this.copyTimer)
        clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copiedKey.set(null), 1200);
    } catch {
      /* clipboard may be denied */
    }
  }

  private contentType(headers: Readonly<Record<string, string>> | undefined): string {
    if (!headers)
      return '';
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === 'content-type')
        return value;
    }
    return '';
  }
}
