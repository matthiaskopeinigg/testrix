/**
 * Monotonic timestamps collected during a single HTTP connection (final hop when redirects occur).
 */
export interface HttpTimingMarkers {
  readonly startedAt: number;
  readonly dnsAt?: number;
  readonly connectAt?: number;
  readonly secureAt?: number;
  readonly ttfbAt?: number;
  readonly endedAt?: number;
}

export interface HttpResponseTimingPhases {
  readonly totalMs: number;
  readonly dnsMs?: number;
  readonly connectMs?: number;
  readonly tlsMs?: number;
  readonly ttfbMs?: number;
  readonly downloadMs?: number;
}

/**
 * Derives per-phase millisecond deltas from monotonic timing markers (api-workbench compatible).
 */
export function computeTimingFromMarkers(markers: HttpTimingMarkers): HttpResponseTimingPhases {
  const start = markers.startedAt;
  const end = markers.endedAt ?? markers.ttfbAt ?? start;
  const totalMs = Math.max(0, end - start);
  const beforeConnect = markers.dnsAt ?? start;
  const beforeTtfb = markers.secureAt ?? markers.connectAt ?? beforeConnect;

  return {
    totalMs,
    ...(markers.dnsAt !== undefined
      ? { dnsMs: Math.max(0, markers.dnsAt - start) }
      : {}),
    ...(markers.connectAt !== undefined
      ? { connectMs: Math.max(0, markers.connectAt - beforeConnect) }
      : {}),
    ...(markers.secureAt !== undefined && markers.connectAt !== undefined
      ? { tlsMs: Math.max(0, markers.secureAt - markers.connectAt) }
      : {}),
    ...(markers.ttfbAt !== undefined
      ? { ttfbMs: Math.max(0, markers.ttfbAt - beforeTtfb) }
      : {}),
    ...(markers.endedAt !== undefined && markers.ttfbAt !== undefined
      ? { downloadMs: Math.max(0, markers.endedAt - markers.ttfbAt) }
      : {}),
  };
}
