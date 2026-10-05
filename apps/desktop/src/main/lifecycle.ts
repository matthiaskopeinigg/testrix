import { appLogger } from '@testrix/electron-core';

/** A named quit step. Steps run in parallel; one failing never skips the others. */
export interface ShutdownStep {
  readonly name: string;
  readonly run: () => Promise<unknown> | unknown;
}

export interface ShutdownResult {
  readonly failed: readonly string[];
  readonly timedOut: readonly string[];
}

interface ShutdownLogger {
  error(scope: string, error: unknown): void;
  warn(scope: string, message: string): void;
}

/**
 * Runs every step, waiting at most `timeoutMs`. Failures and steps still pending at
 * the deadline are logged by name so a stuck quit can be diagnosed.
 */
export async function runShutdownSteps(
  steps: readonly ShutdownStep[],
  timeoutMs: number,
  logger: ShutdownLogger = appLogger,
): Promise<ShutdownResult> {
  const pending = new Set(steps.map((step) => step.name));
  const failed: string[] = [];
  const all = Promise.all(
    steps.map(async (step) => {
      try {
        await step.run();
      } catch (error) {
        failed.push(step.name);
        logger.error(`shutdown:${step.name}`, error);
      } finally {
        pending.delete(step.name);
      }
    }),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });
  const outcome = await Promise.race([all.then(() => 'done' as const), deadline]);
  clearTimeout(timer);
  const timedOut = outcome === 'timeout' ? [...pending] : [];
  if (timedOut.length > 0)
    logger.warn('shutdown', `Quit continued after ${timeoutMs} ms; still running: ${timedOut.join(', ')}`);
  return { failed, timedOut };
}

/**
 * Starts background work whose result nobody awaits, logging a rejection instead of
 * leaving it unhandled.
 */
export function detach(scope: string, task: Promise<unknown> | undefined | null, logger: ShutdownLogger = appLogger): void {
  task?.catch((error: unknown) => logger.error(scope, error));
}
