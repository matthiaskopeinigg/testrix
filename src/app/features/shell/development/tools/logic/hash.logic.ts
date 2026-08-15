export type HashAlgorithm = 'md5' | 'sha-1' | 'sha-256' | 'sha-384' | 'sha-512';

const encoder = new TextEncoder();

/**
 * Hashes UTF-8 text with Web Crypto (SHA family) or a compact MD5 implementation.
 */
export async function hashText(algorithm: HashAlgorithm, text: string): Promise<string> {
  const bytes = encoder.encode(text);
  if (algorithm === 'md5') {
    return md5Hex(bytes);
  }
  const subtleName = algorithm.toUpperCase() as 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';
  const digest = await globalThis.crypto.subtle.digest(subtleName, bytes);
  return bytesToHex(new Uint8Array(digest));
}

/**
 * HMAC-SHA-256 of UTF-8 text with a UTF-8 key.
 */
export async function hmacSha256(key: string, text: string): Promise<string> {
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await globalThis.crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(text));
  return bytesToHex(new Uint8Array(signature));
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function md5Hex(bytes: Uint8Array): string {
  const originalLen = bytes.length;
  const bitLen = originalLen * 8;
  const paddedLen = (((originalLen + 8) >> 6) + 1) << 6;
  const buf = new Uint8Array(paddedLen);
  buf.set(bytes);
  buf[originalLen] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(paddedLen - 8, bitLen >>> 0, true);
  view.setUint32(paddedLen - 4, Math.floor(bitLen / 0x100000000), true);

  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;

  const s = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9,
    14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const k = new Uint32Array(64);
  for (let i = 0; i < 64; i++) {
    k[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000);
  }

  for (let offset = 0; offset < paddedLen; offset += 64) {
    const w = new Uint32Array(16);
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, true);
    }
    let A = a;
    let B = b;
    let C = c;
    let D = d;
    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        f = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        f = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      const temp = D;
      D = C;
      C = B;
      const sum = (A + f + k[i]! + w[g]!) >>> 0;
      B = (B + rotl(sum, s[i]!)) >>> 0;
      A = temp;
    }
    a = (a + A) >>> 0;
    b = (b + B) >>> 0;
    c = (c + C) >>> 0;
    d = (d + D) >>> 0;
  }

  const out = new Uint8Array(16);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, a, true);
  outView.setUint32(4, b, true);
  outView.setUint32(8, c, true);
  outView.setUint32(12, d, true);
  return bytesToHex(out);
}

function rotl(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}
