import { HTTP_METHOD_IDS, type HttpMethodId } from '../config/http-settings.schema';
import { createHttpKeyValueRow } from '../config/http-settings.schema';
import type { CollectionRequestBody } from '../config/collection-request-settings.schema';

export interface ParsedCurlHeader {
  readonly key: string;
  readonly value: string;
}

export interface ParsedCurlRequest {
  readonly method: HttpMethodId;
  readonly url: string;
  readonly headers: readonly ParsedCurlHeader[];
  readonly body: CollectionRequestBody;
}

const TOKEN_RE = /'([^']*)'|"((?:\\.|[^"\\])*)"|(\S+)/g;

/**
 * Returns true when trimmed text looks like a curl command.
 */
export function looksLikeCurl(raw: string): boolean {
  const trimmed = raw.trim();
  return /^curl(\s|$)/i.test(trimmed);
}

function tokenizeCurl(input: string): string[] {
  const normalized = input.replace(/\\\r?\n/g, ' ').trim();
  const tokens: string[] = [];
  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null = TOKEN_RE.exec(normalized);
  while (match) {
    if (match[1] !== undefined) {
      tokens.push(match[1]);
    } else if (match[2] !== undefined) {
      tokens.push(match[2].replace(/\\"/g, '"'));
    } else if (match[3]) {
      tokens.push(match[3]);
    }
    match = TOKEN_RE.exec(normalized);
  }
  return tokens;
}

function coerceMethod(raw: string): HttpMethodId {
  const upper = raw.trim().toUpperCase();
  if ((HTTP_METHOD_IDS as readonly string[]).includes(upper)) {
    return upper as HttpMethodId;
  }
  return 'GET';
}

function splitHeader(raw: string): ParsedCurlHeader | null {
  const idx = raw.indexOf(':');
  if (idx <= 0) {
    return null;
  }
  const key = raw.slice(0, idx).trim();
  const value = raw.slice(idx + 1).trim();
  if (!key) {
    return null;
  }
  return { key, value };
}

function parseUrlEncodedFields(raw: string) {
  return raw
    .split('&')
    .map((pair) => {
      const idx = pair.indexOf('=');
      const key = idx >= 0 ? pair.slice(0, idx) : pair;
      const value = idx >= 0 ? pair.slice(idx + 1) : '';
      try {
        return createHttpKeyValueRow({
          key: decodeURIComponent(key.replace(/\+/g, ' ')),
          value: decodeURIComponent(value.replace(/\+/g, ' ')),
        });
      } catch {
        return createHttpKeyValueRow({ key, value });
      }
    })
    .filter((row) => row.key.length > 0);
}

function inferBody(raw: string, headers: readonly ParsedCurlHeader[]): CollectionRequestBody {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { mode: 'none' };
  }
  const contentType =
    headers.find((h) => h.key.toLowerCase() === 'content-type')?.value.toLowerCase() ?? '';
  if (contentType.includes('application/json') || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
    return { mode: 'json', raw };
  }
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return { mode: 'x-www-form-urlencoded', fields: parseUrlEncodedFields(trimmed) };
  }
  if (!contentType && trimmed.includes('=') && !trimmed.startsWith('{') && !trimmed.startsWith('<')) {
    return { mode: 'x-www-form-urlencoded', fields: parseUrlEncodedFields(trimmed) };
  }
  if (contentType.includes('xml') || trimmed.startsWith('<')) {
    return { mode: 'xml', raw };
  }
  return { mode: 'text', raw };
}

/**
 * Parses a curl command into method, URL, headers, and body.
 */
export function parseCurl(raw: string): ParsedCurlRequest | null {
  if (!looksLikeCurl(raw)) {
    return null;
  }

  const tokens = tokenizeCurl(raw);
  if (tokens.length === 0) {
    return null;
  }

  let method: HttpMethodId | null = null;
  let url = '';
  const headers: ParsedCurlHeader[] = [];
  let bodyRaw = '';
  let nextIsMethod = false;
  let nextIsHeader = false;
  let nextIsData = false;
  let nextIsUser = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] ?? '';
    if (i === 0 && token.toLowerCase() === 'curl') {
      continue;
    }
    if (nextIsMethod) {
      method = coerceMethod(token);
      nextIsMethod = false;
      continue;
    }
    if (nextIsHeader) {
      const header = splitHeader(token);
      if (header) {
        headers.push(header);
      }
      nextIsHeader = false;
      continue;
    }
    if (nextIsData) {
      bodyRaw = token;
      nextIsData = false;
      if (!method) {
        method = 'POST';
      }
      continue;
    }
    if (nextIsUser) {
      headers.push({ key: 'Authorization', value: `Basic ${token}` });
      nextIsUser = false;
      continue;
    }

    if (token === '-X' || token === '--request') {
      nextIsMethod = true;
      continue;
    }
    if (token.startsWith('-X') && token.length > 2) {
      method = coerceMethod(token.slice(2));
      continue;
    }
    if (token === '-H' || token === '--header') {
      nextIsHeader = true;
      continue;
    }
    if (
      token === '-d' ||
      token === '--data' ||
      token === '--data-raw' ||
      token === '--data-binary' ||
      token === '--data-ascii'
    ) {
      nextIsData = true;
      continue;
    }
    if (token.startsWith('--data-raw=') || token.startsWith('--data=')) {
      bodyRaw = token.slice(token.indexOf('=') + 1);
      if (!method) {
        method = 'POST';
      }
      continue;
    }
    if (token === '-u' || token === '--user') {
      nextIsUser = true;
      continue;
    }
    if (token === '-I' || token === '--head') {
      method = 'HEAD';
      continue;
    }
    if (token === '-G' || token === '--get') {
      method = 'GET';
      continue;
    }
    if (token.startsWith('-') && token !== '-') {
      continue;
    }
    if (!url && (token.startsWith('http://') || token.startsWith('https://') || token.startsWith('/'))) {
      url = token;
    }
  }

  if (!url) {
    return null;
  }

  return {
    method: method ?? 'GET',
    url,
    headers,
    body: inferBody(bodyRaw, headers),
  };
}
