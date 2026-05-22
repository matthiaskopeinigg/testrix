import { buildOutgoingRequest } from '../../../shared/http/build-outgoing-request';
import { sendHttpRequestPayloadSchema } from '../../../shared/http/outgoing-request.schema';
import {
  buildFlowEnvironmentVariableContext,
  buildHttpCaptureFromE2eData,
  buildHttpCaptureRegisterSpec,
  flowNeedsBrowserRunner,
  resolveHttpInterceptorStepConfig,
  resolveHttpListenerStepConfig,
} from '../../../shared/testing/flow-http-middleware-config';
import {
  buildInitialFlowRunStatuses,
  buildHttpResponseStepCapture,
  evaluateValidationRule,
  findFlowStepById,
  flattenEnabledFlowSteps,
  markRemainingFlowStepsSkipped,
  resolveGlobalE2eScreenshotDirectory,
  resolveValidationActualValue,
  sanitizeValidationRulesForReferenceStepType,
  validationFailureMessage,
  type FlowRunProgressEvent,
  type FlowStepRunCapture,
  type TestSuiteFlow,
  type TestSuiteFlowStep,
  type TestSuiteStepStatus,
} from '../../../shared/testing';
import type {
  E2eStepConfig,
  HttpInterceptorStepConfig,
  HttpListenerStepConfig,
  RequestStepConfig,
  ValidationRule,
  ValidationStepConfig,
  WaitStepConfig,
} from '../../../shared/testing/test-suite-steps.schema';
import { migrateTestSuitesFile } from '../../../shared/testing/test-suite-migrate';
import { isTestSuiteFlow, TEST_SUITE_ROOT_ID } from '../../../shared/testing/test-suites.schema';

import type { ConfigFileService } from '../config/config-file.service';
import { executeHttpRequest } from '../http/http-request-executor.service';
import type { E2eExecutePayload, E2eExecuteResult, E2eRunnerService } from './e2e-runner.service';

export interface TestSuiteFlowRunResult {
  readonly ok: boolean;
  readonly message: string;
  readonly stepStatuses: Readonly<Record<string, TestSuiteStepStatus>>;
  readonly stepCaptures: Readonly<Record<string, FlowStepRunCapture>>;
  readonly stepDurations: Readonly<Record<string, number>>;
  readonly stepErrors: Readonly<Record<string, string>>;
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
}

/**
 * Executes test suite flows with real HTTP for REQUEST steps and browser automation for E2E steps.
 */
export class TestSuiteFlowExecutor {
  private cancelled = false;
  private e2eRunner: E2eRunnerService | null = null;
  private readonly captures = new Map<string, FlowStepRunCapture>();
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
    this.activeInterceptorStepIds.clear();
    this.browserSessionReady = false;

    const flowLoaded = await this.loadFlow(flowId, files);
    if (!flowLoaded) {
      return {
        ok: false,
        message: 'Flow not found.',
        stepStatuses: {},
        stepCaptures: {},
        stepDurations: {},
        stepErrors: {},
        durationMs: 0,
      };
    }

    let flow = flowLoaded;
    if (options.environmentIdOverride) {
      flow = { ...flow, environmentId: options.environmentIdOverride };
    }

    const steps = flattenEnabledFlowSteps(flow.nodes);
    if (steps.length === 0) {
      return {
        ok: false,
        message: 'No enabled steps to run.',
        stepStatuses: {},
        stepCaptures: {},
        stepDurations: {},
        stepErrors: {},
        durationMs: 0,
      };
    }

    const hasE2eSteps = steps.some((step) => step.stepType === 'E2E');
    const needsBrowserRunner = flowNeedsBrowserRunner(steps);
    const showBrowser = options.e2eShowWindowOverride ?? flow.e2eShowWindow !== false;
    const keepBrowserOpen = options.e2eKeepWindowOpenOverride ?? flow.e2eKeepWindowOpen === true;
    const lockVisibleRunnerInput = needsBrowserRunner && showBrowser;

    if (needsBrowserRunner && !this.e2eRunner) {
      return {
        ok: false,
        message: 'E2E runner is not available.',
        stepStatuses: {},
        stepCaptures: {},
        stepDurations: {},
        stepErrors: {},
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
      onProgress?.({ flowId, stepStatuses: { ...stepStatuses } });
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
      durationMs: Date.now() - flowStartedAt,
    });

    emitProgress();

