/**
 * Appends `payload.zip` to a thin installer artifact with a fixed footer.
 *
 * Payload bytes sit after the host binary/image and are read at install time —
 * not bundled inside AppImage / portable 7z / app resources.
 */
import { existsSync, closeSync, createReadStream, createWriteStream, openSync, readSync, statSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';

export const APPENDED_PAYLOAD_MAGIC = Buffer.from('TESTRIXPK');
export const APPENDED_PAYLOAD_FOOTER_BYTES = 8 + 8 + APPENDED_PAYLOAD_MAGIC.length;
const FOOTER_PROBE_BYTES = 256 * 1024;

/**
 * @param {Buffer} footerBuf
 * @param {number} footerPos
 * @param {number} fileSize
 * @returns {{ payloadOffset: number, payloadSize: number } | null}
 */
function parseFooterBuffer(footerBuf, footerPos, fileSize) {
  if (!footerBuf.subarray(16, 16 + APPENDED_PAYLOAD_MAGIC.length).equals(APPENDED_PAYLOAD_MAGIC)) {
    return null;
  }

  const payloadOffset = Number(footerBuf.readBigUInt64LE(0));
  const payloadSize = Number(footerBuf.readBigUInt64LE(8));
  const footerEnd = footerPos + APPENDED_PAYLOAD_FOOTER_BYTES;

  if (
    !Number.isFinite(payloadOffset) ||
    !Number.isFinite(payloadSize) ||
    payloadOffset < 0 ||
    payloadSize <= 0 ||
    payloadOffset + payloadSize !== footerPos ||
    footerEnd > fileSize
  ) {
    return null;
  }

  return { payloadOffset, payloadSize };
}

/**
 * Reads appended payload metadata, scanning backward for the footer magic.
 *
 * Authenticode signatures (and similar overlays) may extend the file after our footer.
 *
 * @param {string} hostPath
 * @returns {{ payloadOffset: number, payloadSize: number } | null}
 */
export function readAppendedPayloadMeta(hostPath) {
  if (!existsSync(hostPath)) {
    return null;
  }

  const fileSize = statSync(hostPath).size;
  if (fileSize < APPENDED_PAYLOAD_FOOTER_BYTES) {
    return null;
  }

  const fd = openSync(hostPath, 'r');

  try {
    const footerBuf = Buffer.alloc(APPENDED_PAYLOAD_FOOTER_BYTES);

    const footerAtEof = fileSize - APPENDED_PAYLOAD_FOOTER_BYTES;
    readSync(fd, footerBuf, 0, APPENDED_PAYLOAD_FOOTER_BYTES, footerAtEof);
    const exact = parseFooterBuffer(footerBuf, footerAtEof, fileSize);
    if (exact) {
      return exact;
    }

    const probeSize = Math.min(fileSize, FOOTER_PROBE_BYTES);
    const tail = Buffer.alloc(probeSize);
    readSync(fd, tail, 0, probeSize, fileSize - probeSize);

    for (let i = tail.length - APPENDED_PAYLOAD_MAGIC.length; i >= 0; i -= 1) {
      if (!tail.subarray(i, i + APPENDED_PAYLOAD_MAGIC.length).equals(APPENDED_PAYLOAD_MAGIC)) {
        continue;
      }

      const footerPos = fileSize - probeSize + i - 16;
      if (footerPos < 0) {
        continue;
      }

      readSync(fd, footerBuf, 0, APPENDED_PAYLOAD_FOOTER_BYTES, footerPos);
      const meta = parseFooterBuffer(footerBuf, footerPos, fileSize);
      if (meta) {
        return meta;
      }
    }

    return null;
  } finally {
    closeSync(fd);
  }
}

/**
 * @param {string} hostPath
 * @param {string} payloadZipPath
 * @param {string} destPath
 */
export async function appendPayloadToInstaller(hostPath, payloadZipPath, destPath) {
  const hostSize = statSync(hostPath).size;
  const payloadSize = statSync(payloadZipPath).size;
  const payloadOffset = hostSize;

  await pipeline(createReadStream(hostPath), createWriteStream(destPath, { flags: 'w' }));
  await pipeline(createReadStream(payloadZipPath), createWriteStream(destPath, { flags: 'a' }));

  const footer = Buffer.alloc(APPENDED_PAYLOAD_FOOTER_BYTES);
  footer.writeBigUInt64LE(BigInt(payloadOffset), 0);
  footer.writeBigUInt64LE(BigInt(payloadSize), 8);
  APPENDED_PAYLOAD_MAGIC.copy(footer, 16);

  await pipeline(
    async function* () {
      yield footer;
    },
    createWriteStream(destPath, { flags: 'a' }),
  );
}

/** @deprecated Use {@link appendPayloadToInstaller}. */
export const appendPayloadToPortableExe = appendPayloadToInstaller;
