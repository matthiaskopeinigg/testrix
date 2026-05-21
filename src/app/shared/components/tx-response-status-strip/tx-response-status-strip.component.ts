import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';

import type { HttpResponseSnapshot } from '@shared/http/outgoing-request.schema';
import { describeStatus } from '@shared/http/status-code-info';

import { TxButtonComponent } from '../tx-button/tx-button.component';
import { TxSpinnerComponent } from '../tx-spinner/tx-spinner.component';
import { TxTagComponent } from '../tx-tag/tx-tag.component';

@Component({
  selector: 'tx-response-status-strip',
  standalone: true,
  imports: [TxButtonComponent, TxSpinnerComponent, TxTagComponent],
  template: `
    <div class="tx-response-status-strip">
      <span class="tx-response-status-strip__label">{{ label() }}</span>
      @if (inFlight()) {
        <tx-spinner size="sm" ariaLabel="Sending request" />
        <tx-tag variant="info" casing="normal">Sending…</tx-tag>
      } @else if (snapshot(); as snap) {
        <div class="tx-response-status-strip__status-anchor">
          <span class="tx-response-status-strip__status-pill" [attr.data-kind]="statusKind(snap.status.code)">
            <span class="tx-response-status-strip__dot" aria-hidden="true"></span>
            <span class="tx-response-status-strip__code">{{ snap.status.code }}</span>
            @if (snap.status.text) {
              <span class="tx-response-status-strip__text">{{ snap.status.text }}</span>
            }
          </span>
          <tx-button
            variant="secondary"
            class="tx-response-status-strip__info-btn"
            title="What does this status mean?"
            aria-label="Status code information"
            (pressed)="handleToggleStatusPopover($event)"
          >
            ?
          </tx-button>
          @if (statusPopoverOpen()) {
            <div class="tx-response-status-strip__popover" role="dialog">
              <div class="tx-response-status-strip__popover-header">
                <strong>{{ snap.status.code }} {{ statusInfo().title }}</strong>
                <tx-button
                  variant="secondary"
                  aria-label="Dismiss"
                  (pressed)="statusPopoverOpen.set(false)"
                >
                  ×
                </tx-button>
              </div>
              <p class="tx-response-status-strip__popover-body">{{ statusInfo().description }}</p>
              @if (statusInfo().mdnUrl) {
                <a
                  class="tx-response-status-strip__popover-link"
                  [href]="statusInfo().mdnUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open MDN reference ↗
                </a>
              }
            </div>
          }
        </div>
        <span class="tx-response-status-strip__metric" title="Total wall clock">
          <tx-tag variant="info" casing="normal">{{ snap.timing.totalMs }} ms</tx-tag>
        </span>
        <span class="tx-response-status-strip__metric" title="Decoded body size">
          <tx-tag variant="default" casing="normal">{{ formatBytes(snap.size.bodyBytes) }}</tx-tag>
        </span>
        @if (snap.body.contentType) {
          <span
            class="tx-response-status-strip__metric tx-response-status-strip__metric--type"
            [title]="snap.body.contentType"
          >
            <tx-tag variant="default" casing="normal">
              {{ truncateContentType(snap.body.contentType) }}
            </tx-tag>
          </span>
        }
        <span class="tx-response-status-strip__metric" title="HTTP protocol version">
          <tx-tag variant="default" casing="normal">HTTP/1.1</tx-tag>
        </span>
      }
      <span class="tx-response-status-strip__spacer"></span>
      <div class="tx-response-status-strip__actions">
        <ng-content select="[txResponseActions]" />
      </div>
    </div>
  `,
  styleUrl: './tx-response-status-strip.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxResponseStatusStripComponent {
  readonly label = input('Response');
  readonly snapshot = input<HttpResponseSnapshot | null>(null);
  readonly inFlight = input(false);

  protected readonly statusPopoverOpen = signal(false);

  protected statusInfo() {
    const snap = this.snapshot();
    if (!snap) {
      return describeStatus(0);
    }
    return describeStatus(snap.status.code);
  }

  protected statusKind(code: number): 'success' | 'warning' | 'error' | 'info' {
    if (code === 0) {
      return 'error';
    }
    if (code >= 200 && code < 300) {
      return 'success';
    }
    if (code >= 400) {
      return 'error';
    }
    if (code >= 300) {
      return 'warning';
    }
    return 'info';
  }

  protected formatBytes(n: number): string {
    if (n < 1024) {
      return `${n} B`;
    }
    if (n < 1024 * 1024) {
      return `${(n / 1024).toFixed(1)} KB`;
    }
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  protected truncateContentType(ct: string): string {
    const semi = ct.indexOf(';');
    const base = semi >= 0 ? ct.slice(0, semi) : ct;
    return base.length > 28 ? `${base.slice(0, 25)}…` : base;
  }

  protected handleToggleStatusPopover(event: MouseEvent): void {
    event.stopPropagation();
    this.statusPopoverOpen.update((v) => !v);
  }
}
