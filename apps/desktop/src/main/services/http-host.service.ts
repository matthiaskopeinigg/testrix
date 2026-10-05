import { randomUUID } from 'node:crypto';
import { shell } from 'electron';
import type {
  HttpExecuteRequest,
  OAuthClientConfig,
  OAuthDevicePollResult,
  OAuthDeviceStartResult,
  OAuthTokenResult,
} from '@testrix/contracts';
import {
  authorizeWithLoopback,
  executeHttp,
  pollDeviceAuthorization,
  refreshOAuthToken,
  requestOAuthToken,
  startDeviceAuthorization,
  type DeviceAuthorizationState,
} from '@testrix/http-engine';

interface DeviceSession {
  readonly config: OAuthClientConfig;
  readonly state: DeviceAuthorizationState;
}

function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Main-process HTTP and OAuth host. The renderer never talks to the network. */
export class HttpHost {
  private readonly devices = new Map<string, DeviceSession>();
  private readonly aborts = new Map<string, AbortController>();
  private readonly pendingAborts = new Set<string>();

  execute(payload: HttpExecuteRequest) {
    const abortId = payload.abortId?.trim();
    if (abortId && this.pendingAborts.has(abortId)) {
      this.pendingAborts.delete(abortId);
      const controller = new AbortController();
      controller.abort();
      return executeHttp(payload, controller.signal);
    }
    const controller = abortId ? new AbortController() : null;
    if (abortId && controller)
      this.aborts.set(abortId, controller);
    return executeHttp(payload, controller?.signal).finally(() => {
      if (abortId)
        this.aborts.delete(abortId);
    });
  }

  abort(abortId: string): void {
    const id = abortId.trim();
    if (!id)
      return;
    const controller = this.aborts.get(id);
    if (controller) {
      controller.abort();
      this.aborts.delete(id);
      return;
    }
    this.pendingAborts.add(id);
  }

  async openUrl(url: string): Promise<void> {
    if (!isSafeHttpUrl(url))
      throw new Error('Only http and https URLs can be opened.');
    await shell.openExternal(url);
  }

  authorize(config: OAuthClientConfig): Promise<OAuthTokenResult> {
    return authorizeWithLoopback(config, (url) => this.openUrl(url));
  }

  token(config: OAuthClientConfig): Promise<OAuthTokenResult> {
    return requestOAuthToken(config);
  }

  refresh(config: OAuthClientConfig): Promise<OAuthTokenResult> {
    return refreshOAuthToken(config);
  }

  async deviceStart(config: OAuthClientConfig): Promise<OAuthDeviceStartResult> {
    const started = await startDeviceAuthorization(config);
    if (!started.result.ok || !started.state)
      return started.result;
    const sessionId = randomUUID();
    this.devices.set(sessionId, { config, state: started.state });
    return { ...started.result, sessionId };
  }

  async devicePoll(sessionId: string): Promise<OAuthDevicePollResult> {
    const session = this.devices.get(sessionId);
    if (!session) {
      return {
        ok: false,
        error: 'Device session is not active.',
        accessToken: '',
        refreshToken: '',
        tokenType: 'Bearer',
        expiresAt: '',
        pending: false,
        cancelled: false,
      };
    }
    const result = await pollDeviceAuthorization(session.config, session.state);
    if (!result.pending)
      this.devices.delete(sessionId);
    return result;
  }

  async deviceCancel(sessionId: string): Promise<void> {
    const session = this.devices.get(sessionId);
    if (session)
      session.state.cancelled = true;
    this.devices.delete(sessionId);
  }
}
