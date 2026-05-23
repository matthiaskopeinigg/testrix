import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { Buffer } from 'node:buffer';

import type { CollectionRequestBody } from '../../../shared/config';
import { createDefaultCollectionRequestBody } from '../../../shared/config';
import { encodeRequestBody } from '../../../shared/http/encode-request-body';
import type { EncodedRequestBody } from '../../../shared/http/encode-request-body';

export type InterceptorMockFulfillPayload = {
  readonly bodyBase64: string;
  readonly contentType: string;
};

async function buildMultipartBody(
  parts: Extract<EncodedRequestBody, { kind: 'multipart' }>['parts'],
): Promise<{ body: Buffer; contentType: string }> {
  const boundary = `----testrix${randomUUID().replace(/-/g, '')}`;
  const chunks: Buffer[] = [];

  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    const disposition = part.fileName
      ? `form-data; name="${part.name}"; filename="${part.fileName}"`
      : `form-data; name="${part.name}"`;
    chunks.push(Buffer.from(`Content-Disposition: ${disposition}\r\n`));
    if (part.filePath) {
      const bytes = await fs.readFile(part.filePath);
      chunks.push(Buffer.from('\r\n'));
      chunks.push(bytes);
    } else if (part.value !== undefined) {
      chunks.push(Buffer.from('\r\n'));
      chunks.push(Buffer.from(part.value, 'utf8'));
    }
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));

  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

/**
 * Encodes a mock response body for CDP `Fetch.fulfillRequest`.
 */
export async function buildInterceptorMockFulfill(
  body: CollectionRequestBody | undefined,
): Promise<InterceptorMockFulfillPayload> {
  const resolved = body ?? createDefaultCollectionRequestBody();
  const encoded = encodeRequestBody(resolved);

  switch (encoded.kind) {
    case 'none':
      return {
        bodyBase64: '',
        contentType: 'text/plain; charset=utf-8',
      };
    case 'text':
      return {
        bodyBase64: Buffer.from(encoded.content, 'utf8').toString('base64'),
        contentType: `${encoded.contentType}; charset=utf-8`,
      };
    case 'urlencoded':
      return {
        bodyBase64: Buffer.from(encoded.content, 'utf8').toString('base64'),
        contentType: `${encoded.contentType}; charset=utf-8`,
      };
    case 'binary': {
      const bytes = await fs.readFile(encoded.filePath);
      return {
        bodyBase64: bytes.toString('base64'),
        contentType: encoded.contentType ?? 'application/octet-stream',
      };
    }
    case 'binary-inline': {
      const bytes = Buffer.from(encoded.base64, 'base64');
      return {
        bodyBase64: bytes.toString('base64'),
        contentType: encoded.contentType ?? 'application/octet-stream',
      };
    }
    case 'multipart': {
      const built = await buildMultipartBody(encoded.parts);
      return {
        bodyBase64: built.body.toString('base64'),
        contentType: built.contentType,
      };
    }
    default:
      return {
        bodyBase64: '',
        contentType: 'text/plain; charset=utf-8',
      };
  }
}
