import { buildOutgoingRequest } from '../../../shared/http/build-outgoing-request';
import { buildManualOutgoingRequest } from '../../../shared/http/build-manual-outgoing-request';
import { sendHttpRequestPayloadSchema } from '../../../shared/http/outgoing-request.schema';
import { resolveTemplateVariables } from '../../../shared/dynamic-variables/template-variables';
import type { DatabaseConnection } from '../../../shared/config/database-settings.schema';
import type { SavedQueryTreeItem } from '../../../shared/database/saved-queries.schema';
import {
  buildFlowEnvironmentVariableContext,
  buildHttpCaptureFromE2eData,
  buildHttpCaptureRegisterSpec,
  resolveHttpInterceptorStepConfig,
  resolveHttpListenerStepConfig,
} from '../../../shared/testing/flow-http-middleware-config';
import {
  buildInitialFlowRunStatuses,
  buildDatabaseStepCapture,
  buildHttpResponseStepCapture,
  evaluateValidationRule,
  findFlowStepById,
  findTestSuiteFlowInTree,
  flattenEnabledFlowSteps,
  markRemainingFlowStepsSkipped,
  resolveE2eValidationSelector,
  resolveGlobalE2eScreenshotDirectory,
  resolveE2eUrlExpectation,
  resolveTestSuiteFlowEnvironmentId,
  resolveValidationActualValue,
  sanitizeValidationRulesForReferenceStepType,
  sanitizeCacheEntriesForReferenceStepType,
  resolveCacheEntryValue,
  isGeneratedCacheEntry,
  generatedCacheEntryTemplate,
  resolveDatabaseStepQueryBinding,
  cacheEntryExtractFailureMessage,
  validationFailureMessage,
  flowNeedsBrowserRunnerDeep,
  resolveTriggerTargetFlows,
  triggerFlowCycleMessage,
  stripFlowRunChildLogCaptures,
  rollupFlowRunChildStatus,
  type FlowRunChildLog,
  type FlowRunNestedChildren,
  type FlowRunProgressEvent,
  type FlowStepRunCapture,
  type TestSuiteAncestorFolderRef,
  type TestSuiteFlow,
  type TestSuiteFlowLocation,
  type TestSuiteFlowStep,
  type TestSuiteStepStatus,
  type TestSuiteTreeItem,
} from '../../../shared/testing';
import {
  type CacheStepConfig,
  type CacheStepEntry,
  type DatabaseStepConfig,
  type E2eStepConfig,
  type HttpInterceptorStepConfig,
  type HttpListenerStepConfig,
  type ManualStepConfig,
  type RequestStepConfig,
  triggerStepConfigSchema,
  type ValidationRule,
  type ValidationStepConfig,
  type WaitStepConfig,
} from '../../../shared/testing/test-suite-steps.schema';
import type { FlowManualInputRequest, FlowManualInputResult } from '../../../shared/testing/flow-manual-input.schema';
import { migrateTestSuitesFile } from '../../../shared/testing/test-suite-migrate';
import { TEST_SUITE_ROOT_ID } from '../../../shared/testing/test-suites.schema';

import { decryptBase64ToUtf8, encryptUtf8ToBase64 } from '../crypto/rsa-oaep-cipher';
import type { ConfigFileService } from '../config/config-file.service';
import { databaseQueryService } from '../database/database-query.service';
import { executeHttpRequest } from '../http/http-request-executor.service';
import type { E2eExecutePayload, E2eExecuteResult, E2eRunnerService } from './e2e-runner.service';

export interface TestSuiteFlowRunResult {
  readonly ok: boolean;
  readonly message: string;
  readonly stepStatuses: Readonly<Record<string, TestSuiteStepStatus>>;
  readonly stepCaptures: Readonly<Record<string, FlowStepRunCapture>>;
  readonly stepDurations: Readonly<Record<string, number>>;
  readonly stepErrors: Readonly<Record<string, string>>;
  readonly nestedChildren: FlowRunNestedChildren;
  readonly durationMs: number;
}

const DEFAULT_E2E_TIMEOUT_MS = 5000;
const DEFAULT_HTTP_CAPTURE_TIMEOUT_MS = 30_000;
const PAGE_URL_VALIDATION_TIMEOUT_MS = 30_000;

export type FlowRunProgressListener = (event: FlowRunProgressEvent) => void;

export interface TestSuiteFlowExecuteOptions {
  readonly environmentIdOverride?: string | null;
  readonly e2eShowWindowOverride?: boolean;
  readonly e2eKeepWindowOpenOverride?: boolean;
  /**
   * When set, run enabled steps before this id then stop (used by Pick on page
   * so REQUEST/CACHE/WAIT populate flow variables and navigate the browser).
   */
  readonly stopBeforeStepId?: string;
  readonly requestManualInput?: (request: FlowManualInputRequest) => Promise<FlowManualInputResult>;
}

/** Shared runtime for a root flow run and nested TRIGGER targets. */
interface FlowStepContext {
  readonly flowId: string;
  readonly requestManualInput?: (request: FlowManualInputRequest) => Promise<FlowManualInputResult>;
  readonly collections: readonly import('@shared/config').CollectionNode[];
  readonly http: import('@shared/config').HttpSettings;
  readonly environments: import('@shared/config').EnvironmentsFile;
  readonly databaseConnections: readonly DatabaseConnection[];
  readonly savedQueryNodes: readonly SavedQueryTreeItem[];
  readonly appVersion: string;
  readonly showBrowser: boolean;
  readonly e2eScreenshotFolder: string;
  readonly e2eIgnoreInvalidSsl: boolean;
  readonly environmentIdOverride?: string | null;
  readonly ancestorFolders: readonly TestSuiteAncestorFolderRef[];
  readonly environmentVariableKeys: import('@shared/http/collection-execution.schema').EnvironmentVariableKeyMode;
  readonly ancestorFlowIds: readonly string[];
  readonly suiteItems: readonly TestSuiteTreeItem[];
  /** True when the root run pinned `showBrowser` (always true for a flow run). */
  readonly showBrowserLocked: boolean;
  readonly reportProgress: () => void;
}

/**
 * Executes test suite flows with real HTTP for REQUEST steps and browser automation for E2E steps.
 */
export class TestSuiteFlowExecutor {
  private cancelled = false;
  private e2eRunner: E2eRunnerService | null = null;
  private readonly captures = new Map<string, FlowStepRunCapture>();
  private readonly flowVariables = new Map<string, string>();
  private readonly nestedChildrenByTriggerId = new Map<string, FlowRunChildLog[]>();
  private readonly activeInterceptorStepIds = new Set<string>();
  private browserSessionReady = false;

  setE2eRunner(runner: E2eRunnerService): void {
    this.e2eRunner = runner;
  }

  cancel(): void {
    this.cancelled = true;
    this.e2eRunner?.signalCancel();
  }