    const [collections, settings, environments] = await Promise.all([
      files.readCollections(),
      files.readSettings(),
      files.readEnvironments(),
    ]);

    try {
      for (let index = 0; index < steps.length; index++) {
        const step = steps[index]!;
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
            collections: collections.items,
            http: settings.http,
            environments,
            appVersion: '0.0.0',
            showBrowser,
            e2eScreenshotFolder: settings.http.testing.e2eScreenshotFolder,
            environmentIdOverride: options.environmentIdOverride,
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
      if (this.e2eRunner && this.browserSessionReady) {
        this.e2eRunner.teardownHttpCaptures();
      }
      if (needsBrowserRunner && this.e2eRunner && !keepBrowserOpen) {
        await this.e2eRunner.closeRunner().catch(() => undefined);
      }
      this.browserSessionReady = false;
    }
  }

  private async loadFlow(flowId: string, files: ConfigFileService): Promise<TestSuiteFlow | null> {
    const raw = await files.readTestSuites();
    const file = migrateTestSuitesFile(raw);
    const root = file.suites.find((s) => s.id === TEST_SUITE_ROOT_ID) ?? file.suites[0];
    if (!root) {
      return null;
    }
    const walk = (items: readonly import('../../../shared/testing').TestSuiteTreeItem[]): TestSuiteFlow | null => {
      for (const item of items) {
        if (isTestSuiteFlow(item) && item.id === flowId) {
          return item;
        }
        if (!isTestSuiteFlow(item)) {
          const found = walk(item.children);
          if (found) {
            return found;
          }
        }
      }
      return null;
    };
    return walk(root.flows);
  }

