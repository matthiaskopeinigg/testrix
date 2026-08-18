import { app, type BrowserWindow, type WebContents } from 'electron';
import path from 'node:path';

import {
  createIdleLoadTestRunMetrics,
  createIdleRegressionRunMetrics,
  LoadTestRunnerSlots,
  parseLoadTestIpcId,
  type FlowRunProgressEvent,
  type LoadTestRunMetrics,
  type LoadTestStartOptions,
  type RegressionRun,
  type RegressionRunMetrics,
  type InterceptorFile,
  type InterceptorRuntimeStatus,
  type MockServerFile,
  type MockServerMismatchRecord,
} from '../../../shared/testing';

import { TestingChannels } from '../../ipc/channels/testing.channels';
import type { ConfigFileService } from '../config/config-file.service';
import { updateE2eCheckpointBaseline } from './e2e-checkpoint';
import { CaptureRunner } from './capture-runner.service';
import { InterceptorRunner } from './interceptor-runner.service';
import { LoadTestRunner } from './load-test-runner.service';
import { MockServerRunner, type MockServerStatus } from './mock-server-runner.service';
import { RegressionRunner } from './regression-runner.service';
import { TestSuiteFlowExecutor, type TestSuiteFlowRunResult } from './test-suite-flow-executor.service';
import { FlowManualInputCoordinator } from './flow-manual-input-coordinator.service';
import {
  E2eRunnerService,
  type E2eExecutePayload,
  type E2eExecuteResult,
  type E2ePickElementPayload,
  type E2ePickElementResult,
} from './e2e-runner.service';

/**
 * In-process testing runtimes (mock server, capture, interceptor, load test, E2E browser).
 */
export class TestingRuntimeService {
  private readonly loadTestSlots = new LoadTestRunnerSlots<LoadTestRunner>();
  private readonly regressionRunner = new RegressionRunner();
  private readonly flowExecutor = new TestSuiteFlowExecutor();
  private readonly manualInputCoordinator = new FlowManualInputCoordinator();
  private readonly e2eRunner = new E2eRunnerService();
  private readonly mockServerRunner: MockServerRunner;
  private readonly captureRunner = new CaptureRunner();
  private readonly interceptorRunner: InterceptorRunner;

  constructor(private readonly files: ConfigFileService) {
    this.flowExecutor.setE2eRunner(this.e2eRunner);
    this.mockServerRunner = new MockServerRunner(files);
    this.interceptorRunner = new InterceptorRunner(files);
  }

  /**
   * Wires the main window provider for mock server and capture push events.
   */
  setMainWindowProvider(provider: () => BrowserWindow | null): void {
    this.mockServerRunner.setMainWindowProvider(provider);
    this.captureRunner.setMainWindowProvider(provider);
    this.interceptorRunner.setMainWindowProvider(provider);
  }

  mockStatus(): MockServerStatus {
    return this.mockServerRunner.status();
  }

  async mockStart(): Promise<MockServerStatus> {
    return this.mockServerRunner.start();
  }

  async mockStop(): Promise<MockServerStatus> {
    return this.mockServerRunner.stop();
  }

  mockListMismatches(): readonly MockServerMismatchRecord[] {
    return this.mockServerRunner.listMismatches();
  }

  mockClearMismatches(): void {
    this.mockServerRunner.clearMismatches();
  }

  onMockServerFileSaved(file: MockServerFile): void {
    this.mockServerRunner.setFile(file);
  }

  async tryAutoStartMockServer(): Promise<void> {
    await this.mockServerRunner.tryAutoStartOnLaunch();
  }

  captureStatus() {
    return this.captureRunner.status();
  }

  captureStart(options: unknown) {
    return this.captureRunner.start(options);
  }

  captureStop() {
    return this.captureRunner.stop();
  }

  captureListEntries(captureItemId?: string) {
    return this.captureRunner.listEntries(captureItemId);
  }

  captureClearEntries(captureItemId?: string): void {
    this.captureRunner.clearEntries(captureItemId);
  }

  interceptorStatus(): InterceptorRuntimeStatus {
    return this.interceptorRunner.status();
  }

  interceptorStart(options: unknown): Promise<InterceptorRuntimeStatus> {
    return this.interceptorRunner.start(options);
  }

  interceptorStop(): InterceptorRuntimeStatus {
    return this.interceptorRunner.stop();
  }

  interceptorListHits() {
    return this.interceptorRunner.listHits();
  }

  interceptorClearHits(): void {
    this.interceptorRunner.clearHits();
  }

  onInterceptorFileSaved(file: InterceptorFile): void {
    this.interceptorRunner.setFile(file);
  }

  /** Returns whether the given load test currently has an active run. */
  loadTestStatus(loadTestId: string): { readonly running: boolean } {
    return this.loadTestSlots.status(loadTestId);
  }

  /** Returns live metrics for one load test, or idle metrics when unknown. */
  loadTestMetrics(loadTestId: string): LoadTestRunMetrics {
    return this.loadTestSlots.snapshot(loadTestId);
  }