  async executeFlow(
    flowId: string,
    files: ConfigFileService,
    onProgress?: FlowRunProgressListener,
    options: TestSuiteFlowExecuteOptions = {},
  ): Promise<TestSuiteFlowRunResult> {
    this.cancelled = false;
    this.captures.clear();
    this.flowVariables.clear();
    this.nestedChildrenByTriggerId.clear();
    this.activeInterceptorStepIds.clear();
    this.browserSessionReady = false;

    const suiteItems = await this.loadSuiteItems(files);
    const flowLoaded = findTestSuiteFlowInTree(suiteItems, flowId);
    if (!flowLoaded) {
      return {
        ok: false,
        message: 'Flow not found.',
        stepStatuses: {},
        stepCaptures: {},
        stepDurations: {},
        stepErrors: {},
        nestedChildren: {},
        durationMs: 0,
      };
    }

    let flow = flowLoaded.flow;
    const ancestorFolders = flowLoaded.ancestorFolders;
    const pinnedEnvironmentId =
      options.environmentIdOverride !== undefined
        ? options.environmentIdOverride?.trim() || null
        : resolveTestSuiteFlowEnvironmentId(flow.environmentId, ancestorFolders);
    flow = { ...flow, environmentId: pinnedEnvironmentId };

    const steps = flattenEnabledFlowSteps(flow.nodes);
    if (steps.length === 0) {
      return {
        ok: false,
        message: 'No enabled steps to run.',
        stepStatuses: {},
        stepCaptures: {},
        stepDurations: {},
        stepErrors: {},
        nestedChildren: {},
        durationMs: 0,
      };
    }

    const needsBrowserRunner = flowNeedsBrowserRunnerDeep(steps, suiteItems, new Set([flow.id]));
    const showBrowserLocked = true;
    const showBrowser = options.e2eShowWindowOverride ?? flow.e2eShowWindow !== false;
    const keepBrowserOpen =
      options.e2eKeepWindowOpenOverride ?? flow.e2eKeepWindowOpen === true;
    const lockVisibleRunnerInput = needsBrowserRunner && showBrowser;

    if (needsBrowserRunner && !this.e2eRunner) {
      return {
        ok: false,
        message: 'E2E runner is not available.',
        stepStatuses: {},
        stepCaptures: {},
        stepDurations: {},
        stepErrors: {},
        nestedChildren: {},
        durationMs: 0,
      };
    }

    const stepStatuses: Record<string, TestSuiteStepStatus> = buildInitialFlowRunStatuses(
      steps.map((step) => step.id),
    );
    const stepDurations: Record<string, number> = {};
    const stepErrors: Record<string, string> = {};
    const flowStartedAt = Date.now();
    const emitProgress = (): void => {
      onProgress?.({
        flowId,
        stepStatuses: { ...stepStatuses },
        nestedChildren: this.snapshotNestedChildren(true),
      });
    };
    const snapshotCaptures = (): Record<string, FlowStepRunCapture> =>
      Object.fromEntries(this.captures.entries());
    const finish = (
      ok: boolean,
      message: string,
    ): TestSuiteFlowRunResult => ({
      ok,
      message,
      stepStatuses,
      stepCaptures: snapshotCaptures(),
      stepDurations,
      stepErrors,
      nestedChildren: this.snapshotNestedChildren(false),
      durationMs: Date.now() - flowStartedAt,
    });

    emitProgress();

    if (lockVisibleRunnerInput && this.e2eRunner) {
      this.e2eRunner.acquireVisibleInputLock();
    }

    const [collections, settings, environments, savedQueries] = await Promise.all([
      files.readCollections(),
      files.readSettings(),
      files.readEnvironments(),
      files.readSavedQueries(),
    ]);

    try {
      for (let index = 0; index < steps.length; index++) {
        const step = steps[index]!;
        if (options.stopBeforeStepId && step.id === options.stopBeforeStepId) {
          markRemainingFlowStepsSkipped(stepStatuses, steps, index);
          emitProgress();
          return finish(true, `Prepared flow through step before "${step.name}".`);
        }
        if (this.cancelled) {
          if (stepStatuses[step.id] === 'running') {
            stepStatuses[step.id] = 'failed';
            stepErrors[step.id] = 'Run cancelled.';
          }
          markRemainingFlowStepsSkipped(stepStatuses, steps, index);
          emitProgress();
          return finish(false, 'Run cancelled.');
        }

        if (index > 0) {
          stepStatuses[step.id] = 'running';
          emitProgress();
        }

        const stepStartedAt = Date.now();
        try {
          await this.executeStep(step, flow, {
            flowId: flow.id,
            requestManualInput: options.requestManualInput,
            collections: collections.nodes,
            http: settings.http,
            environments,
            databaseConnections: settings.databases.connections,
            savedQueryNodes: savedQueries.nodes,
            appVersion: '0.0.0',
            showBrowser,
            e2eScreenshotFolder: settings.http.testing.e2eScreenshotFolder,
            e2eIgnoreInvalidSsl: settings.testSuite.e2eIgnoreInvalidSsl === true,
            environmentIdOverride: pinnedEnvironmentId,
            ancestorFolders,
            environmentVariableKeys: {
              useFolderPathInKeys: settings.environments.useFolderPathInKeys,
            },
            ancestorFlowIds: [flow.id],
            suiteItems,
            showBrowserLocked,
            reportProgress: emitProgress,
          });
          await this.refreshPendingInterceptorCaptures(showBrowser);
          stepDurations[step.id] = Date.now() - stepStartedAt;
      stepStatuses[step.id] = 'passed';
          emitProgress();
        } catch (error: unknown) {
          stepDurations[step.id] = Date.now() - stepStartedAt;
          stepStatuses[step.id] = 'failed';
          const message = error instanceof Error ? error.message : 'Step failed';
          stepErrors[step.id] = message;
          markRemainingFlowStepsSkipped(stepStatuses, steps, index);
          emitProgress();
          return finish(false, `${step.name}: ${message}`);
        }
      }

      return finish(true, `Flow "${flow.name}" completed.`);
    } finally {
      if (lockVisibleRunnerInput && this.e2eRunner) {
        this.e2eRunner.releaseVisibleInputLock();
      }
      if (this.e2eRunner && this.browserSessionReady && !options.stopBeforeStepId) {
        this.e2eRunner.teardownHttpCaptures();
      }
      const keepOpen = keepBrowserOpen || Boolean(options.stopBeforeStepId);
      if (this.e2eRunner && this.browserSessionReady && !keepOpen) {
        await this.e2eRunner.closeRunner().catch(() => undefined);
      }
      if (!options.stopBeforeStepId) {
        this.browserSessionReady = false;
      }
    }
  }

  /** Loads the suite tree used to resolve TRIGGER targets and the current flow. */
  private async loadSuiteItems(files: ConfigFileService): Promise<readonly TestSuiteTreeItem[]> {
    const raw = await files.readTestSuites();
    const file = migrateTestSuitesFile(raw);
    const root = file.suites.find((s) => s.id === TEST_SUITE_ROOT_ID) ?? file.suites[0];
    return root?.flows ?? [];
  }

