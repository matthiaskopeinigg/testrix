import { app, type BrowserWindow, type WebContents } from 'electron';

import {
  createIdleLoadTestRunMetrics,
  createIdleRegressionRunMetrics,
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
  private readonly loadTestRunner = new LoadTestRunner();
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

  loadTestStatus(): { readonly running: boolean } {
    return { running: this.loadTestRunner.snapshot().running };
  }

  loadTestMetrics(): LoadTestRunMetrics {
    return this.loadTestRunner.snapshot();
  }

  loadTestStart(options: unknown = {}): Promise<LoadTestRunMetrics> {
    const version = app.getVersion?.() ?? '0.0.0';
    return this.loadTestRunner.start(options, this.files, version);
  }

  loadTestCancel(): LoadTestRunMetrics {
    return this.loadTestRunner.cancel();
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

  async e2eExecuteFlow(flowId: string, sender?: WebContents): Promise<TestSuiteFlowRunResult> {
    this.manualInputCoordinator.bindSender(sender);
    try {
      return await this.flowExecutor.executeFlow(
        flowId,
        this.files,
        (event: FlowRunProgressEvent) => {
          sender?.send(TestingChannels.flowRunProgress, event);
        },
        {
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
  }

  submitFlowManualInput(payload: unknown): { readonly ok: boolean; readonly error?: string } {
    return this.manualInputCoordinator.submit(payload);
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

  async e2ePickElement(payload: E2ePickElementPayload): Promise<E2ePickElementResult> {
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
