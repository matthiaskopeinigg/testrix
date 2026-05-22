import { app, type WebContents } from 'electron';

import {
  createIdleLoadTestRunMetrics,
  createIdleRegressionRunMetrics,
  type FlowRunProgressEvent,
  type LoadTestRunMetrics,
  type LoadTestStartOptions,
  type RegressionRun,
  type RegressionRunMetrics,
} from '../../../shared/testing';

import { TestingChannels } from '../../ipc/channels/testing.channels';
import type { ConfigFileService } from '../config/config-file.service';
import { LoadTestRunner } from './load-test-runner.service';
import { RegressionRunner } from './regression-runner.service';
import { TestSuiteFlowExecutor, type TestSuiteFlowRunResult } from './test-suite-flow-executor.service';
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
  private mockRunning = false;
  private captureRunning = false;
  private interceptorRunning = false;
  private readonly loadTestRunner = new LoadTestRunner();
  private readonly regressionRunner = new RegressionRunner();
  private readonly flowExecutor = new TestSuiteFlowExecutor();
  private readonly e2eRunner = new E2eRunnerService();
  private readonly captureEntries: {
    readonly id: string;
    readonly method: string;
    readonly url: string;
    readonly at: string;
  }[] = [];

  constructor(private readonly files: ConfigFileService) {
    this.flowExecutor.setE2eRunner(this.e2eRunner);
  }

  mockStatus(): { readonly running: boolean } {
    return { running: this.mockRunning };
  }

  mockStart(): { readonly running: boolean } {
    this.mockRunning = true;
    return { running: true };
  }

  mockStop(): { readonly running: boolean } {
    this.mockRunning = false;
    return { running: false };
  }

  captureStatus(): { readonly running: boolean } {
    return { running: this.captureRunning };
  }

  captureStart(): { readonly running: boolean } {
    this.captureRunning = true;
    return { running: true };
  }

  captureStop(): { readonly running: boolean } {
    this.captureRunning = false;
    return { running: false };
  }

  captureListEntries(): readonly {
    readonly id: string;
    readonly method: string;
    readonly url: string;
    readonly at: string;
  }[] {
    return this.captureEntries;
  }

  interceptorStatus(): { readonly running: boolean } {
    return { running: this.interceptorRunning };
  }

  interceptorStart(): { readonly running: boolean } {
    this.interceptorRunning = true;
    return { running: true };
  }

  interceptorStop(): { readonly running: boolean } {
    this.interceptorRunning = false;
    return { running: false };
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
    return this.flowExecutor.executeFlow(flowId, this.files, (event: FlowRunProgressEvent) => {
      sender?.send(TestingChannels.flowRunProgress, event);
    });
  }

  e2eCancel(): void {
    this.flowExecutor.cancel();
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
