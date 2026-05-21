import type { HttpResponseSnapshot } from './outgoing-request.schema';

function getNavigatorClipboard(): { writeText(text: string): Promise<void> } | null {
  if (typeof globalThis === 'undefined') {
    return null;
  }
  const nav = globalThis as { navigator?: { clipboard?: { writeText(text: string): Promise<void> } } };
  const writeText = nav.navigator?.clipboard?.writeText;
  return typeof writeText === 'function' ? nav.navigator!.clipboard! : null;
}

export type ResponseCopyActionId =
  | 'body'
  | 'bodyJson'
  | 'headersJson'
  | 'rawHttp'
  | 'markdown'
  | 'url';

export interface ResponseCopyAction {
  readonly id: ResponseCopyActionId;
  readonly label: string;
  readonly hint: string;
}

export const RESPONSE_COPY_ACTIONS: readonly ResponseCopyAction[] = [
  { id: 'body', label: 'Body', hint: 'Raw response body' },
  { id: 'bodyJson', label: 'Pretty JSON', hint: 'Formatted when valid JSON' },
  { id: 'headersJson', label: 'Headers (JSON)', hint: 'All response headers' },
  { id: 'rawHttp', label: 'Raw HTTP', hint: 'Status line + headers + body' },
  { id: 'markdown', label: 'Markdown', hint: 'Summary + fenced body' },
  { id: 'url', label: 'Request URL', hint: 'URL from the sent request' },
];

export async function copyTextToClipboard(text: string): Promise<boolean> {
  const value = text ?? '';
  if (!value) {
    return false;
  }
  const clipboard = getNavigatorClipboard();
  if (!clipboard) {
    return false;
  }
  try {
    await clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function headersToObject(headers: readonly { key: string; value: string }[]): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const h of headers) {
    if (h.key) {
      obj[h.key] = h.value ?? '';
    }
  }
  return obj;
}

function prettyJsonOrRaw(body: string): string {
  if (!body) {
    return '';
  }
  try {
    return JSON.stringify(JSON.parse(body) as unknown, null, 2);
  } catch {
    return body;
  }
}

function getBodyText(snapshot: HttpResponseSnapshot): string {
  if (snapshot.body.encoding === 'text' && snapshot.body.text !== undefined) {
    return snapshot.body.text;
  }
  return '';
}

export function buildRawHttpResponse(snapshot: HttpResponseSnapshot): string {
  const statusLine = `HTTP/1.1 ${snapshot.status.code} ${snapshot.status.text}`.trimEnd();
  const headerLines = snapshot.headers.map((h) => `${h.key}: ${h.value}`).join('\n');
  const body = getBodyText(snapshot);
  return `${statusLine}\n${headerLines}\n\n${body}`;
}

function buildMarkdownResponse(
  snapshot: HttpResponseSnapshot,
  body: string,
  method: string | null,
  url: string | null,
): string {
  const intro = method && url ? `**${method.toUpperCase()} ${url}**\n\n` : '';
  const meta = `Status: \`${snapshot.status.code} ${snapshot.status.text}\` · ${snapshot.timing.totalMs} ms · ${snapshot.size.bodyBytes} bytes`;
  return `${intro}${meta}\n\n\`\`\`\n${body}\n\`\`\``;
}

export function buildResponseCopyPayload(
  action: ResponseCopyActionId,
  snapshot: HttpResponseSnapshot,
  requestUrl: string,
  requestMethod: string,
): string {
  const body = getBodyText(snapshot);
  switch (action) {
    case 'body':
      return body;
    case 'bodyJson':
      return prettyJsonOrRaw(body);
    case 'headersJson':
      return JSON.stringify(headersToObject(snapshot.headers), null, 2);
    case 'rawHttp':
      return buildRawHttpResponse(snapshot);
    case 'markdown':
      return buildMarkdownResponse(snapshot, body, requestMethod, requestUrl);
    case 'url':
      return requestUrl;
    default:
      return '';
  }
}
