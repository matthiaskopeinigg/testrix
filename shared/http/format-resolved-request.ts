import type { EncodedRequestBodySchema } from './encoded-body.schema';
import type { OutgoingHttpRequest } from './outgoing-request.schema';

const MASK = '••••';

function maskHeaderValue(key: string, value: string): string {
  const lower = key.toLowerCase();
  if (lower === 'authorization' || lower === 'proxy-authorization' || lower === 'cookie') {
    const bearer = /^(Bearer\s+)/i.exec(value);
    if (bearer) {
      return `${bearer[1]}${MASK}`;
    }
    const basic = /^(Basic\s+)/i.exec(value);
    if (basic) {
      return `${basic[1]}${MASK}`;
    }
    return MASK;
  }
  if (lower.includes('secret') || lower.includes('token') || lower.includes('api-key') || lower.includes('apikey')) {
    return MASK;
  }
  return value;
}

function formatEncodedBody(body: EncodedRequestBodySchema): string {
  switch (body.kind) {
    case 'none':
      return '(empty)';
    case 'text':
    case 'urlencoded':
      return body.content;
    case 'multipart':
      return body.parts
        .map((part) => `${part.name}=${part.fileName ?? part.filePath ?? part.value ?? ''}`)
        .join('\n');
    case 'binary':
      return `(file) ${body.filePath}`;
    case 'binary-inline':
      return `(base64 ${body.base64.length} chars)`;
    default:
      return '(empty)';
  }
}

/**
 * Formats a fully resolved outgoing request for the pre-send preview.
 * Authorization, cookie, and token-like header values are masked.
 */
export function formatResolvedRequest(outgoing: OutgoingHttpRequest): string {
  const headerLines = Object.entries(outgoing.headers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}: ${maskHeaderValue(key, value)}`);
  const lines = [
    `${outgoing.method} ${outgoing.url}`,
    '',
    'Headers',
    headerLines.length > 0 ? headerLines.join('\n') : '(none)',
    '',
    'Body',
    formatEncodedBody(outgoing.body),
    '',
    `Environment: ${outgoing.environmentId ?? '(none)'}`,
    `Variables: ${Object.keys(outgoing.variableContext).join(', ') || '(none)'}`,
  ];
  return lines.join('\n');
}