  private async executeStep(
    step: TestSuiteFlowStep,
    flow: TestSuiteFlow,
    ctx: FlowStepContext,
  ): Promise<void> {
    switch (step.stepType) {
      case 'REQUEST':
        await this.executeRequest(step, flow, ctx);
        return;
      case 'WAIT':
        await this.executeWait(step);
        return;
      case 'VALIDATION':
        await this.executeValidation(step, flow, ctx);
        return;
      case 'CACHE':
        await this.executeCache(step, flow, ctx);
        return;
      case 'E2E':
        await this.executeE2e(step, flow, ctx);
        return;
      case 'HTTP_LISTENER':
        await this.executeHttpListener(step, flow, ctx);
        return;
      case 'HTTP_INTERCEPTOR':
        await this.executeHttpInterceptor(step, flow, ctx);
        return;
      case 'DATABASE':
        await this.executeDatabase(step, flow, ctx);
        return;
      case 'MANUAL':
        await this.executeManual(step, ctx);
        return;
      case 'TRIGGER':
        await this.executeTrigger(step, ctx);
        return;
      default:
        throw new Error(`Unknown step type: ${step.stepType}`);
    }
  }

  /**
   * Runs another flow or every descendant flow under a folder on this executor
   * (shared captures and variables; no nested teardown).
   */
  private async executeTrigger(step: TestSuiteFlowStep, ctx: FlowStepContext): Promise<void> {
    const parsed = triggerStepConfigSchema.safeParse(step.config ?? {});
    const target = parsed.success
      ? { targetType: parsed.data.targetType, targetId: parsed.data.targetId }
      : { targetType: 'flow' as const, targetId: '' };
    const reuseE2eSession = parsed.success ? parsed.data.reuseE2eSession !== false : true;
    const resolved = resolveTriggerTargetFlows(ctx.suiteItems, target);
    if (!resolved.ok) {
      throw new Error(resolved.message);
    }

    const children: FlowRunChildLog[] = [];
    this.nestedChildrenByTriggerId.set(step.id, children);
    const groupByFlow = resolved.locations.length > 1;

    for (const location of resolved.locations) {
      const cycle = triggerFlowCycleMessage(ctx.ancestorFlowIds, location.flow.id, location.flow.name);
      if (cycle) {
        throw new Error(cycle);
      }
      if (!reuseE2eSession) {
        await this.resetBrowserSessionForIsolatedTrigger();
      }

      if (groupByFlow) {
        const groupId = `flow:${location.flow.id}`;
        const publishGroup = (patch: Partial<FlowRunChildLog> & Pick<FlowRunChildLog, 'status'>): void => {
          const index = children.findIndex((entry) => entry.id === groupId);
          const current = index >= 0 ? children[index]! : undefined;
          const next: FlowRunChildLog = {
            kind: 'flow',
            id: groupId,
            flowId: location.flow.id,
            flowName: location.flow.name,
            name: location.flow.name,
            status: patch.status,
            error: patch.error ?? current?.error,
            durationMs: patch.durationMs ?? current?.durationMs,
            children: patch.children ?? current?.children ?? [],
          };
          if (index >= 0) {
            children[index] = next;
          } else {
            children.push(next);
          }
          ctx.reportProgress();
        };
        publishGroup({ status: 'running', children: [] });
        try {
          const logs = await this.runNestedFlow(location, ctx, (nestedLogs) => {
            publishGroup({
              status: rollupFlowRunChildStatus(nestedLogs),
              children: nestedLogs,
            });
          });
          publishGroup({
            status: rollupFlowRunChildStatus(logs),
            children: logs,
          });
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Step failed';
          const index = children.findIndex((entry) => entry.id === groupId);
          publishGroup({
            status: 'failed',
            error: message,
            children: index >= 0 ? children[index]?.children : [],
          });
          throw error;
        }
        continue;
      }

      await this.runNestedFlow(location, ctx, (logs) => {
        children.splice(0, children.length, ...logs);
        ctx.reportProgress();
      });
    }
  }

  /** Executes a triggered flow without resetting or tearing down the parent run. */
  private async runNestedFlow(
    location: TestSuiteFlowLocation,
    parentCtx: FlowStepContext,
    onLogs: (logs: readonly FlowRunChildLog[]) => void,
  ): Promise<FlowRunChildLog[]> {
    let flow = location.flow;
    if (parentCtx.environmentIdOverride !== undefined) {
      flow = { ...flow, environmentId: parentCtx.environmentIdOverride };
    }
    const steps = flattenEnabledFlowSteps(flow.nodes);
    if (steps.length === 0) {
      throw new Error(`Flow "${flow.name}" has no enabled steps to run.`);
    }
    if (
      flowNeedsBrowserRunnerDeep(steps, parentCtx.suiteItems, new Set(parentCtx.ancestorFlowIds)) &&
      !this.e2eRunner
    ) {
      throw new Error('E2E runner is not available.');
    }

    const ctx: FlowStepContext = {
      ...parentCtx,
      flowId: flow.id,
      ancestorFolders: location.ancestorFolders,
      ancestorFlowIds: [...parentCtx.ancestorFlowIds, flow.id],
      showBrowser: parentCtx.showBrowser,
    };

    const logs: FlowRunChildLog[] = steps.map((nestedStep) =>
      this.createWaitingNestedStepLog(flow, nestedStep),
    );
    onLogs(logs);

    for (let index = 0; index < steps.length; index++) {
      const nestedStep = steps[index]!;
      if (this.cancelled) {
        logs[index] = { ...logs[index]!, status: 'failed', error: 'Run cancelled.' };
        for (let rest = index + 1; rest < logs.length; rest++) {
          logs[rest] = { ...logs[rest]!, status: 'skipped' };
        }
        onLogs(logs);
        throw new Error('Run cancelled.');
      }

      logs[index] = { ...logs[index]!, status: 'running' };
      onLogs(logs);
      const stepStartedAt = Date.now();
      try {
        await this.executeStep(nestedStep, flow, ctx);
        await this.refreshPendingInterceptorCaptures(ctx.showBrowser);
        const nested = this.nestedChildrenByTriggerId.get(nestedStep.id);
        logs[index] = {
          ...logs[index]!,
          status: 'passed',
          durationMs: Date.now() - stepStartedAt,
          lastRunCapture: this.captures.get(nestedStep.id) ?? null,
          ...(nested && nested.length > 0 ? { children: nested } : {}),
        };
        onLogs(logs);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Step failed';
        const nested = this.nestedChildrenByTriggerId.get(nestedStep.id);
        logs[index] = {
          ...logs[index]!,
          status: 'failed',
          durationMs: Date.now() - stepStartedAt,
          error: message,
          lastRunCapture: this.captures.get(nestedStep.id) ?? null,
          ...(nested && nested.length > 0 ? { children: nested } : {}),
        };
        for (let rest = index + 1; rest < logs.length; rest++) {
          logs[rest] = { ...logs[rest]!, status: 'skipped' };
        }
        onLogs(logs);
        throw new Error(`${flow.name} / ${nestedStep.name}: ${message}`);
      }
    }
    return logs;
  }

  /** Snapshot of TRIGGER → nested run children for progress or the final result. */
  private snapshotNestedChildren(stripCaptures: boolean): FlowRunNestedChildren {
    const entries = [...this.nestedChildrenByTriggerId.entries()].map(([id, children]) => [
      id,
      stripCaptures ? stripFlowRunChildLogCaptures(children) : children,
    ] as const);
    return Object.fromEntries(entries);
  }

