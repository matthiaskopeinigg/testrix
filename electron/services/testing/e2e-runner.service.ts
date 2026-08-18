import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';

const requireE2e = createRequire(__filename);

function e2eModuleDir(): string {
  return path.join(__dirname, 'services', 'testing', 'e2e');
}

/** Payload for a single E2E browser action. */
export interface E2eExecutePayload {
  readonly action: string;
  readonly selector: string;
  readonly value: string;
  readonly timeout: number;
  readonly show: boolean;
  readonly screenshotPath?: string;
  readonly screenshotFileName?: string;
  readonly ignoreInvalidSsl?: boolean;
}

/** Result from the E2e runner main-process service. */
export interface E2eExecuteResult {
  readonly success: boolean;
  readonly error?: string;
  readonly data?: unknown;
}

/** Resolved step replayed before element pick. */
export interface E2ePickPrecedingStep {
  readonly action: string;
  readonly selector: string;
  readonly value: string;
  readonly timeout: number;
  readonly screenshotPath?: string;
  readonly screenshotFileName?: string;
}

export interface E2ePickElementPayload {
  readonly precedingE2eSteps?: readonly E2ePickPrecedingStep[];
  readonly fallbackUrl?: string;
  readonly flowId?: string;
  readonly stepId?: string;
  readonly reuseSession?: boolean;
}

export interface E2ePickElementResult {
  readonly ok: boolean;
  readonly selector?: string;
  readonly error?: string;
  readonly cancelled?: boolean;
}

interface E2eServiceCtor {
  new (options?: { readonly partition?: string; readonly windowTitle?: string }): E2eServiceInstance;
}

interface E2eServiceModule extends E2eServiceInstance {
  readonly E2eService?: E2eServiceCtor;
}

interface E2eServiceInstance {
  execute(
    action: string,
    selector: string,
    value: string,
    timeout: number,
    show: boolean,
    sender: unknown,
    screenshotPath?: string,
    screenshotFileName?: string,
    ignoreInvalidSsl?: boolean,
  ): Promise<E2eExecuteResult>;
  clearRunnerSession(): Promise<void>;
  teardownHttpCaptures(): void;
  signalExecuteCancel(): void;
  acquireVisibleRunnerInputLock(): void;
  releaseVisibleRunnerInputLock(): void;
  resetVisibleRunnerInputLock(): void;
  prepareRunnerForElementPick(): void;
  /** Closes a crashed runner window so the next execute() can recreate it. */
  resetAfterFailure(): Promise<void>;
}

interface E2ePickElementModule {
  runPickElementSession: (payload: E2ePickElementPayload) => Promise<E2ePickElementResult>;
  closeActiveSession: () => Promise<void>;
}

/**
 * Thin TypeScript facade over the ported E2E runner.
 *
 * Interactive Test Suite runs share the module singleton. Isolated instances
 * (regression workers) each own a BrowserWindow and session partition.
 */
export class E2eRunnerService {
  private service: E2eServiceInstance | null = null;
  private pickModule: E2ePickElementModule | null = null;

  /**
   * @param isolated When true, creates a dedicated runner window instead of the shared singleton.
   */
  constructor(private readonly isolated = false) {}

  private getService(): E2eServiceInstance {
    if (this.service) {
      return this.service;
    }
    const loaded = requireE2e(path.join(e2eModuleDir(), 'e2e.service.js')) as E2eServiceModule;
    if (this.isolated && loaded.E2eService) {
      this.service = new loaded.E2eService({
        partition: `persist:testrix-e2e-runner-${randomUUID()}`,
        windowTitle: 'Testrix — E2E Runner',
      });
      return this.service;
    }
    this.service = loaded;
    return this.service;
  }

  private getPickModule(): E2ePickElementModule {
    this.pickModule ??= requireE2e(
      path.join(e2eModuleDir(), 'e2e-pick-element.service.js'),
    ) as E2ePickElementModule;
    return this.pickModule;
  }

  async execute(payload: E2eExecutePayload): Promise<E2eExecuteResult> {
    return this.getService().execute(
      payload.action,
      payload.selector,
      payload.value,
      payload.timeout,
      payload.show,
      null,
      payload.screenshotPath,
      payload.screenshotFileName,
      payload.ignoreInvalidSsl,
    );
  }

  async clearRunnerSession(): Promise<void> {
    await this.getService().clearRunnerSession();
  }

  teardownHttpCaptures(): void {
    this.getService().teardownHttpCaptures();
  }

  signalCancel(): void {
    this.getService().signalExecuteCancel();
  }

  /** Blocks OS pointer/keyboard on the visible E2E runner while a flow executes. */
  acquireVisibleInputLock(): void {
    this.getService().acquireVisibleRunnerInputLock();
  }

  /** Restores user interaction after {@link acquireVisibleInputLock}. */
  releaseVisibleInputLock(): void {
    this.getService().releaseVisibleRunnerInputLock();
  }

  /** Clears leftover input-lock so Pick on page can receive clicks. */
  resetVisibleInputLock(): void {
    this.getService().resetVisibleRunnerInputLock();
  }

  /** Shows the runner and clears stealth/input-lock before attaching the CSS picker. */
  prepareRunnerForElementPick(): void {
    this.getService().prepareRunnerForElementPick();
  }

  /**
   * Closes a dead runner window and CDP session so the next execute() opens a fresh window.
   */
  async resetAfterFailure(): Promise<void> {
    const service = this.getService();
    try {
      service.signalExecuteCancel();
    } catch {
      /* ignore */
    }
    try {
      service.teardownHttpCaptures();
    } catch {
      /* ignore */
    }
    if (typeof service.resetAfterFailure === 'function') {
      await service.resetAfterFailure();
      return;
    }
    await this.closeRunner().catch(() => undefined);
  }

  /** Cancels an in-flight Pick on page session if one is active. */
  async closePickSession(): Promise<void> {
    await this.getPickModule().closeActiveSession();
  }

  async closeRunner(): Promise<void> {
    await this.resetAfterFailure();
  }

  async pickElement(payload: E2ePickElementPayload): Promise<E2ePickElementResult> {
    return this.getPickModule().runPickElementSession(payload);
  }
}
