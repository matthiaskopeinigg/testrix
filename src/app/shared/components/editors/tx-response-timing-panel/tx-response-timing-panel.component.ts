import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { formatRedirectTarget } from '@shared/http/format-redirect-target';
import type { HttpResponseSnapshot } from '@shared/http/outgoing-request.schema';

type PhaseId = 'dns' | 'connect' | 'tls' | 'ttfb' | 'download' | 'redirect' | 'other';

interface PhaseBar {
  readonly id: PhaseId;
  readonly label: string;
  readonly ms: number;
  readonly widthPct: number;
}

interface RedirectBar {
  readonly label: string;
  readonly ms: number;
  readonly widthPct: number;
  readonly statusCode: number;
}

const PHASE_DEFINITIONS: readonly {
  readonly id: PhaseId;
  readonly label: string;
  readonly field: 'dnsMs' | 'connectMs' | 'tlsMs' | 'ttfbMs' | 'downloadMs';
}[] = [
  { id: 'dns', label: 'DNS lookup', field: 'dnsMs' },
  { id: 'connect', label: 'TCP connect', field: 'connectMs' },
  { id: 'tls', label: 'TLS handshake', field: 'tlsMs' },
  { id: 'ttfb', label: 'Waiting (TTFB)', field: 'ttfbMs' },
  { id: 'download', label: 'Content download', field: 'downloadMs' },
];

@Component({
  selector: 'tx-response-timing-panel',
  standalone: true,
  templateUrl: './tx-response-timing-panel.component.html',
  styleUrl: './tx-response-timing-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxResponseTimingPanelComponent {
  readonly snapshot = input<HttpResponseSnapshot | null>(null);

  protected readonly totalMs = computed(() => this.snapshot()?.timing.totalMs ?? 0);

  protected readonly phases = computed((): readonly PhaseBar[] => {
    const snap = this.snapshot();
    if (!snap) {
      return [];
    }
    const t = snap.timing;
    const total = Math.max(t.totalMs, 1);
    let consumed = 0;
    const phases: PhaseBar[] = [];

    for (const def of PHASE_DEFINITIONS) {
      const raw = t[def.field];
      const ms = typeof raw === 'number' && raw >= 0 ? raw : 0;
      consumed += ms;
      if (ms > 0) {
        phases.push({
          id: def.id,
          label: def.label,
          ms,
          widthPct: (ms / total) * 100,
        });
      }
    }

    let remainder = Math.max(0, t.totalMs - consumed);
    const redirectMs = (snap.redirects ?? []).reduce((sum, hop) => sum + hop.timeMs, 0);
    if (redirectMs > 0.5) {
      const ms = Math.min(redirectMs, remainder);
      phases.push({
        id: 'redirect',
        label: 'Redirects',
        ms,
        widthPct: (ms / total) * 100,
      });
      remainder -= ms;
    }
    if (remainder > 0.5) {
      phases.push({
        id: 'other',
        label: 'Other',
        ms: remainder,
        widthPct: (remainder / total) * 100,
      });
    }

    if (phases.length === 0 && t.totalMs > 0) {
      phases.push({
        id: 'other',
        label: 'Total',
        ms: t.totalMs,
        widthPct: 100,
      });
    }

    return phases;
  });

  protected readonly redirectBars = computed((): readonly RedirectBar[] => {
    const snap = this.snapshot();
    if (!snap?.redirects?.length) {
      return [];
    }
    const total = Math.max(snap.timing.totalMs, 1);
    return snap.redirects.map((r) => ({
      label: `${r.statusCode} → ${formatRedirectTarget(r.to)}`,
      ms: r.timeMs,
      widthPct: Math.max(4, (r.timeMs / total) * 100),
      statusCode: r.statusCode,
    }));
  });

  protected readonly hasTiming = computed(() => {
    const snap = this.snapshot();
    return !!snap && snap.timing.totalMs > 0;
  });
}