  /** Builds a waiting nested step row for the run log. */
  private createWaitingNestedStepLog(
    flow: TestSuiteFlow,
    step: TestSuiteFlowStep,
  ): FlowRunChildLog {
    return {
      kind: 'step',
      id: step.id,
      flowId: flow.id,
      flowName: flow.name,
      name: step.name.trim() || step.stepType,
      stepType: step.stepType,
      status: 'waiting',
    };
  }

  private buildVariableContext(
    flow: TestSuiteFlow,
    environments: import('@shared/config').EnvironmentsFile,
    environmentIdOverride: string | null | undefined,
    ancestorFolders: readonly TestSuiteAncestorFolderRef[],
    environmentVariableKeys: import('@shared/http/collection-execution.schema').EnvironmentVariableKeyMode,
  ): Record<string, string> {
    const env = buildFlowEnvironmentVariableContext(
      flow,
      environments,
      environmentIdOverride,
      environmentVariableKeys,
      ancestorFolders,
    );
    return { ...env, ...this.snapshotFlowVariables() };
  }

  /** Copies CACHE / MANUAL / DATABASE aliases for template resolution. */
  private snapshotFlowVariables(): Record<string, string> {
    return Object.fromEntries(this.flowVariables);
  }

  private resolveFlowTemplate(
    template: string,
    flow: TestSuiteFlow,
    environments: import('@shared/config').EnvironmentsFile,
    environmentIdOverride: string | null | undefined,
    ancestorFolders: readonly TestSuiteAncestorFolderRef[],
    environmentVariableKeys: import('@shared/http/collection-execution.schema').EnvironmentVariableKeyMode,
  ): string {
    return resolveTemplateVariables(template, {
      environment: this.buildVariableContext(
        flow,
        environments,
        environmentIdOverride,
        ancestorFolders,
        environmentVariableKeys,
      ),
    });
  }

  private async executeDatabase(
    step: TestSuiteFlowStep,
    flow: TestSuiteFlow,
    ctx: {
      readonly environments: import('@shared/config').EnvironmentsFile;
      readonly databaseConnections: readonly DatabaseConnection[];
      readonly savedQueryNodes: readonly SavedQueryTreeItem[];
      readonly environmentIdOverride?: string | null;
      readonly ancestorFolders: readonly TestSuiteAncestorFolderRef[];
      readonly environmentVariableKeys: import('@shared/http/collection-execution.schema').EnvironmentVariableKeyMode;
    },
  ): Promise<void> {
    const cfg = step.config as DatabaseStepConfig;
    const binding = resolveDatabaseStepQueryBinding(cfg, ctx.savedQueryNodes);
    const connectionId = binding.connectionId;
    if (!connectionId) {
      throw new Error('DATABASE step needs a connection.');
    }

    const connection = ctx.databaseConnections.find((entry) => entry.id === connectionId);
    if (!connection) {
      throw new Error(`Unknown database connection id: ${connectionId}`);
    }

    const query = this.resolveFlowTemplate(
      binding.query,
      flow,
      ctx.environments,
      ctx.environmentIdOverride,
      ctx.ancestorFolders,
      ctx.environmentVariableKeys,
    ).trim();
    if (!query) {
      throw new Error('DATABASE step needs a query.');
    }

    const stepTimeoutMs = resolveTimeoutMs(cfg.timeoutMs, 0) || undefined;
    const rows = await databaseQueryService.query(connection, query, { stepTimeoutMs });
    const textOut =
      typeof rows === 'string' ? rows : JSON.stringify(rows ?? null, null, 2);

    const alias = this.resolveFlowTemplate(
      String(cfg.cacheAs ?? ''),
      flow,
      ctx.environments,
      ctx.environmentIdOverride,
      ctx.ancestorFolders,
      ctx.environmentVariableKeys,
    ).trim();
    if (alias) {
      this.flowVariables.set(alias, textOut);
    }

    this.captures.set(step.id, buildDatabaseStepCapture(textOut));
  }

  /**
   * Drops the current E2E window and cookies so a TRIGGER with reuse disabled
   * starts from a clean browser session.
   */
  private async resetBrowserSessionForIsolatedTrigger(): Promise<void> {
    this.browserSessionReady = false;
    const runner = this.e2eRunner;
    if (!runner) {
      return;
    }
    await runner.closeRunner().catch(() => undefined);
    await runner.clearRunnerSession();
  }

  private async ensureBrowserSession(): Promise<void> {
    const runner = this.e2eRunner;
    if (!runner) {
      throw new Error('E2E runner is not available.');
    }
    if (this.browserSessionReady) {
      return;
    }
    await runner.clearRunnerSession();
    this.browserSessionReady = true;
  }

  private async startHttpCapture(
    registerSpec: Record<string, unknown>,
    showBrowser: boolean,
    timeoutMs: number,
  ): Promise<void> {
    await this.ensureBrowserSession();
    const runner = this.e2eRunner;
    if (!runner) {
      throw new Error('E2E runner is not available.');
    }

    const registerResult = await runner.execute({
      action: 'START_HTTP_CAPTURE',
      selector: '',
      value: JSON.stringify(registerSpec),
      timeout: timeoutMs,
      show: showBrowser,
    });
    if (!registerResult.success) {
      throw new Error(registerResult.error || 'Failed to register HTTP capture.');
    }
  }

  private async waitForHttpCapture(
    listenerId: string,
    showBrowser: boolean,
    timeoutMs: number,
  ): Promise<unknown> {
    const runner = this.e2eRunner;
    if (!runner) {
      throw new Error('E2E runner is not available.');
    }

    const waitResult = await runner.execute({
      action: 'WAIT_FOR_HTTP_CAPTURE',
      selector: listenerId,
      value: '',
      timeout: timeoutMs,
      show: showBrowser,
    });
    if (!waitResult.success) {
      throw new Error(waitResult.error || 'Timed out waiting for matching HTTP traffic.');
    }
    return waitResult.data;
  }

  private async executeHttpListener(
    step: TestSuiteFlowStep,
    flow: TestSuiteFlow,
    ctx: {
      readonly environments: import('@shared/config').EnvironmentsFile;
      readonly showBrowser: boolean;
      readonly environmentIdOverride?: string | null;
      readonly ancestorFolders: readonly TestSuiteAncestorFolderRef[];
      readonly environmentVariableKeys: import('@shared/http/collection-execution.schema').EnvironmentVariableKeyMode;
    },
  ): Promise<void> {
    const variableContext = this.buildVariableContext(
      flow,
      ctx.environments,
      ctx.environmentIdOverride,
      ctx.ancestorFolders,
      ctx.environmentVariableKeys,
    );
    const cfg = resolveHttpListenerStepConfig(step.config as HttpListenerStepConfig, variableContext);
    const urlPattern = String(cfg.urlPattern ?? '').trim();
    if (!urlPattern) {
      throw new Error('HTTP Listener needs a URL pattern.');
    }

    const timeoutMs = resolveTimeoutMs(cfg.timeout, DEFAULT_HTTP_CAPTURE_TIMEOUT_MS);
    const registerSpec = buildHttpCaptureRegisterSpec(step.id, cfg, false);

    await this.startHttpCapture(registerSpec, ctx.showBrowser, timeoutMs);
    const captureData = await this.waitForHttpCapture(step.id, ctx.showBrowser, timeoutMs);
    this.captures.set(step.id, buildHttpCaptureFromE2eData(captureData));
  }

