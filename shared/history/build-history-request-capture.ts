import type { HttpKeyValueRow } from '../config/http-settings.schema';
import { parseRequestUrlInput } from '../config/request-url';
import type { HistoryRequestCapture } from '../config/history.schema';
import type { EncodedRequestBodySchema } from '../http/encoded-body.schema';
import type { OutgoingHttpRequest } from '../http/outgoing-request.schema';

function captureBodyFromEncoded(body: EncodedRequestBodySchema): string | undefined {
  switch (body.kind) {
    case 'none':
      return undefined;
    case 'text':
    case 'urlencoded':
      return body.content;
    case 'multipart':
      return JSON.stringify(body.parts, null, 2);
    case 'binary':
      return `[file ${body.filePath}]`;
    case 'binary-inline':
      return `[binary ${body.base64.length} chars]`;
    default:
      return undefined;
  }
}

/** Captures outgoing request fields for history detail view. */
export function buildHistoryRequestCapture(outgoing: OutgoingHttpRequest): HistoryRequestCapture {
  const headers = Object.entries(outgoing.headers).map(([key, value]) => ({ key, value }));
  let queryParams: HttpKeyValueRow[] = [];
  const parsed = parseRequestUrlInput(outgoing.url, []);
  queryParams = [...parsed.queryParams];
  return {
    headers,
    queryParams,
    body: captureBodyFromEncoded(outgoing.body),
  };
}
