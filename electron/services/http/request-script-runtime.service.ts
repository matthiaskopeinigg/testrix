import vm from 'node:vm';

import { TestrixError, ErrorCodes } from '../../../shared/errors';

const SCRIPT_TIMEOUT_MS = 5_000;

export interface ScriptRunContext {
  readonly variables: Record<string, string>;
  readonly environment: Record<string, string>;
  readonly collectionVariables: Record<string, string>;
  readonly response?: unknown;
}

export interface ScriptRunResult {
  readonly variables: Record<string, string>;
}

/**
 * Runs pre/post request scripts in an isolated vm context with a minimal `pm` API.
 */
export function runRequestScripts(
  sources: readonly string[],
  ctx: ScriptRunContext,
): ScriptRunResult {
  const variables = { ...ctx.variables };

  const pm = {
    variables: {
      get: (key: string) => variables[key],
      set: (key: string, value: string) => {
        variables[key] = value;
      },
    },
    environment: {
      get: (key: string) => ctx.environment[key],
      set: (key: string, value: string) => {
        ctx.environment[key] = value;
      },
    },
    collectionVariables: ctx.collectionVariables,
    response: ctx.response,
    test: (_name: string, fn: () => boolean) => {
      try {
        return fn();
      } catch {
        return false;
      }
    },
  };

  const sandbox: vm.Context = { pm, console };
  vm.createContext(sandbox);

  for (const source of sources) {
    const trimmed = source.trim();
    if (!trimmed) {
      continue;
    }
    try {
      vm.runInContext(trimmed, sandbox, { timeout: SCRIPT_TIMEOUT_MS });
    } catch (error: unknown) {
      throw new TestrixError(
        ErrorCodes.HTTP_SCRIPT_TIMEOUT,
        error instanceof Error ? error.message : 'Script execution failed',
      );
    }
  }

  return { variables };
}
