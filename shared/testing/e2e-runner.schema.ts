/** Payload for a single E2E browser action via IPC. */
export interface E2eExecutePayload {
  readonly action: string;
  readonly selector: string;
  readonly value: string;
  readonly timeout: number;
  readonly show: boolean;
  readonly screenshotPath?: string;
  readonly screenshotFileName?: string;
  /** When true, ignore TLS certificate errors in the E2E runner (test suite setting). */
  readonly ignoreInvalidSsl?: boolean;
}

/** Result from {@link E2eExecutePayload} execution. */
export interface E2eExecuteResult {
  readonly success: boolean;
  readonly error?: string;
  readonly data?: unknown;
}

/** Step replayed before element pick on the E2E runner window. */
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
