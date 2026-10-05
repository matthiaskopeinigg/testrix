export type NetworkFrictionKind = 'certificates' | 'proxy';

const CERT_MARKERS = [
  'self-signed',
  'unable to verify the first certificate',
  'cert_has_expired',
  'err_tls_cert',
  'certificate_verify_failed',
  'ssl routines',
  'tls handshake',
  'certificate',
  'untrusted',
] as const;

const PROXY_MARKERS = [
  'proxy',
  'socks',
  '407',
  'proxy authentication',
  'proxyconnect',
  'tunneling socket',
  'connect econnrefused',
  'econnrefused',
  'connection refused',
] as const;

/**
 * Detects certificate or proxy friction from a failed HTTP response or timeline error text.
 */
export function detectNetworkFriction(text: string | null | undefined): NetworkFrictionKind | null {
  const hay = (text ?? '').trim().toLowerCase();
  if (!hay)
    return null;
  if (CERT_MARKERS.some((marker) => hay.includes(marker)))
    return 'certificates';
  if (PROXY_MARKERS.some((marker) => hay.includes(marker)))
    return 'proxy';
  return null;
}