  private async executeHttpInterceptor(
    step: TestSuiteFlowStep,
    flow: TestSuiteFlow,
    ctx: {
      readonly environments: import('@shared/config').EnvironmentsFile;
      readonly showBrowser: boolean;
      readonly environmentIdOverride?: string | null;
      readonly ancestorFolders: readonly TestSuiteAncestorFolderRef[];
      readonly environmentVariableKeys: import('@shared/http/collection-execution.schema').EnvironmentVariableKeyMode;
    },
  ): Promise<void> {
    const variableContext = this.buildVariableContext(
      flow,
      ctx.environments,
      ctx.environmentIdOverride,
      ctx.ancestorFolders,
      ctx.environmentVariableKeys,
    );
    const cfg = resolveHttpInterceptorStepConfig(
      step.config as HttpInterceptorStepConfig,
      variableContext,
    );
    const urlPattern = String(cfg.urlPattern ?? '').trim();
    if (!urlPattern) {
      throw new Error('HTTP Interceptor needs a URL pattern.');
    }

    const timeoutMs = resolveTimeoutMs(cfg.timeout, DEFAULT_HTTP_CAPTURE_TIMEOUT_MS);
    const registerSpec = buildHttpCaptureRegisterSpec(step.id, cfg, true);
    await this.startHttpCapture(registerSpec, ctx.showBrowser, timeoutMs);
    this.activeInterceptorStepIds.add(step.id);
  }

  private async refreshPendingInterceptorCaptures(showBrowser: boolean): Promise<void> {
    if (!this.browserSessionReady || !this.e2eRunner || this.activeInterceptorStepIds.size === 0) {
      return;
    }

    for (const stepId of this.activeInterceptorStepIds) {
      const existing = this.captures.get(stepId);
      if (existing?.kind === 'http_response' && existing.statusCode > 0) {
        continue;
      }

      const peekResult = await this.e2eRunner.execute({
        action: 'PEEK_HTTP_CAPTURE',
        selector: stepId,
        value: '',
        timeout: 0,
        show: showBrowser,
      });
      if (peekResult.success && peekResult.data) {
        this.captures.set(stepId, buildHttpCaptureFromE2eData(peekResult.data));
      }
    }
  }

  private async resolveInterceptorReferenceCapture(
    refStep: TestSuiteFlowStep,
    refId: string,
    showBrowser: boolean,
    existing: FlowStepRunCapture | undefined,
  ): Promise<FlowStepRunCapture> {
    if (existing?.kind === 'http_response' && existing.statusCode > 0) {
      return existing;
    }

    const cfg = refStep.config as HttpInterceptorStepConfig;
    const timeoutMs = resolveTimeoutMs(cfg.timeout, DEFAULT_HTTP_CAPTURE_TIMEOUT_MS);
    const captureData = await this.waitForHttpCapture(refId, showBrowser, timeoutMs);
    const capture = buildHttpCaptureFromE2eData(captureData);
    this.captures.set(refId, capture);
    this.activeInterceptorStepIds.delete(refId);
    return capture;
  }

  private async executeE2e(
    step: TestSuiteFlowStep,
    flow: TestSuiteFlow,
    ctx: {
      readonly environments: import('@shared/config').EnvironmentsFile;
      readonly showBrowser: boolean;
      readonly e2eScreenshotFolder: string;
      readonly e2eIgnoreInvalidSsl: boolean;
      readonly environmentIdOverride?: string | null;
      readonly ancestorFolders: readonly TestSuiteAncestorFolderRef[];
      readonly environmentVariableKeys: import('@shared/http/collection-execution.schema').EnvironmentVariableKeyMode;
    },
  ): Promise<void> {
    await this.ensureBrowserSession();
    const runner = this.e2eRunner;
    if (!runner) {
      throw new Error('E2E runner is not available.');
    }

    const config = step.config as E2eStepConfig;
    let action = String(config.action ?? 'NAVIGATE_TO');
    if (action === 'OPEN_PAGE') {
      action = 'NAVIGATE_TO';
    }
    if (action === 'MOVE_TO') {
      action = 'HOVER';
    }

    const resolve = (raw: string): string =>
      this.resolveFlowTemplate(
        raw,
        flow,
        ctx.environments,
        ctx.environmentIdOverride,
        ctx.ancestorFolders,
        ctx.environmentVariableKeys,
      );

    const selector = resolve(String(config.selector ?? ''));
    const value = resolve(String(config.value ?? ''));
    const timeout = resolveTimeoutMs(config.timeout, DEFAULT_E2E_TIMEOUT_MS);

    const urlExpectation =
      action === 'ASSERT_URL' || action === 'WAIT_FOR_URL'
        ? resolveE2eUrlExpectation(selector, value)
        : selector;

    const payload = {
      action,
      selector: urlExpectation,
      value,
      timeout,
      show: ctx.showBrowser,
      ignoreInvalidSsl: ctx.e2eIgnoreInvalidSsl,
    } as {
      action: string;
      selector: string;
      value: string;
      timeout: number;
      show: boolean;
      ignoreInvalidSsl: boolean;
      screenshotPath?: string;
      screenshotFileName?: string;
    };

    if (action === 'SCREENSHOT') {
      payload.screenshotPath =
        resolveGlobalE2eScreenshotDirectory(ctx.e2eScreenshotFolder, flow) ??
        resolve(String(config.screenshotPath ?? '')).trim();
      payload.screenshotFileName = resolve(String(config.screenshotFileName ?? '')).trim();
    }

    const result = await runner.execute(payload);
    if (!result.success) {
      throw new Error(result.error || `E2E [${action}] failed`);
    }
    try {
      this.captures.set(
        step.id,
        await this.buildE2eStepCapture(step, action, payload.selector, result, ctx.showBrowser),
      );
    } catch (captureError: unknown) {
      this.captures.set(step.id, this.buildFallbackE2eCapture(step, action, payload.selector));
      console.warn(
        '[FlowExecutor] E2E step succeeded but capture failed:',
        captureError instanceof Error ? captureError.message : captureError,
      );
    }
  }

  /** Minimal capture when post-step READ fails (e.g. consent banner removed after click). */
  private buildFallbackE2eCapture(
    step: TestSuiteFlowStep,
    action: string,
    selector: string,
  ): FlowStepRunCapture {
    return {
      kind: 'e2e_element',
      capturedAt: new Date().toISOString(),
      action,
      selector,
      pageUrl: '',
      elementText: '',
      elementHtml: '',
      elementExists: action === 'CLICK' || action === 'ASSERT_ELEMENT',
    };
  }

  private async safeE2eRunnerExecute(
    runner: E2eRunnerService,
    payload: E2eExecutePayload,
  ): Promise<E2eExecuteResult | null> {
    try {
      return await runner.execute(payload);
    } catch {
      return null;
    }
  }

