export const MAX_CAPTURE_BODY_BYTES = 64 * 1024;

export interface NormalizedCaptureBodyText {
  readonly text: string;
  readonly truncated: boolean;
  readonly isBinary: boolean;
}

/**
 * Normalizes captured HTTP body text (size cap, binary → base64).
 */
export function normalizeCapturedBodyText(
  raw: string,
  maxBytes = MAX_CAPTURE_BODY_BYTES,
): NormalizedCaptureBodyText {
  if (!raw) {
    return { text: '', truncated: false, isBinary: false };
  }
  let buf = Buffer.from(raw, 'utf8');
  let truncated = false;
  if (buf.length > maxBytes) {
    buf = buf.subarray(0, maxBytes);
    truncated = true;
  }
  if (!buf.length) {
    return { text: '', truncated: false, isBinary: false };
  }
  if (buf.indexOf(0) !== -1) {
    return { text: buf.toString('base64'), truncated, isBinary: true };
  }
  return { text: buf.toString('utf8'), truncated, isBinary: false };
}

/**
 * Decodes a CDP `Network.getResponseBody` payload into normalized capture text.
 */
export function normalizeCapturedBodyFromCdp(
  body: string,
  base64Encoded: boolean,
  maxBytes = MAX_CAPTURE_BODY_BYTES,
): NormalizedCaptureBodyText {
  if (!body) {
    return { text: '', truncated: false, isBinary: false };
  }
  let buf = base64Encoded ? Buffer.from(body, 'base64') : Buffer.from(body, 'utf8');
  let truncated = false;
  if (buf.length > maxBytes) {
    buf = buf.subarray(0, maxBytes);
    truncated = true;
  }
  if (!buf.length) {
    return { text: '', truncated: false, isBinary: false };
  }
  if (buf.indexOf(0) !== -1) {
    return { text: buf.toString('base64'), truncated, isBinary: true };
  }
  return { text: buf.toString('utf8'), truncated, isBinary: false };
}
