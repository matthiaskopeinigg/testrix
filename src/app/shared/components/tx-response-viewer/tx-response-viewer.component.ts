import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

import type { RequestResponseTabId } from '@shared/config/request-runs-session.schema';
import type { HttpResponseSnapshot } from '@shared/http/outgoing-request.schema';
import type { ResponseDiffResult } from '@shared/http/response-diff';
import {
  detectResponseEditorLanguage,
  formatPrettyResponseBody,
  getResponseBodyText,
  previewKind,
} from '@shared/http/response-body-display';
import {
  buildResponseCopyPayload,
  copyTextToClipboard,
  RESPONSE_COPY_ACTIONS,
  type ResponseCopyActionId,
} from '@shared/http/response-clipboard';
import { parseSetCookieHeaders } from '@shared/http/response-cookies';
import type { TxCodeEditorLanguage } from '../tx-code-editor/tx-code-editor-language';

import { TxBannerComponent } from '../tx-banner/tx-banner.component';
import { TxButtonComponent } from '../tx-button/tx-button.component';
import { TxCodeEditorComponent } from '../tx-code-editor/tx-code-editor.component';
import { TxIconComponent } from '../tx-icon/tx-icon.component';
import { TxResponseDiffPanelComponent } from '../tx-response-diff-panel/tx-response-diff-panel.component';
import { TxResponseHeadersListComponent } from '../tx-response-headers-list/tx-response-headers-list.component';
import { TxResponseRedirectsPanelComponent } from '../tx-response-redirects-panel/tx-response-redirects-panel.component';
import { TxResponseRunsPanelComponent } from '../tx-response-runs-panel/tx-response-runs-panel.component';
import { TxResponseStatusStripComponent } from '../tx-response-status-strip/tx-response-status-strip.component';
import { TxResponseTabBarComponent, type TxResponseTabItem } from '../tx-response-tab-bar/tx-response-tab-bar.component';
import { TxResponseTimingPanelComponent } from '../tx-response-timing-panel/tx-response-timing-panel.component';
import { TxSpinnerComponent } from '../tx-spinner/tx-spinner.component';

