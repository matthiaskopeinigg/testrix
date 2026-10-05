import { Agent, WebSocket } from 'undici';
import { DEFAULT_API_KEY_HEADER, websocketConnectRequestSchema, type WebsocketConnectRequest } from '@testrix/contracts';

export interface OpenWebSocketResult {
  readonly socket: WebSocket;
  readonly protocol: string;
}

function applyAuth(payload: WebsocketConnectRequest, url: URL, headers: Record<string, string>): string {
  const auth = payload.auth;
  if (auth.type === 'bearer' && auth.token.trim())
    headers['Authorization'] = `Bearer ${auth.token.trim()}`;
  if (auth.type === 'oauth2' && auth.accessToken.trim()) {
    const type = auth.tokenType.trim() || 'Bearer';
    headers['Authorization'] = `${type} ${auth.accessToken.trim()}`;
  }
  if (auth.type === 'basic' && (auth.username || auth.password)) {
    const raw = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
    headers['Authorization'] = `Basic ${raw}`;
  }
  if (auth.type === 'apikey' && auth.apiKey.trim()) {
    const name = auth.apiKeyHeader.trim() || DEFAULT_API_KEY_HEADER;
    if (auth.apiKeyIn === 'query')
      url.searchParams.set(name, auth.apiKey);
    else
      headers[name] = auth.apiKey;
  }
  return url.toString();
}

function isWebsocketUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'ws:' || parsed.protocol === 'wss:';
  } catch {
    return false;
  }
}

export function websocketHandshakeHeaders(payload: WebsocketConnectRequest): {
  readonly url: string;
  readonly headers: Record<string, string>;
} {
  const parsed = websocketConnectRequestSchema.parse(payload);
  const headers: Record<string, string> = {};
  for (const row of parsed.headers) {
    const key = row.key.trim();
    if (!key)
      continue;
    headers[key] = row.value;
  }
  let target: URL;
  try {
    target = new URL(parsed.url);
  } catch {
    throw new Error('Enter a valid WebSocket URL.');
  }
  const url = applyAuth(parsed, target, headers);
  return { url, headers };
}

/**
 * Opens a WebSocket in the main process. Extra handshake headers are allowed here
 * (the renderer never talks to the network).
 */
export function openWebSocket(payload: WebsocketConnectRequest): Promise<OpenWebSocketResult> {
  const parsed = websocketConnectRequestSchema.parse(payload);
  const { url, headers } = websocketHandshakeHeaders(parsed);
  if (!isWebsocketUrl(url))
    return Promise.reject(new Error('Only ws:// and wss:// URLs can connect.'));

  const dispatcher = new Agent({
    connect: { rejectUnauthorized: parsed.verifyTls },
  });
  const socket = new WebSocket(url, {
    protocols: parsed.protocols.length > 0 ? parsed.protocols : undefined,
    headers,
    dispatcher,
  });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.close();
      void dispatcher.close();
      reject(new Error('WebSocket handshake timed out.'));
    }, parsed.timeoutMs);

    const onOpen = (): void => {
      clearTimeout(timer);
      socket.removeEventListener('error', onError);
      resolve({ socket, protocol: socket.protocol ?? '' });
    };
    const onError = (event: Event): void => {
      clearTimeout(timer);
      socket.removeEventListener('open', onOpen);
      const message = 'error' in event && event.error instanceof Error
        ? event.error.message
        : 'WebSocket failed to connect.';
      void dispatcher.close();
      reject(new Error(message));
    };

    socket.addEventListener('open', onOpen, { once: true });
    socket.addEventListener('error', onError, { once: true });
  });
}
