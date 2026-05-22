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
}

export interface E2ePickElementResult {
  readonly ok: boolean;
  readonly selector?: string;
  readonly error?: string;
  readonly cancelled?: boolean;
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
  ): Promise<E2eExecuteResult>;
  clearRunnerSession(): Promise<void>;
  teardownHttpCaptures(): void;
  signalExecuteCancel(): void;
  acquireVisibleRunnerInputLock(): void;
  releaseVisibleRunnerInputLock(): void;
}

interface E2ePickElementModule {
  runPickElementSession: (payload: E2ePickElementPayload) => Promise<E2ePickElementResult>;
}

/**
 * Thin TypeScript facade over the ported api-workbench E2E runner singleton.
 */
export class E2eRunnerService {
  private service: E2eServiceInstance | null = null;
  private pickModule: E2ePickElementModule | null = null;

  private getService(): E2eServiceInstance {
    this.service ??= requireE2e(path.join(e2eModuleDir(), 'e2e.service.js')) as E2eServiceInstance;
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

  async closeRunner(): Promise<void> {
    await this.execute({
      action: 'CLOSE',
      selector: '',
      value: '',
      timeout: 5000,
      show: false,
    });
  }

  async pickElement(payload: E2ePickElementPayload): Promise<E2ePickElementResult> {
    return this.getPickModule().runPickElementSession(payload);
  }
}
