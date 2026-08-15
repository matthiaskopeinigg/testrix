export interface UuidGenerateOptions {
  readonly count: number;
  readonly uppercase: boolean;
  readonly stripHyphens: boolean;
  readonly version?: 'v4' | 'v7' | 'ulid' | 'nanoid';
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function randomBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function formatUuidBytes(bytes: Uint8Array, options: UuidGenerateOptions): string {
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  let id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  if (options.stripHyphens) {
    id = id.replace(/-/g, '');
  }
  if (options.uppercase) {
    id = id.toUpperCase();
  }
  return id;
}

function generateUuidV7Bytes(): Uint8Array {
  const bytes = randomBytes(16);
  const ms = BigInt(Date.now());
  bytes[0] = Number((ms >> 40n) & 0xffn);
  bytes[1] = Number((ms >> 32n) & 0xffn);
  bytes[2] = Number((ms >> 24n) & 0xffn);
  bytes[3] = Number((ms >> 16n) & 0xffn);
  bytes[4] = Number((ms >> 8n) & 0xffn);
  bytes[5] = Number(ms & 0xffn);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[7] = bytes[7]!;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return bytes;
}

function encodeUlid(timeMs: number, randomness: Uint8Array): string {
  const time = BigInt(timeMs);
  let chars = '';
  let value = time;
  for (let i = 0; i < 10; i++) {
    chars = CROCKFORD[Number(value % 32n)] + chars;
    value /= 32n;
  }
  let acc = 0;
  let bits = 0;
  for (const byte of randomness) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      chars += CROCKFORD[(acc >> bits) & 31];
    }
  }
  return chars.slice(0, 26);
}

function generateNanoid(length = 21): string {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-';
  const bytes = randomBytes(length);
  let id = '';
  for (let i = 0; i < length; i++) {
    id += alphabet[bytes[i]! % alphabet.length];
  }
  return id;
}

export function generateUuids(options: UuidGenerateOptions): readonly string[] {
  const n = Math.min(500, Math.max(1, options.count));
  const version = options.version ?? 'v4';
  const lines: string[] = [];
  for (let i = 0; i < n; i++) {
    if (version === 'ulid') {
      let id = encodeUlid(Date.now(), randomBytes(10));
      if (options.stripHyphens) {
        id = id.replace(/-/g, '');
      }
      lines.push(options.uppercase ? id : id.toLowerCase());
      continue;
    }
    if (version === 'nanoid') {
      let id = generateNanoid();
      if (options.uppercase) {
        id = id.toUpperCase();
      }
      lines.push(id);
      continue;
    }
    const bytes = version === 'v7' ? generateUuidV7Bytes() : randomBytes(16);
    if (version === 'v4') {
      bytes[6] = (bytes[6]! & 0x0f) | 0x40;
      bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    }
    lines.push(formatUuidBytes(bytes, options));
  }
  return lines;
}

export const NIL_UUID = '00000000-0000-0000-0000-000000000000';
