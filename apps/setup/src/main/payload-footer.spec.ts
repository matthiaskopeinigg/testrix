import { describe, expect, it } from 'vitest';

import { readAppendedPayloadFooter } from './payload-footer';

function footerOf(offset: bigint, size: bigint, magic: string): Buffer {
  const bytes = Buffer.alloc(16 + Buffer.byteLength(magic));
  bytes.writeBigUInt64LE(offset, 0);
  bytes.writeBigUInt64LE(size, 8);
  bytes.write(magic, 16, 'ascii');
  return bytes;
}

describe('readAppendedPayloadFooter', () => {
  it('reads a 9-byte TESTRIXPK footer', () => {
    const packed = footerOf(100n, 50n, 'TESTRIXPK');
    const found = readAppendedPayloadFooter(packed.length, (length, position) =>
      packed.subarray(position, position + length),
    );
    expect(found).toEqual({ payloadOffset: 100, payloadSize: 50, footerBytes: 25 });
  });

  it('reads the 8-byte TESTRIXP footer older packs wrote', () => {
    const packed = footerOf(101548336n, 192681897n, 'TESTRIXP');
    const found = readAppendedPayloadFooter(packed.length, (length, position) =>
      packed.subarray(position, position + length),
    );
    expect(found).toEqual({ payloadOffset: 101548336, payloadSize: 192681897, footerBytes: 24 });
  });

  it('rejects a file with no marker', () => {
    const packed = Buffer.alloc(32, 1);
    expect(readAppendedPayloadFooter(packed.length, (length, position) => packed.subarray(position, position + length))).toBeNull();
  });
});
