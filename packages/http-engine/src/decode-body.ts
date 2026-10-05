import zlib, {
  brotliDecompressSync,
  gunzipSync,
  inflateRawSync,
  inflateSync,
} from 'node:zlib';

interface HeaderPair {
  readonly key: string;
  readonly value: string;
}

export function decodeHttpBody(raw: Uint8Array, headers: readonly HeaderPair[]): string {
  const bytes = Buffer.from(raw);
  const inflated = decompressBody(bytes, headerValue(headers, 'content-encoding'));
  const contentType = headerValue(headers, 'content-type');
  const charset = charsetFromContentType(contentType) || charsetFromHtml(inflated) || 'utf-8';
  return decodeText(inflated, charset);
}

function decompressBody(bytes: Buffer, encodingHeader: string): Buffer {
  const encodings = encodingHeader
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item && item !== 'identity');
  if (encodings.length === 0 && looksLikeGzip(bytes))
    encodings.push('gzip');
  let next = bytes;
  for (let index = encodings.length - 1; index >= 0; index -= 1) {
    const encoding = encodings[index] ?? '';
    const inflated = inflateOnce(next, encoding);
    if (!inflated)
      return bytes;
    next = inflated;
  }
  return next;
}

function inflateOnce(bytes: Buffer, encoding: string): Buffer | null {
  try {
    if (encoding === 'gzip' || encoding === 'x-gzip')
      return gunzipSync(bytes);
    if (encoding === 'deflate')
      return inflateDeflate(bytes);
    if (encoding === 'br')
      return brotliDecompressSync(bytes);
    if (encoding === 'zstd') {
      const zstd = (zlib as { zstdDecompressSync?: (input: Buffer) => Buffer }).zstdDecompressSync;
      if (typeof zstd !== 'function')
        return null;
      return zstd(bytes);
    }
  } catch {
    return null;
  }
  return bytes;
}

function inflateDeflate(bytes: Buffer): Buffer {
  try {
    return inflateSync(bytes);
  } catch {
    return inflateRawSync(bytes);
  }
}

function looksLikeGzip(bytes: Buffer): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

function headerValue(headers: readonly HeaderPair[], name: string): string {
  const match = headers.find((row) => row.key.toLowerCase() === name);
  return match?.value.trim() ?? '';
}

function charsetFromContentType(contentType: string): string {
  const match = contentType.match(/charset\s*=\s*("?)([^\s;"]+)\1/i);
  return normalizeCharset(match?.[2] ?? '');
}

function charsetFromHtml(bytes: Buffer): string {
  const head = bytes.subarray(0, 2048).toString('latin1');
  const meta = head.match(/<meta[^>]+charset\s*=\s*["']?([^\s"';>]+)/i)
    ?? head.match(/<meta[^>]+http-equiv\s*=\s*["']?content-type["'][^>]+charset\s*=\s*["']?([^\s"';>]+)/i);
  return normalizeCharset(meta?.[1] ?? '');
}

function normalizeCharset(value: string): string {
  const charset = value.trim().toLowerCase().replace(/_/g, '-');
  if (!charset)
    return '';
  if (charset === 'utf8' || charset === 'utf-8' || charset === 'us-ascii' || charset === 'ascii')
    return 'utf-8';
  if (charset === 'iso-8859-1' || charset === 'latin1' || charset === 'latin-1')
    return 'latin1';
  if (charset === 'utf-16' || charset === 'utf16')
    return 'utf-16le';
  return charset;
}

function decodeText(bytes: Buffer, charset: string): string {
  if (charset === 'utf-8')
    return bytes.toString('utf8');
  if (charset === 'latin1')
    return bytes.toString('latin1');
  if (charset === 'utf-16le')
    return bytes.toString('utf16le');
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return bytes.toString('utf8');
  }
}
