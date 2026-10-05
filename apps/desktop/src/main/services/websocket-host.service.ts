import { openWebSocket } from '@testrix/http-engine';
import type { WebsocketConnectRequest, WebsocketEvent } from '@testrix/contracts';

type LiveSocket = Awaited<ReturnType<typeof openWebSocket>>['socket'];

function stamp(): string {
  return new Date().toISOString();
}

function eventBody(data: unknown): string {
  if (typeof data === 'string')
    return data;
  if (data instanceof ArrayBuffer)
    return `[binary ${data.byteLength} bytes]`;
  if (ArrayBuffer.isView(data))
    return `[binary ${data.byteLength} bytes]`;
  return String(data ?? '');
}

/** Owns live WebSocket connections for workbench tabs. */
export class WebsocketHost {
  private readonly sockets = new Map<string, LiveSocket>();

  constructor(private readonly emit: (event: WebsocketEvent) => void) {}

  async connect(payload: WebsocketConnectRequest): Promise<{ ok: boolean; error: string | null; protocol: string }> {
    this.disconnect(payload.connectionId);
    try {
      const opened = await openWebSocket(payload);
      this.sockets.set(payload.connectionId, opened.socket);
      this.bind(payload.connectionId, opened.socket);
      this.emit({
        connectionId: payload.connectionId,
        kind: 'open',
        at: stamp(),
        body: opened.protocol ? `Connected (${opened.protocol})` : 'Connected',
        reason: '',
      });
      return { ok: true, error: null, protocol: opened.protocol };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'WebSocket failed to connect.';
      this.emit({
        connectionId: payload.connectionId,
        kind: 'error',
        at: stamp(),
        body: message,
        reason: message,
      });
      return { ok: false, error: message, protocol: '' };
    }
  }

  send(connectionId: string, data: string): { ok: boolean; error: string | null } {
    const socket = this.sockets.get(connectionId);
    if (!socket || socket.readyState !== 1)
      return { ok: false, error: 'Not connected.' };
    try {
      socket.send(data);
      return { ok: true, error: null };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Send failed.' };
    }
  }

  disconnect(connectionId: string): void {
    const socket = this.sockets.get(connectionId);
    if (!socket)
      return;
    this.sockets.delete(connectionId);
    try {
      socket.close(1000, 'Closed');
    } catch {
      /* already closing */
    }
  }

  closeAll(): void {
    for (const id of [...this.sockets.keys()])
      this.disconnect(id);
  }

  private bind(connectionId: string, socket: LiveSocket): void {
    socket.addEventListener('message', (event) => {
      this.emit({
        connectionId,
        kind: 'message',
        at: stamp(),
        body: eventBody((event as MessageEvent).data),
        reason: '',
      });
    });
    socket.addEventListener('error', (event) => {
      const message =
        'error' in event && event.error instanceof Error
          ? event.error.message
          : 'WebSocket error.';
      this.emit({
        connectionId,
        kind: 'error',
        at: stamp(),
        body: message,
        reason: message,
      });
    });
    socket.addEventListener('close', (event) => {
      this.sockets.delete(connectionId);
      const close = event as CloseEvent;
      this.emit({
        connectionId,
        kind: 'close',
        at: stamp(),
        body: close.reason || `Closed (${close.code})`,
        code: close.code,
        reason: close.reason || '',
      });
    });
  }
}