  /** Starts a run for `options.loadTestId`, replacing a finished runner for that id. */
  async loadTestStart(options: unknown = {}): Promise<LoadTestRunMetrics> {
    const loadTestId =
      options && typeof options === 'object' && 'loadTestId' in options
        ? parseLoadTestIpcId((options as { loadTestId?: unknown }).loadTestId)
        : null;
    if (loadTestId) {
      this.loadTestSlots.assertCanStart(loadTestId);
    }
    const version = app.getVersion?.() ?? '0.0.0';
    const runner = new LoadTestRunner();
    const metrics = await runner.start(options, this.files, version);
    if (loadTestId) {
      this.loadTestSlots.set(loadTestId, runner);
    }
    return metrics;
  }

  /** Cancels the run for `loadTestId`, or returns idle metrics when none exists. */
  loadTestCancel(loadTestId: string): LoadTestRunMetrics {
    return this.loadTestSlots.cancel(loadTestId);
  }

  regressionStatus(): RegressionRunMetrics {
    return this.regressionRunner.snapshot();
  }

  regressionMetrics(): RegressionRunMetrics {
    return this.regressionRunner.snapshot();
  }

  async regressionStart(
    options: unknown,
    sender?: WebContents,
  ): Promise<{ readonly metrics: RegressionRunMetrics; readonly run: RegressionRun }> {
    return this.regressionRunner.start(options, this.files, sender);
  }

  regressionCancel(): RegressionRunMetrics {
    return this.regressionRunner.cancel();
  }

  async e2eExecuteFlow(
    flowId: string,
    sender?: WebContents,
    options?: import('./test-suite-flow-executor.service').TestSuiteFlowExecuteOptions,
  ): Promise<TestSuiteFlowRunResult> {
    this.manualInputCoordinator.bindSender(sender);
    try {
      return await this.flowExecutor.executeFlow(
        flowId,
        this.files,
        (event: FlowRunProgressEvent) => {
          sender?.send(TestingChannels.flowRunProgress, event);
        },
        {
          ...options,
          requestManualInput: (request) => this.manualInputCoordinator.prompt(request),
        },
      );
    } finally {
      this.manualInputCoordinator.reset();
    }
  }

  e2eCancel(): void {
    this.flowExecutor.cancel();
    this.manualInputCoordinator.cancelActivePrompts();
    this.e2eRunner.signalCancel();
    void this.e2eRunner.closePickSession();
  }

  submitFlowManualInput(payload: unknown): { readonly ok: boolean; readonly error?: string } {
    return this.manualInputCoordinator.submit(payload);
  }

  async e2eUpdateCheckpointBaseline(payload: {
    readonly flowId?: string;
    readonly stepId?: string;
  }): Promise<{ readonly ok: boolean; readonly error?: string }> {
    const flowId = typeof payload.flowId === 'string' ? payload.flowId.trim() : '';
    const stepId = typeof payload.stepId === 'string' ? payload.stepId.trim() : '';
    if (!flowId || !stepId) {
      return { ok: false, error: 'Flow and step ids are required.' };
    }
    return updateE2eCheckpointBaseline(
      path.join(this.files.profileDir(), 'e2e-checkpoints'),
      flowId,
      stepId,
    );
  }

  async e2eExecute(payload: E2eExecutePayload): Promise<E2eExecuteResult> {
    return this.e2eRunner.execute(payload);
  }

  async e2eClearRunnerSession(): Promise<{ readonly ok: boolean }> {
    await this.e2eRunner.clearRunnerSession();
    return { ok: true };
  }

  e2eSignalCancel(): void {
    this.e2eRunner.signalCancel();
  }

  async e2ePickElement(
    payload: E2ePickElementPayload,
    sender?: WebContents,
  ): Promise<E2ePickElementResult> {
    const flowId = typeof payload.flowId === 'string' ? payload.flowId.trim() : '';
    const stepId = typeof payload.stepId === 'string' ? payload.stepId.trim() : '';
    if (flowId && stepId) {
      if (sender) {
        this.manualInputCoordinator.bindSender(sender);
      }
      try {
        const prepared = await this.flowExecutor.executeFlow(flowId, this.files, undefined, {
          stopBeforeStepId: stepId,
          e2eShowWindowOverride: true,
          e2eKeepWindowOpenOverride: true,
          requestManualInput: (request) => this.manualInputCoordinator.prompt(request),
        });
        if (!prepared.ok) {
          await this.e2eRunner.closeRunner().catch(() => undefined);
          const cancelled = /cancelled/i.test(prepared.message || '');
          return cancelled
            ? { ok: false, cancelled: true }
            : { ok: false, error: prepared.message || 'Failed to prepare flow before pick.' };
        }
        try {
          return await this.e2eRunner.pickElement({ reuseSession: true });
        } catch (error: unknown) {
          await this.e2eRunner.closeRunner().catch(() => undefined);
          throw error;
        }
      } finally {
        this.manualInputCoordinator.reset();
      }
    }
    return this.e2eRunner.pickElement(payload);
  }
}

export {
  createIdleLoadTestRunMetrics,
  createIdleRegressionRunMetrics,
  type LoadTestRunMetrics,
  type LoadTestStartOptions,
  type RegressionRunMetrics,
};