  /** Actions where the target node is often removed or navigated away immediately after success. */
  private e2eActionSkipsPostDomRead(action: string): boolean {
    return (
      action === 'CLICK' ||
      action === 'NAVIGATE_TO' ||
      action === 'SCREENSHOT' ||
      action === 'WAIT' ||
      action === 'ASSERT_URL' ||
      action === 'WAIT_FOR_URL'
    );
  }

  private async readCurrentPageUrl(
    runner: E2eRunnerService,
    showBrowser: boolean,
  ): Promise<string> {
    const urlResult = await this.safeE2eRunnerExecute(runner, {
      action: 'GET_CURRENT_URL',
      selector: '',
      value: '',
      timeout: 3000,
      show: showBrowser,
    });
    if (urlResult?.success && urlResult.data && typeof urlResult.data === 'object') {
      const url = String((urlResult.data as { url?: string }).url ?? '').trim();
      if (url && url !== 'about:blank' && !url.startsWith('chrome-error://')) {
        return url;
      }
    }
    return '';
  }

  private async resolveE2eCapturePageUrl(
    runner: E2eRunnerService,
    _action: string,
    showBrowser: boolean,
    _stepTimeoutMs: number,
  ): Promise<string> {
    return this.readCurrentPageUrl(runner, showBrowser);
  }

  /**
   * Page URL redirect checks read the live browser URL when the validation step runs,
   * not the URL cached when the reference E2E step completed.
   */
  private async waitForLivePageUrlForRules(
    rules: readonly ValidationRule[],
    showBrowser: boolean,
  ): Promise<string> {
    const runner = this.e2eRunner;
    if (!runner || !this.browserSessionReady) {
      throw new Error('Browser session is not available for page URL validation.');
    }

    const pageUrlRules = rules.filter((rule) => rule.source === 'e2e_page_url');
    const waitRule = pageUrlRules.find(
      (rule) => rule.operator === 'equals' || rule.operator === 'contains',
    );

    if (!waitRule) {
      return this.readCurrentPageUrl(runner, showBrowser);
    }

    const current = await this.readCurrentPageUrl(runner, showBrowser);
    if (current && pageUrlRules.every((rule) => evaluateValidationRule(rule, current))) {
      return current;
    }

    const waitResult = await this.safeE2eRunnerExecute(runner, {
      action: 'WAIT_FOR_PAGE_URL',
      selector: waitRule.expected ?? '',
      value: JSON.stringify({ operator: waitRule.operator }),
      timeout: PAGE_URL_VALIDATION_TIMEOUT_MS,
      show: showBrowser,
    });

    if (
      waitResult?.success &&
      waitResult.data &&
      typeof waitResult.data === 'object' &&
      typeof (waitResult.data as { url?: string }).url === 'string'
    ) {
      return String((waitResult.data as { url: string }).url);
    }

    return this.readCurrentPageUrl(runner, showBrowser);
  }

  private async resolveValidationReferenceCapture(
    refStep: TestSuiteFlowStep,
    refId: string,
    rules: readonly ValidationRule[],
    showBrowser: boolean,
  ): Promise<FlowStepRunCapture> {
    let capture = this.captures.get(refId);

    if (refStep.stepType === 'HTTP_INTERCEPTOR') {
      capture = await this.resolveInterceptorReferenceCapture(refStep, refId, showBrowser, capture);
    }

    if (!capture) {
      throw new Error(
        `Reference step "${refStep.name}" has no capture yet. Run the flow from the start so the step executes first.`,
      );
    }

    const needsLivePageUrl =
      refStep.stepType === 'E2E' && rules.some((rule) => rule.source === 'e2e_page_url');

    if (!needsLivePageUrl || capture.kind !== 'e2e_element') {
      return capture;
    }

    const liveUrl = await this.waitForLivePageUrlForRules(rules, showBrowser);
    const refreshed: FlowStepRunCapture = {
      ...capture,
      pageUrl: liveUrl,
      capturedAt: new Date().toISOString(),
    };
    this.captures.set(refId, refreshed);
    return refreshed;
  }

  private async buildE2eStepCapture(
    step: TestSuiteFlowStep,
    action: string,
    selector: string,
    result: { readonly data?: unknown },
    showBrowser: boolean,
  ): Promise<FlowStepRunCapture> {
    const runner = this.e2eRunner;
    const config = step.config as E2eStepConfig;
    let elementText = '';
    let elementHtml = '';
    let elementExists = false;
    let pageUrl = '';

    if (runner) {
      const stepTimeout = resolveTimeoutMs(config.timeout, DEFAULT_E2E_TIMEOUT_MS);
      pageUrl = await this.resolveE2eCapturePageUrl(runner, action, showBrowser, stepTimeout);
    }

    if (
      !pageUrl &&
      (action === 'NAVIGATE_TO' || action === 'ASSERT_URL' || action === 'WAIT_FOR_URL')
    ) {
      pageUrl = String(config.value ?? '').trim();
    }

    if (action === 'CLICK') {
      elementExists = true;
    }

    if (runner && selector.trim() && !this.e2eActionSkipsPostDomRead(action)) {
      const textResult = await this.safeE2eRunnerExecute(runner, {
        action: 'READ_ELEMENT_DOM',
        selector,
        value: '{}',
        timeout: 5000,
        show: showBrowser,
      });
      if (textResult?.success && textResult.data && typeof textResult.data === 'object') {
        const data = textResult.data as { text?: string };
        elementText = String(data.text ?? '');
        elementExists = elementText.length > 0 || selector.trim().length > 0;
      }

      const htmlResult = await this.safeE2eRunnerExecute(runner, {
        action: 'READ_ELEMENT_DOM',
        selector,
        value: JSON.stringify({ prop: 'innerHTML' }),
        timeout: 5000,
        show: showBrowser,
      });
      if (htmlResult?.success && htmlResult.data && typeof htmlResult.data === 'object') {
        const data = htmlResult.data as { text?: string };
        elementHtml = String(data.text ?? '');
        elementExists = elementExists || elementHtml.length > 0;
      }
    }

    if (result.data && typeof result.data === 'object') {
      const data = result.data as { exists?: boolean; text?: string };
      if (typeof data.exists === 'boolean') {
        elementExists = data.exists;
      }
      if (typeof data.text === 'string' && data.text.length > 0) {
        elementText = data.text;
      }
    }

    return {
      kind: 'e2e_element',
      capturedAt: new Date().toISOString(),
      action,
      selector,
      pageUrl,
      elementText,
      elementHtml,
      elementExists,
    };
  }

