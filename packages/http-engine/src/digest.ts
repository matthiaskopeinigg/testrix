import { createHash } from 'node:crypto';

export interface DigestChallenge {
  readonly realm: string;
  readonly nonce: string;
  readonly qop: string;
  readonly opaque: string;
  readonly algorithm: string;
}

export function parseDigestChallenge(header: string): DigestChallenge | null {
  if (!/^digest\s+/i.test(header.trim()))
    return null;
  const values: Record<string, string> = {};
  const body = header.replace(/^digest\s+/i, '');
  const pattern = /([a-zA-Z0-9_-]+)=(?:"([^"]*)"|([^\s,]+))/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)))
    values[match[1].toLowerCase()] = match[2] ?? match[3] ?? '';
  if (!values['nonce'] || !values['realm'])
    return null;
  return {
    realm: values['realm'],
    nonce: values['nonce'],
    qop: (values['qop'] ?? '').split(',')[0]?.trim() ?? '',
    opaque: values['opaque'] ?? '',
    algorithm: values['algorithm'] ?? 'MD5',
  };
}

function md5(value: string): string {
  return createHash('md5').update(value).digest('hex');
}

/** Builds a Digest Authorization header (MD5, qop=auth when offered). */
export function buildDigestAuthorization(
  challenge: DigestChallenge,
  username: string,
  password: string,
  method: string,
  uri: string,
  nc = 1,
): string {
  const ha1 = md5(`${username}:${challenge.realm}:${password}`);
  const ha2 = md5(`${method.toUpperCase()}:${uri}`);
  const ncValue = nc.toString(16).padStart(8, '0');
  const cnonce = md5(`${Date.now()}:${nc}`);
  const qop = challenge.qop || 'auth';
  const response = challenge.qop
    ? md5(`${ha1}:${challenge.nonce}:${ncValue}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${challenge.nonce}:${ha2}`);
  const parts = [
    `username="${username}"`,
    `realm="${challenge.realm}"`,
    `nonce="${challenge.nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
    `algorithm="${challenge.algorithm || 'MD5'}"`,
  ];
  if (challenge.qop)
    parts.push(`qop=${qop}`, `nc=${ncValue}`, `cnonce="${cnonce}"`);
  if (challenge.opaque)
    parts.push(`opaque="${challenge.opaque}"`);
  return `Digest ${parts.join(', ')}`;
}

export function findWwwAuthenticate(headers: Iterable<[string, string]>): string | null {
  for (const [key, value] of headers) {
    if (key.toLowerCase() === 'www-authenticate' && /^digest/i.test(value.trim()))
      return value;
  }
  return null;
}
