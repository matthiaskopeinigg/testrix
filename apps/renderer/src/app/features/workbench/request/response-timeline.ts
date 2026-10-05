import type { HttpTiming } from '@testrix/contracts';

export interface TimelinePhase {
  readonly id: keyof Pick<HttpTiming, 'dnsMs' | 'tcpMs' | 'tlsMs' | 'ttfbMs' | 'downloadMs' | 'redirectsMs' | 'otherMs'>;
  readonly label: string;
  readonly tone: string;
}

export const TIMELINE_PHASES: readonly TimelinePhase[] = [
  { id: 'dnsMs', label: 'DNS lookup', tone: 'dns' },
  { id: 'tcpMs', label: 'TCP connect', tone: 'tcp' },
  { id: 'tlsMs', label: 'TLS handshake', tone: 'tls' },
  { id: 'ttfbMs', label: 'Waiting (TTFB)', tone: 'wait' },
  { id: 'downloadMs', label: 'Content download', tone: 'download' },
  { id: 'redirectsMs', label: 'Redirects', tone: 'redirect' },
  { id: 'otherMs', label: 'Other', tone: 'other' },
];

export function timelineShare(ms: number, totalMs: number): number {
  if (totalMs <= 0 || ms <= 0)
    return 0;
  return Math.max(2, Math.round((ms / totalMs) * 100));
}