  private async executeRequest(
    step: TestSuiteFlowStep,
    flow: TestSuiteFlow,
    ctx: {
      readonly collections: readonly import('@shared/config').CollectionNode[];
      readonly http: import('@shared/config').HttpSettings;
      readonly environments: import('@shared/config').EnvironmentsFile;
      readonly appVersion: string;
      readonly environmentIdOverride?: string | null;
      readonly ancestorFolders: readonly TestSuiteAncestorFolderRef[];
      readonly environmentVariableKeys: import('@shared/http/collection-execution.schema').EnvironmentVariableKeyMode;
    },
  ): Promise<void> {
    const cfg = step.config as RequestStepConfig;

    if (cfg.collectionRequestId) {
      const built = buildOutgoingRequest({
        requestId: cfg.collectionRequestId,
        nodes: [...ctx.collections],
        http: ctx.http,
        environments: ctx.environments,
        appVersion: ctx.appVersion,
        runScope: {
          runId: `flow-${step.id}`,
          sharedVariables: this.snapshotFlowVariables(),
        },
        environmentVariableKeys: ctx.environmentVariableKeys,
        environmentIdOverride: ctx.environmentIdOverride ?? '',
      });
      if (!built) {
        throw new Error('Collection request not found.');
      }
      const payload = sendHttpRequestPayloadSchema.parse({
        ...built.outgoing,
        runScope: { runId: `flow-${step.id}` },
      });
      const { snapshot } = await executeHttpRequest(payload);
      this.captures.set(step.id, buildHttpResponseStepCapture(snapshot));
      return;
    }

    const variableContext = this.buildVariableContext(
      flow,
      ctx.environments,
      ctx.environmentIdOverride,
      ctx.ancestorFolders,
      ctx.environmentVariableKeys,
    );

    const built = buildManualOutgoingRequest({
      loadTestId: `flow-${step.id}`,
      manual: cfg,
      http: ctx.http,
      variableContext,
    });
    if (!built) {
      throw new Error('REQUEST step needs a URL or collection request.');
    }

    const payload = sendHttpRequestPayloadSchema.parse({
      ...built.outgoing,
      runScope: { runId: `flow-${step.id}` },
    });

    const { snapshot } = await executeHttpRequest(payload);
    this.captures.set(step.id, buildHttpResponseStepCapture(snapshot));
  }

  private async executeWait(step: TestSuiteFlowStep): Promise<void> {
    const cfg = step.config as WaitStepConfig;
    const ms = Number(cfg.durationMs) || 1000;
    await sleep(ms);
  }

  private async executeManual(
    step: TestSuiteFlowStep,
    ctx: {
      readonly flowId: string;
      readonly requestManualInput?: (request: FlowManualInputRequest) => Promise<FlowManualInputResult>;
    },
  ): Promise<void> {
    const cfg = step.config as ManualStepConfig;
    const variableName = String(cfg.variableName ?? '').trim() || 'userInput';
    const prompt = String(cfg.prompt ?? '').trim() || 'Please enter value:';

    if (!ctx.requestManualInput) {
      throw new Error('Manual input requires an interactive flow run.');
    }

    if (this.cancelled) {
      throw new Error('Run cancelled.');
    }

    const timeoutMs = resolveTimeoutMs(cfg.timeout, 0) || undefined;
    const result = await ctx.requestManualInput({
      flowId: ctx.flowId,
      stepId: step.id,
      stepName: step.name,
      prompt,
      variableName,
      timeoutMs,
    });

    if (this.cancelled || result.cancelled) {
      throw new Error(result.error ?? 'Run cancelled.');
    }

    if (!result.ok) {
      throw new Error(result.error ?? 'Manual input failed.');
    }

    this.flowVariables.set(variableName, result.value ?? '');
  }

  private async executeValidation(
    step: TestSuiteFlowStep,
    flow: TestSuiteFlow,
    ctx: FlowStepContext,
  ): Promise<void> {
    const cfg = step.config as ValidationStepConfig;
    const refId = cfg.refStepId?.trim() || null;
    const refStep = refId ? findFlowStepById(flow.nodes, refId) : null;
    if (refId && !refStep) {
      throw new Error('Reference step was not found in this flow.');
    }

    const rules = sanitizeValidationRulesForReferenceStepType(refStep?.stepType, cfg.rules ?? []);
    if (rules.length === 0) {
      return;
    }

    const liveE2e = !refStep || refStep.stepType === 'E2E';
    let lastCapture: FlowStepRunCapture | null = null;

    if (!liveE2e) {
      lastCapture = await this.resolveValidationReferenceCapture(
        refStep,
        refId ?? '',
        rules,
        ctx.showBrowser,
      );
      this.captures.set(step.id, lastCapture);
      for (const rule of rules) {
        const actual = resolveValidationActualValue(lastCapture, rule);
        const expected = this.resolveFlowTemplate(
          rule.expected ?? '',
          flow,
          ctx.environments,
          ctx.environmentIdOverride,
          ctx.ancestorFolders,
          ctx.environmentVariableKeys,
        );
        const resolved = { ...rule, expected };
        if (!evaluateValidationRule(resolved, actual)) {
          throw new Error(validationFailureMessage(resolved, actual));
        }
      }
      return;
    }

    for (const rule of rules) {
      const expected = this.resolveFlowTemplate(
        rule.expected ?? '',
        flow,
        ctx.environments,
        ctx.environmentIdOverride,
        ctx.ancestorFolders,
        ctx.environmentVariableKeys,
      );
      const resolved = { ...rule, expected };
      const capture = await this.captureLiveE2eValidationRule(resolved, refStep, ctx);
      lastCapture = capture;
      const actual = resolveValidationActualValue(capture, resolved);
      if (!evaluateValidationRule(resolved, actual)) {
        throw new Error(validationFailureMessage(resolved, actual));
      }
    }

    if (lastCapture) {
      this.captures.set(step.id, lastCapture);
    }
  }

  /**
   * Reads the live page for one E2E validation rule (element text/HTML/exists or URL).
   */
  private async captureLiveE2eValidationRule(
    rule: ValidationRule,
    refStep: TestSuiteFlowStep | null,
    ctx: FlowStepContext,
  ): Promise<FlowStepRunCapture> {
    const fallbackSelector =
      refStep?.stepType === 'E2E'
        ? String((refStep.config as E2eStepConfig).selector ?? '').trim()
        : '';

    if (rule.source === 'e2e_page_url') {
      const pageUrl = await this.waitForLivePageUrlForRules([rule], ctx.showBrowser);
      return {
        kind: 'e2e_element',
        capturedAt: new Date().toISOString(),
        action: 'VALIDATION',
        selector: fallbackSelector,
        pageUrl,
        elementText: '',
        elementHtml: '',
        elementExists: false,
      };
    }

    const selector = resolveE2eValidationSelector(rule, fallbackSelector);
    if (!selector) {
      throw new Error(
        'Validation needs a CSS selector for the element (or a referenced E2E step with a selector).',
      );
    }

    const waitForPresence = rule.operator !== 'not_exists' && rule.operator !== 'is_empty';
    const live = await this.readLiveE2eElement(selector, ctx, waitForPresence);
    return {
      kind: 'e2e_element',
      capturedAt: new Date().toISOString(),
      action: 'VALIDATION',
      selector,
      pageUrl: '',
      elementText: live.elementText,
      elementHtml: live.elementHtml,
      elementExists: live.elementExists,
    };
  }

