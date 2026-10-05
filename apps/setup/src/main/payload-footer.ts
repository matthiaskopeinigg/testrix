import { PAYLOAD_MAGIC } from '@testrix/contracts';

const MAGIC = Buffer.from(PAYLOAD_MAGIC);
/** Older packers allocated 8 bytes for a 9-character marker and stored `TESTRIXP`. */
const MAGIC_LEGACY = MAGIC.subarray(0, 8);

export interface AppendedPayloadFooter {
  readonly payloadOffset: number;
  readonly payloadSize: number;
  readonly footerBytes: number;
}

/**
 * Reads the TESTRIXPK (or truncated TESTRIXP) footer from the end of Setup.exe.
 */
export function readAppendedPayloadFooter(
  fileSize: number,
  readAt: (length: number, position: number) => Buffer,
): AppendedPayloadFooter | null {
  for (const magic of [MAGIC, MAGIC_LEGACY]) {
    const footerBytes = 16 + magic.length;
    if (fileSize < footerBytes)
      continue;
    const footer = readAt(footerBytes, fileSize - footerBytes);
    if (!footer.subarray(16).equals(magic))
      continue;
    const payloadOffset = Number(footer.readBigUInt64LE(0));
    const payloadSize = Number(footer.readBigUInt64LE(8));
    if (!Number.isFinite(payloadOffset) || payloadSize <= 0)
      return null;
    return { payloadOffset, payloadSize, footerBytes };
  }
  return null;
}