@Component({
  selector: 'tx-response-viewer',
  standalone: true,
  imports: [
    TxBannerComponent,
    TxButtonComponent,
    TxCodeEditorComponent,
    TxIconComponent,
    TxResponseDiffPanelComponent,
    TxResponseHeadersListComponent,
    TxResponseRedirectsPanelComponent,
    TxResponseRunsPanelComponent,
    TxResponseStatusStripComponent,
    TxResponseTabBarComponent,
    TxResponseTimingPanelComponent,
    TxSpinnerComponent,
  ],
  templateUrl: './tx-response-viewer.component.html',
  styleUrl: './tx-response-viewer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxResponseViewerComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly snapshot = input<HttpResponseSnapshot | null>(null);
  readonly runs = input<readonly HttpResponseSnapshot[]>([]);
  readonly inFlight = input(false);
  readonly diff = input<ResponseDiffResult | null>(null);
  readonly activeTab = input<RequestResponseTabId>('body');
  readonly selectedRunId = input<string | null>(null);
  readonly pinnedBaselineId = input<string | null>(null);
  readonly compareBaselineId = input<string | null>(null);

  readonly activeTabChange = output<RequestResponseTabId>();
  readonly runSelect = output<string>();
  readonly compareRuns = output<{ readonly a: string; readonly b: string }>();
  readonly refreshDiff = output<void>();
  readonly saveExample = output<void>();
  readonly saveSnapshot = output<void>();
  readonly pinBaseline = output<string>();

  protected readonly copyMenuOpen = signal(false);
  protected readonly copyFlash = signal<ResponseCopyActionId | null>(null);
  protected readonly moreMenuOpen = signal(false);

  protected readonly copyActions = RESPONSE_COPY_ACTIONS;

  protected readonly canSaveToRequest = computed(
    () => !!this.snapshot() && !this.inFlight(),
  );

  protected readonly prettyBody = computed(() => formatPrettyResponseBody(this.snapshot()));

  protected readonly editorLanguage = computed(
    (): TxCodeEditorLanguage => detectResponseEditorLanguage(this.snapshot()) as TxCodeEditorLanguage,
  );

  protected readonly rawBody = computed(() => {
    const snap = this.snapshot();
    if (!snap) {
      return '';
    }
    const statusLine = `HTTP/1.1 ${snap.status.code} ${snap.status.text}`;
    const headerLines = snap.headers.map((h) => `${h.key}: ${h.value}`).join('\n');
    return `${statusLine}\n${headerLines}\n\n${getResponseBodyText(snap)}`;
  });

  protected readonly showPreviewTab = computed(() => previewKind(this.snapshot()) !== 'none');

  protected readonly cookies = computed(() => parseSetCookieHeaders(this.snapshot()?.headers ?? []));

  protected readonly previewHtml = computed(() => {
    const snap = this.snapshot();
    if (!snap || previewKind(snap) !== 'html') {
      return null;
    }
    return this.sanitizer.bypassSecurityTrustHtml(getResponseBodyText(snap));
  });

  protected readonly previewImageSrc = computed(() => {
    const snap = this.snapshot();
    if (!snap || previewKind(snap) !== 'image' || !snap.body.base64) {
      return null;
    }
    const ct = snap.body.contentType ?? 'image/png';
    return this.sanitizer.bypassSecurityTrustResourceUrl(`data:${ct};base64,${snap.body.base64}`);
  });

  protected readonly responseTabs = computed((): readonly TxResponseTabItem[] => {
    const snap = this.snapshot();
    const headerCount = snap?.headers.length ?? 0;
    const cookieCount = this.cookies().length;
    const redirectCount = snap?.redirects?.length ?? 0;
    const runCount = this.runs().length;
    return [
      { id: 'body', label: 'Pretty' },
      { id: 'raw', label: 'Raw' },
      { id: 'preview', label: 'Preview', visible: this.showPreviewTab() },
      { id: 'headers', label: 'Headers', badge: headerCount },
      { id: 'cookies', label: 'Cookies', badge: cookieCount, visible: cookieCount > 0 },
      { id: 'timeline', label: 'Timeline' },
      { id: 'redirects', label: 'Redirects', badge: redirectCount, visible: redirectCount > 0 },
      { id: 'diff', label: 'Diff' },
      { id: 'snapshots', label: 'Runs', badge: runCount, visible: runCount > 0 },
    ];
  });

  protected handleTabChange(tab: RequestResponseTabId): void {
    this.activeTabChange.emit(tab);
  }

  protected handleRunSelect(id: string): void {
    this.runSelect.emit(id);
  }

  protected handleCompareAgainst(baselineId: string): void {
    const current = this.selectedRunId();
    if (current && baselineId) {
      this.compareRuns.emit({ a: baselineId, b: current });
    }
  }

  protected handleCompareRuns(event: { readonly a: string; readonly b: string }): void {
    this.compareRuns.emit(event);
    this.activeTabChange.emit('diff');
  }

  protected handlePinRun(id: string): void {
    this.pinBaseline.emit(id);
  }

  protected handleToggleCopyMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.copyMenuOpen.update((v) => !v);
    this.moreMenuOpen.set(false);
  }

  protected handleToggleMoreMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.moreMenuOpen.update((v) => !v);
    this.copyMenuOpen.set(false);
  }

  protected async handleCopyAction(id: ResponseCopyActionId): Promise<void> {
    const snap = this.snapshot();
    if (!snap) {
      return;
    }
    const payload = buildResponseCopyPayload(
      id,
      snap,
      snap.requestSummary.url,
      snap.requestSummary.method,
    );
    const ok = await copyTextToClipboard(payload);
    if (ok) {
      this.copyFlash.set(id);
      setTimeout(() => this.copyFlash.set(null), 1200);
    }
    this.copyMenuOpen.set(false);
  }

  protected handleSaveBody(): void {
    const snap = this.snapshot();
    if (!snap) {
      return;
    }
    const text = getResponseBodyText(snap);
    const blob = new Blob([text], { type: snap.body.contentType ?? 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `response-${snap.status.code}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  protected handleSaveExample(): void {
    if (!this.canSaveToRequest()) {
      return;
    }
    this.saveExample.emit();
    this.closeMenus();
  }

  protected handleSaveSnapshot(): void {
    if (!this.canSaveToRequest()) {
      return;
    }
    this.saveSnapshot.emit();
    this.closeMenus();
  }

  protected closeMenus(): void {
    this.copyMenuOpen.set(false);
    this.moreMenuOpen.set(false);
  }
}