  private async executeStep(
    step: TestSuiteFlowStep,
    flow: TestSuiteFlow,
    ctx: {
      readonly collections: readonly import('@shared/config').CollectionNode[];
      readonly http: import('@shared/config').HttpSettings;
      readonly environments: import('@shared/config').EnvironmentsFile;
      readonly appVersion: string;
      readonly showBrowser: boolean;
      readonly e2eScreenshotFolder: string;
      readonly environmentIdOverride?: string | null;
    },
  ): Promise<void> {
    switch (step.stepType) {
      case 'REQUEST':
        await this.executeRequest(step, ctx);
        return;
      case 'WAIT':
        await this.executeWait(step);
        return;
      case 'VALIDATION':
        await this.executeValidation(step, flow, ctx.showBrowser);
        return;
      case 'E2E':
        await this.executeE2e(step, flow, ctx.showBrowser, ctx.e2eScreenshotFolder);
        return;
      case 'HTTP_LISTENER':
        await this.executeHttpListener(step, flow, ctx);
        return;
      case 'HTTP_INTERCEPTOR':
        await this.executeHttpInterceptor(step, flow, ctx);
        return;
      case 'DATABASE':
      case 'MANUAL':
      case 'TRIGGER':
        throw new Error(`${step.stepType} execution is not yet implemented in Testrix.`);
      default:
        throw new Error(`Unknown step type: ${step.stepType}`);
    }
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
    },
  ): Promise<void> {
    const variableContext = buildFlowEnvironmentVariableContext(
      flow,
      ctx.environments,
      ctx.environmentIdOverride,
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
    },
  ): Promise<void> {
    const variableContext = buildFlowEnvironmentVariableContext(
      flow,
      ctx.environments,
      ctx.environmentIdOverride,
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
    showBrowser: boolean,
    e2eScreenshotFolder: string,
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

    const selector = String(config.selector ?? '');
    const value = String(config.value ?? '');
    const timeout = resolveTimeoutMs(config.timeout, DEFAULT_E2E_TIMEOUT_MS);

    const payload = {
      action,
      selector,
      value,
      timeout,
      show: showBrowser,
    } as {
      action: string;
      selector: string;
      value: string;
      timeout: number;
      show: boolean;
      screenshotPath?: string;
      screenshotFileName?: string;
    };

    if (action === 'SCREENSHOT') {
      payload.screenshotPath =
        resolveGlobalE2eScreenshotDirectory(e2eScreenshotFolder, flow) ??
        String(config.screenshotPath ?? '').trim();
      payload.screenshotFileName = String(config.screenshotFileName ?? '').trim();
    }

    const result = await runner.execute(payload);
    if (!result.success) {
      throw new Error(result.error || `E2E [${action}] failed`);
    }
    try {
      this.captures.set(
        step.id,
        await this.buildE2eStepCapture(step, action, selector, result, showBrowser),
      );
    } catch (captureError: unknown) {
      this.captures.set(step.id, this.buildFallbackE2eCapture(step, action, selector));
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
    ctx: {
      readonly collections: readonly import('@shared/config').CollectionNode[];
      readonly http: import('@shared/config').HttpSettings;
      readonly environments: import('@shared/config').EnvironmentsFile;
      readonly appVersion: string;
    },
  ): Promise<void> {
    const cfg = step.config as RequestStepConfig;

    if (cfg.collectionRequestId) {
      const built = buildOutgoingRequest({
        requestId: cfg.collectionRequestId,
        nodes: ctx.collections,
        http: ctx.http,
        environments: ctx.environments,
        appVersion: ctx.appVersion,
        runScope: { runId: `flow-${step.id}` },
      });
      if (!built) {
        throw new Error('Collection request not found.');
      }
      const payload = sendHttpRequestPayloadSchema.parse({
        ...built.outgoing,
        runScope: { runId: `flow-${step.id}` },
      });
      const snapshot = await executeHttpRequest(payload);
      this.captures.set(step.id, buildHttpResponseStepCapture(snapshot));
      if (!snapshot.status.ok) {
        throw new Error(formatHttpStepFailure(snapshot));
      }
      return;
    }

    const url = String(cfg.url ?? '').trim();
    if (!url) {
      throw new Error('REQUEST step needs a URL or collection request.');
    }

    const payload = sendHttpRequestPayloadSchema.parse({
      requestId: step.id,
      method: cfg.method ?? 'GET',
      url,
      headers: Object.fromEntries(
        (cfg.headers ?? [])
          .filter((h) => h.enabled && h.key)
          .map((h) => [h.key, h.value]),
      ),
      body: { kind: 'none' },
      transport: {
        timeoutMs: Number(cfg.timeoutMs) || 30_000,
        useCookies: true,
        http2Enabled: ctx.http.request.http2Enabled,
        http2FallbackToHttp1: true,
        followRedirects: true,
        maxRedirects: 10,
        strictSsl: true,
        disableCookiesGlobally: false,
        ignoreInvalidSsl: false,
        proxy: ctx.http.proxy,
        certificates: ctx.http.certificates,
        dns: ctx.http.dns,
        retries: ctx.http.retries,
      },
      scripts: { pre: [], post: [] },
      environmentId: null,
      variableContext: {},
    });

    const snapshot = await executeHttpRequest(payload);
    this.captures.set(step.id, buildHttpResponseStepCapture(snapshot));
    if (!snapshot.status.ok) {
      throw new Error(formatHttpStepFailure(snapshot));
    }
  }

  private async executeWait(step: TestSuiteFlowStep): Promise<void> {
    const cfg = step.config as WaitStepConfig;
    const ms = Number(cfg.durationMs) || 1000;
    await sleep(ms);
  }

  private async executeValidation(
    step: TestSuiteFlowStep,
    flow: TestSuiteFlow,
    showBrowser: boolean,
  ): Promise<void> {
    const cfg = step.config as ValidationStepConfig;
    const refId = cfg.refStepId;
    if (!refId) {
      throw new Error('Validation step needs a reference step.');
    }

    const refStep = findFlowStepById(flow.nodes, refId);
    if (!refStep) {
      throw new Error('Reference step was not found in this flow.');
    }

    const rules = sanitizeValidationRulesForReferenceStepType(refStep.stepType, cfg.rules ?? []);
    if (rules.length === 0) {
      return;
    }

    const capture = await this.resolveValidationReferenceCapture(
      refStep,
      refId,
      rules,
      showBrowser,
    );

    for (const rule of rules) {
      const actual = resolveValidationActualValue(capture, rule);
      if (!evaluateValidationRule(rule, actual)) {
        throw new Error(validationFailureMessage(rule, actual));
      }
    }
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

function formatHttpStepFailure(snapshot: {
  readonly status: { readonly code: number; readonly text: string };
  readonly body: { readonly text?: string };
}): string {
  const statusText = snapshot.status.text.trim();
  const statusLabel = statusText
    ? `HTTP ${snapshot.status.code} ${statusText}`
    : `HTTP ${snapshot.status.code}`;
  const body = snapshot.body.text?.trim() ?? '';
  if (!body) {
    return statusLabel;
  }
  const preview = body.length > 160 ? `${body.slice(0, 160)}…` : body;
  return `${statusLabel}: ${preview}`;
}
