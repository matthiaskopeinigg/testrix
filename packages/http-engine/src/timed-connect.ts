import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import net from 'node:net';
import tls from 'node:tls';
import { Agent, ProxyAgent, type Dispatcher } from 'undici';
import type { HttpExecuteRequest } from '@testrix/contracts';

export interface ConnectTimings {
  dnsMs: number;
  tcpMs: number;
  tlsMs: number;
}

export function emptyConnectTimings(): ConnectTimings {
  return { dnsMs: 0, tcpMs: 0, tlsMs: 0 };
}

export function dispatcherFor(
  payload: HttpExecuteRequest,
  timings: ConnectTimings,
): Dispatcher {
  const connect = { rejectUnauthorized: payload.verifyTls };
  const proxy = payload.proxy;
  if (proxy && proxy.mode === 'http' && proxy.host.trim()) {
    const auth = proxy.username
      ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@`
      : '';
    const port = proxy.port.trim() || '80';
    return new ProxyAgent({
      uri: `http://${auth}${proxy.host.trim()}:${port}`,
      requestTls: connect,
    });
  }
  return new Agent({
    connections: 1,
    pipelining: 0,
    keepAliveTimeout: 1,
    connectTimeout: payload.timeoutMs,
    connect: (options, callback) => {
      void openTimedSocket(options, payload.verifyTls, timings, (error, socket) => {
        if (error || !socket)
          callback(error ?? new Error('Connect failed.'), null);
        else
          callback(null, socket);
      });
    },
  });
}

interface ConnectOptions {
  readonly hostname?: string;
  readonly host?: string;
  readonly protocol?: string;
  readonly port?: string | number;
  readonly servername?: string;
  readonly httpSocket?: net.Socket;
}

async function openTimedSocket(
  options: ConnectOptions,
  verifyTls: boolean,
  timings: ConnectTimings,
  callback: (error: Error | null, socket?: net.Socket) => void,
): Promise<void> {
  const hostname = options.hostname || options.host || '';
  const port = Number(options.port) || (isHttps(options.protocol) ? 443 : 80);
  try {
    const dnsStart = Date.now();
    const address = isIP(hostname) ? hostname : (await lookup(hostname)).address;
    timings.dnsMs += Date.now() - dnsStart;
    const tcpStart = Date.now();
    const socket = options.httpSocket ?? net.connect({ host: address, port });
    await once(socket, 'connect');
    timings.tcpMs += Date.now() - tcpStart;
    if (!isHttps(options.protocol)) {
      callback(null, socket);
      return;
    }
    const tlsStart = Date.now();
    const secure = tls.connect({
      socket,
      servername: options.servername || hostname,
      rejectUnauthorized: verifyTls,
    });
    await once(secure, 'secureConnect');
    timings.tlsMs += Date.now() - tlsStart;
    callback(null, secure);
  } catch (error) {
    callback(error instanceof Error ? error : new Error('Connect failed.'));
  }
}

function isHttps(protocol: string | undefined): boolean {
  return (protocol ?? '').includes('https');
}

function once(socket: net.Socket, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => {
      socket.off(event, onOk);
      reject(error);
    };
    const onOk = (): void => {
      socket.off('error', onError);
      resolve();
    };
    socket.once('error', onError);
    socket.once(event, onOk);
  });
}