  /** Reads current element text/HTML from the open E2E session. */
  private async readLiveE2eElement(
    selector: string,
    ctx: FlowStepContext,
    waitForPresence: boolean,
  ): Promise<{
    readonly elementText: string;
    readonly elementHtml: string;
    readonly elementExists: boolean;
  }> {
    const runner = this.e2eRunner;
    if (!runner || !this.browserSessionReady) {
      throw new Error('Browser session is not available for element validation.');
    }

    if (waitForPresence) {
      const asserted = await this.safeE2eRunnerExecute(runner, {
        action: 'ASSERT_ELEMENT',
        selector,
        value: '',
        timeout: DEFAULT_E2E_TIMEOUT_MS,
        show: ctx.showBrowser,
        ignoreInvalidSsl: ctx.e2eIgnoreInvalidSsl,
      });
      if (!asserted?.success) {
        return { elementText: '', elementHtml: '', elementExists: false };
      }
    }

    const textResult = await this.safeE2eRunnerExecute(runner, {
      action: 'READ_ELEMENT_DOM',
      selector,
      value: '{}',
      timeout: waitForPresence ? 2000 : 500,
      show: ctx.showBrowser,
      ignoreInvalidSsl: ctx.e2eIgnoreInvalidSsl,
    });
    const htmlResult = await this.safeE2eRunnerExecute(runner, {
      action: 'READ_ELEMENT_DOM',
      selector,
      value: JSON.stringify({ prop: 'innerHTML' }),
      timeout: waitForPresence ? 2000 : 500,
      show: ctx.showBrowser,
      ignoreInvalidSsl: ctx.e2eIgnoreInvalidSsl,
    });

    const elementText =
      textResult?.success && textResult.data && typeof textResult.data === 'object'
        ? String((textResult.data as { text?: string }).text ?? '')
        : '';
    const elementHtml =
      htmlResult?.success && htmlResult.data && typeof htmlResult.data === 'object'
        ? String((htmlResult.data as { text?: string }).text ?? '')
        : '';
    const elementExists = Boolean(textResult?.success || htmlResult?.success || elementText || elementHtml);
    return { elementText, elementHtml, elementExists };
  }

  private async executeCache(
    step: TestSuiteFlowStep,
    flow: TestSuiteFlow,
    ctx: FlowStepContext,
  ): Promise<void> {
    const cfg = step.config as CacheStepConfig;
    const refId = cfg.refStepId;
    const rawEntries = cfg.entries ?? [];
    const extractEntries = rawEntries.filter((entry) => !isGeneratedCacheEntry(entry));
    const written: Record<string, string> = {};

    const store = (variableName: string, value: string, entry: CacheStepEntry): void => {
      const next = this.applyCacheEntryCipher(entry, value, variableName, flow, ctx);
      this.flowVariables.set(variableName, next);
      written[variableName] = next;
    };

    if (!refId) {
      if (extractEntries.length > 0) {
        throw new Error('Cache step needs a reference step to extract values.');
      }
      this.applyGeneratedCacheEntries(rawEntries, flow, ctx, store);
      this.storeCacheStepCapture(step.id, written);
      return;
    }

    const refStep = findFlowStepById(flow.nodes, refId);
    if (!refStep) {
      throw new Error('Reference step was not found in this flow.');
    }

    const entries = sanitizeCacheEntriesForReferenceStepType(refStep.stepType, rawEntries);
    if (entries.length === 0) {
      return;
    }

    const needsCapture = entries.some((entry) => !isGeneratedCacheEntry(entry));
    const capture = needsCapture
      ? await this.resolveValidationReferenceCapture(refStep, refId, [], ctx.showBrowser)
      : null;

    for (const entry of entries) {
      const variableName = String(entry.variableName ?? '').trim();
      if (!variableName) {
        continue;
      }

      if (isGeneratedCacheEntry(entry)) {
        store(variableName, this.resolveGeneratedCacheValue(entry, flow, ctx), entry);
        continue;
      }

      if (!capture) {
        throw new Error(cacheEntryExtractFailureMessage(entry, variableName));
      }

      const value = resolveCacheEntryValue(capture, entry);
      if (value === null) {
        throw new Error(cacheEntryExtractFailureMessage(entry, variableName));
      }

      store(variableName, value, entry);
    }

    this.storeCacheStepCapture(step.id, written);
  }

  /** Resolves `$uuid` / `{{vars}}` in generated cache entries and stores them as flow variables. */
  private applyGeneratedCacheEntries(
    entries: readonly CacheStepEntry[],
    flow: TestSuiteFlow,
    ctx: FlowStepContext,
    store: (variableName: string, value: string, entry: CacheStepEntry) => void,
  ): void {
    for (const entry of entries) {
      if (!isGeneratedCacheEntry(entry)) {
        continue;
      }
      const variableName = String(entry.variableName ?? '').trim();
      if (!variableName) {
        continue;
      }
      store(variableName, this.resolveGeneratedCacheValue(entry, flow, ctx), entry);
    }
  }

  /**
   * Wraps a resolved CACHE value with RSA OAEP when the entry cipher mode is encrypt or decrypt.
   */
  private applyCacheEntryCipher(
    entry: CacheStepEntry,
    value: string,
    variableName: string,
    flow: TestSuiteFlow,
    ctx: FlowStepContext,
  ): string {
    const mode = entry.cipher?.mode ?? 'none';
    if (mode === 'none') {
      return value;
    }
    const pem = this.resolveFlowTemplate(
      entry.cipher?.pem ?? '',
      flow,
      ctx.environments,
      ctx.environmentIdOverride,
      ctx.ancestorFolders,
      ctx.environmentVariableKeys,
    );
    const keyPassword = this.resolveFlowTemplate(
      entry.cipher?.keyPassword ?? '',
      flow,
      ctx.environments,
      ctx.environmentIdOverride,
      ctx.ancestorFolders,
      ctx.environmentVariableKeys,
    );
    if (!pem.trim()) {
      throw new Error(`CACHE cipher for "{{${variableName}}}" needs a PEM key.`);
    }
    try {
      if (mode === 'encrypt') {
        return encryptUtf8ToBase64({ pem, keyPassword, plaintext: value });
      }
      return decryptBase64ToUtf8({ pem, keyPassword, ciphertext: value });
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`CACHE cipher for "{{${variableName}}}" failed: ${detail}`);
    }
  }

  /** Stores CACHE results as a text capture so VALIDATION can reference this step. */
  private storeCacheStepCapture(stepId: string, written: Readonly<Record<string, string>>): void {
    const names = Object.keys(written);
    if (names.length === 0) {
      return;
    }
    const text =
      names.length === 1 ? (written[names[0]] ?? '') : JSON.stringify(written, null, 2);
    this.captures.set(stepId, buildDatabaseStepCapture(text));
  }

  /** Resolves a generated cache template against the current flow variable context. */
  private resolveGeneratedCacheValue(
    entry: CacheStepEntry,
    flow: TestSuiteFlow,
    ctx: FlowStepContext,
  ): string {
    return this.resolveFlowTemplate(
      generatedCacheEntryTemplate(entry),
      flow,
      ctx.environments,
      ctx.environmentIdOverride,
      ctx.ancestorFolders,
      ctx.environmentVariableKeys,
    );
  }
}

function resolveTimeoutMs(raw: number | string | undefined, fallback: number): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw >= 0 ? raw : fallback;
  }
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number.parseInt(raw.trim(), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }
  return fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
