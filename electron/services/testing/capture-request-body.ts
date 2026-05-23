import path from 'node:path';

import type { UploadData } from 'electron';

const MAX_REQUEST_BODY = 64 * 1024;

export interface ParsedCaptureRequestBody {
  readonly text: string;
  readonly truncated: boolean;
  readonly isBinary: boolean;
}

/**
 * Reads request body bytes from Electron `uploadData` (POST/PUT payloads).
 */
export function parseCaptureRequestBody(uploadData: readonly UploadData[] | undefined): ParsedCaptureRequestBody {
  if (!uploadData?.length) {
    return { text: '', truncated: false, isBinary: false };
  }

  const chunks: Buffer[] = [];
  for (const part of uploadData) {
    if (part.file) {
      try {
        const name = path.basename(String(part.file));
        return { text: `[upload file: ${name}]`, truncated: false, isBinary: false };
      } catch {
        return { text: '[upload file]', truncated: false, isBinary: false };
      }
    }
    if (part.bytes != null) {
      const buf = Buffer.isBuffer(part.bytes) ? part.bytes : Buffer.from(part.bytes);
      chunks.push(buf);
    }
  }

  if (!chunks.length) {
    return { text: '', truncated: false, isBinary: false };
  }

  let combined = Buffer.concat(chunks);
  let truncated = false;
  if (combined.length > MAX_REQUEST_BODY) {
    combined = combined.subarray(0, MAX_REQUEST_BODY);
    truncated = true;
  }
  if (!combined.length) {
    return { text: '', truncated: false, isBinary: false };
  }
  if (combined.indexOf(0) !== -1) {
    return { text: combined.toString('base64'), truncated, isBinary: true };
  }
  return { text: combined.toString('utf8'), truncated, isBinary: false };
}
