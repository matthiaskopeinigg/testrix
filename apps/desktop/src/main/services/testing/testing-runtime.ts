import { session, type BrowserWindow } from 'electron';
import {
  IpcChannels,
  environmentVariableMap,
  findServiceNode,
  flattenServiceTree,
  interpolateFlow,
  patchServiceArtifact,
  type FlowArtifactFields,
  type FlowProxyHit,
  type FlowRunEvent,
  type InterceptHitEvent,
  type InterceptNode,
  type LoadMetrics,
  type MockActivityEvent,
  type ServiceRuntimeStatus,
} from '@testrix/contracts';
import { appLogger, attachOpenWebCspPassthrough } from '@testrix/electron-core';

import { detach } from '../../lifecycle';
import type { ConfigStore } from '../config.service';
import type { DatabaseHost } from '../database/database-host.service';
import type { HttpHost } from '../http-host.service';
import { AdbClient } from './adb-client';
import { AndroidToolchainHost } from './android-toolchain.service';
import type { DeviceProxyRule } from './device-proxy-host.service';
import { FlowHost } from './flow-host.service';
import { InterceptHost } from './intercept-host.service';
import { ListenerHost } from './listener-host.service';
import { LoadHost } from './load-host.service';
import { MockHost } from './mock-host.service';
import { RegressionHost } from './regression-host.service';

export interface TestingRuntimeOptions {
  readonly store: ConfigStore;
  readonly http: HttpHost;
  readonly database: DatabaseHost;
  readonly getMainWindow: () => BrowserWindow | null;
}

function activeEnvironmentVars(store: ConfigStore): Record<string, string> {
  const envId = store.environments.activeId;
  const env = store.environments.items.find((item) => item.id === envId);
  return env ? environmentVariableMap(env.variables) : {};
}

/**
 * Owns mock, load, flow, regression, listener, and intercept hosts.
 */
export class TestingRuntime {
  readonly mocks = new MockHost();
  readonly intercept = new InterceptHost();
  readonly listeners = new ListenerHost();
  private activeInterceptRuleIds = new Set<string>();
  private interceptSessionMode: 'browser' | 'device' | null = null;
  private interceptServiceStatus: ServiceRuntimeStatus = { running: false, label: 'Idle', error: null };
  private readonly interceptProxyHitHandler = (
    hit: FlowProxyHit,
    rule: DeviceProxyRule | null,
  ): void => {
    if (!rule || rule.kind !== 'intercept')
      return;
    if (!this.activeInterceptRuleIds.has(hit.ruleId))
      return;
    const event: InterceptHitEvent = {
      ruleId: hit.ruleId,
      url: hit.url,
      method: hit.method,
      status: hit.status,
      action: rule.action,
      body: hit.body,
      requestBody: hit.requestBody,
      headers: hit.headers,
      requestHeaders: hit.requestHeaders,
      at: hit.at,
    };
    this.send(IpcChannels.interceptHit, event);
  };
  readonly load: LoadHost;
  readonly flows: FlowHost;
  readonly regressions: RegressionHost;
  readonly android: AndroidToolchainHost;

  constructor(private readonly options: TestingRuntimeOptions) {
    this.load = new LoadHost(options.http, options.store);
    this.android = new AndroidToolchainHost({
      store: options.store,
      getMainWindow: options.getMainWindow,
    });
    this.flows = new FlowHost(
      options.http,
      options.database,
      this.mocks,
      this.intercept,
      this.android,
      options.store,
    );
    this.regressions = new RegressionHost(options.store, this.flows);
    this.mocks.bind((event) => this.send(IpcChannels.mocksActivity, event));
    this.intercept.bind((event) => this.send(IpcChannels.interceptHit, event));
    this.intercept.bindStopped(() => this.handleInterceptBrowserStopped());
    this.listeners.bind((event) => this.send(IpcChannels.listenerHit, event));
    this.listeners.bindStopped(() => this.handleListenerBrowserStopped());
    this.flows.deviceProxy.addHitListener(this.interceptProxyHitHandler);
    this.load.bind((metrics) => this.send(IpcChannels.loadMetrics, metrics));
    this.flows.bind((event) => {
      // Keep Flows editor step statuses isolated while a regression suite is running.
      if (this.regressions.isRunning())
        return;
      this.send(IpcChannels.flowEvent, event);
    });
    this.android.bind((event) => this.send(IpcChannels.deviceEvent, event));
  }

  start(): void {
    attachOpenWebCspPassthrough(session.fromPartition('persist:testrix-e2e'));
  }

  dispose(): void {
    detach('testing:dispose', this.shutdown());
  }

  /** Stops services and the Android emulator, waiting for each. Prefer this on app quit. */
  async shutdown(): Promise<void> {
    this.flows.cancel();
    this.regressions.cancel();
    this.flows.deviceProxy.removeHitListener(this.interceptProxyHitHandler);
    const results = await Promise.allSettled([
      this.mocks.stop(),
      this.load.stop(),
      this.intercept.stop(),
      this.stopListener(),
      this.stopIntercept(),
      this.android.stopEmulator(),
    ]);
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    for (const failure of failures)
      appLogger.error('testing:shutdown', failure.reason);
  }

  activeEnvVars(): Record<string, string> {
    return activeEnvironmentVars(this.options.store);
  }

  startMocks(): Promise<ServiceRuntimeStatus> {
    return this.mocks.start(this.options.store.mocksFile, this.activeEnvVars());
  }

  stopMocks(): Promise<ServiceRuntimeStatus> {
    return this.mocks.stop();
  }

  /** Reload the mock server when mocks.json or the active environment changes mid-run. */
  async reloadMocksIfRunning(): Promise<void> {
    if (!this.mocks.snapshot().running)
      return;
    await this.startMocks();
  }

  startListener(listenerId: string): Promise<ServiceRuntimeStatus> {
    return this.listenerStart(listenerId);
  }

  stopListener(): Promise<ServiceRuntimeStatus> {
    return this.listenerStop();
  }

  async listenerStart(listenerId: string): Promise<ServiceRuntimeStatus> {
    const node = findServiceNode(this.options.store.listenersFile.items, listenerId);
    if (!node || node.kind !== 'artifact')
      return { running: false, label: 'Idle', error: 'Listener not found' };

    const envVars = this.activeEnvVars();
    const serial =
      this.options.store.emulator.selectedSerial?.trim() ||
      (node.deviceId?.trim() ? this.options.store.emulator.selectedSerial?.trim() : '') ||
      null;
    const adbPath = this.android.adbBinary();
    const adb = adbPath ? new AdbClient(adbPath) : null;

    return this.listeners.start(node, envVars, {
      deviceProxy: this.flows.deviceProxy,
      adb,
      serial,
    });
  }

  async listenerStop(): Promise<ServiceRuntimeStatus> {
    return this.listeners.stop();
  }

  private handleListenerBrowserStopped(): void {
    const status: ServiceRuntimeStatus = { running: false, label: 'Idle', error: null };
    this.send(IpcChannels.listenerStatus, status);
  }

  private handleInterceptBrowserStopped(): void {
    this.activeInterceptRuleIds.clear();
    this.interceptSessionMode = null;
    this.interceptServiceStatus = { running: false, label: 'Idle', error: null };
    this.send(IpcChannels.interceptStatus, this.interceptServiceStatus);
  }

  startIntercept(ruleId: string): Promise<ServiceRuntimeStatus> {
    return this.interceptStart(ruleId);
  }

  stopIntercept(): Promise<ServiceRuntimeStatus> {
    return this.interceptStop();
  }

  /**
   * Arms Browser CDP Fetch or DeviceProxy for the focused intercept rule.
   */
  async interceptStart(ruleId: string): Promise<ServiceRuntimeStatus> {
    await this.interceptStop();
    const focus = findServiceNode(this.options.store.interceptFile.items, ruleId);
    if (!focus || focus.kind !== 'artifact') {
      this.interceptServiceStatus = { running: false, label: 'Idle', error: 'Rule not found' };
      return this.interceptServiceStatus;
    }

    const envVars = this.activeEnvVars();
    if (focus.mode === 'browser')
      return this.interceptStartBrowser(focus, envVars);
    return this.interceptStartDevice(focus, envVars);
  }

  async interceptStop(): Promise<ServiceRuntimeStatus> {
    if (this.interceptSessionMode === 'browser')
      await this.intercept.stop().catch(() => undefined);
    for (const id of this.activeInterceptRuleIds)
      await this.flows.deviceProxy.disarmRule(id).catch(() => undefined);
    this.activeInterceptRuleIds.clear();
    this.interceptSessionMode = null;
    this.interceptServiceStatus = { running: false, label: 'Idle', error: null };
    return this.interceptServiceStatus;
  }

  private async interceptStartBrowser(
    focus: Extract<InterceptNode, { kind: 'artifact' }>,
    envVars: Record<string, string>,
  ): Promise<ServiceRuntimeStatus> {
    const startUrl = interpolateFlow(focus.startUrl, envVars).trim() || 'http://127.0.0.1/';
    const browserItems = flattenServiceTree(this.options.store.interceptFile.items).filter(
      (item): item is Extract<InterceptNode, { kind: 'artifact' }> =>
        item.kind === 'artifact' && item.mode !== 'device' && (item.id === focus.id || item.enabled !== false),
    );
    const file = {
      schemaVersion: this.options.store.interceptFile.schemaVersion,
      items: browserItems.some((item) => item.id === focus.id) ? browserItems : [focus],
    };
    const status = await this.intercept.start(file, startUrl, envVars, focus.name);
    if (!status.running) {
      this.interceptServiceStatus = status;
      return status;
    }
    this.interceptSessionMode = 'browser';
    this.activeInterceptRuleIds = new Set(file.items.map((item) => item.id));
    this.interceptServiceStatus = status;
    return status;
  }

  private async interceptStartDevice(
    focus: Extract<InterceptNode, { kind: 'artifact' }>,
    envVars: Record<string, string>,
  ): Promise<ServiceRuntimeStatus> {
    const enabled = flattenServiceTree(this.options.store.interceptFile.items).filter(
      (item): item is Extract<InterceptNode, { kind: 'artifact' }> =>
        item.kind === 'artifact' && item.mode === 'device' && (item.id === focus.id || item.enabled !== false),
    );
    const rules = enabled.some((item) => item.id === focus.id) ? enabled : [focus];
    const serial = this.options.store.emulator.selectedSerial?.trim() ?? '';
    const adbPath = this.android.adbBinary();
    if (!serial) {
      this.interceptServiceStatus = {
        running: false,
        label: 'Idle',
        error: 'Select a running Emulator device before arming Intercept',
      };
      return this.interceptServiceStatus;
    }
    if (!adbPath) {
      this.interceptServiceStatus = {
        running: false,
        label: 'Idle',
        error: 'Android SDK / adb is not configured',
      };
      return this.interceptServiceStatus;
    }

    const adb = new AdbClient(adbPath);
    await this.flows.deviceProxy.ensureForDevice(adb, serial);
    for (const node of rules)
      await this.flows.deviceProxy.armRule(this.interceptProxyRule(node, envVars));

    this.interceptSessionMode = 'device';
    this.activeInterceptRuleIds = new Set(rules.map((item) => item.id));
    this.interceptServiceStatus = { running: true, label: focus.name, error: null };
    return this.interceptServiceStatus;
  }

  private interceptProxyRule(
    node: Extract<InterceptNode, { kind: 'artifact' }>,
    envVars: Record<string, string>,
  ): DeviceProxyRule {
    const action = node.action === 'mock' || node.action === 'block' ? node.action : 'passthrough';
    return {
      id: node.id,
      kind: 'intercept',
      stage: node.stage === 'response' ? 'response' : 'request',
      method: interpolateFlow(node.method || '*', envVars) || '*',
      match: node.match || 'contains',
      url: interpolateFlow(node.url, envVars),
      headerName: interpolateFlow(node.headerName, envVars),
      headerValue: interpolateFlow(node.headerValue, envVars),
      bodyContains: interpolateFlow(node.bodyContains, envVars),
      action,
      setHeaders: interpolateFlow(node.setHeaders, envVars),
      removeHeaders: interpolateFlow(node.removeHeaders, envVars),
      setBody: interpolateFlow(node.setBody, envVars),
      mockStatus: node.mockStatus,
      mockBody: interpolateFlow(node.mockBody, envVars),
    };
  }

  /** Env map for a flow artifact — used by flow / regression runs. */
  envVarsFor(_artifact: FlowArtifactFields): Record<string, string> {
    return activeEnvironmentVars(this.options.store);
  }

  async runFlow(
    flowId: string,
    scenarioId?: string | null,
  ): Promise<{ ok: boolean; error: string | null }> {
    const node = findServiceNode(this.options.store.flows.items, flowId);
    if (!node || node.kind !== 'artifact')
      return { ok: false, error: 'Flow not found' };
    return this.flows.run(flowId, node, this.options.store.databases, this.envVarsFor(node), scenarioId);
  }

  async runFlowDraft(payload: {
    readonly scenario: import('@testrix/contracts').FlowScenario;
    readonly e2eShowWindow?: boolean;
    readonly deviceShowEmulator?: boolean;
  }): Promise<{ ok: boolean; error: string | null }> {
    const scenario = payload.scenario;
    if (!scenario || !Array.isArray(scenario.nodes) || !Array.isArray(scenario.edges))
      return { ok: false, error: 'Invalid template scenario' };
    return this.flows.runDraft(scenario, this.options.store.databases, this.activeEnvVars(), {
      e2eShowWindow: payload.e2eShowWindow,
      deviceShowEmulator: payload.deviceShowEmulator,
    });
  }

  async pickSelector(payload: {
    readonly url?: string | null;
    readonly kind?: string | null;
    readonly stopBeforeNodeId?: string | null;
    readonly scenario?: import('@testrix/contracts').FlowScenario | null;
  } = {}): Promise<{
    ok: boolean;
    selector?: string;
    loadedUrl?: string;
    cancelled?: boolean;
    error?: string | null;
  }> {
    return this.flows.pickSelector({
      ...payload,
      databases: this.options.store.databases,
      envVars: this.activeEnvVars(),
    });
  }

  async pickDeviceSelector(payload: {
    readonly stopBeforeNodeId?: string | null;
    readonly scenario?: import('@testrix/contracts').FlowScenario | null;
    readonly runPrevious?: boolean;
  } = {}): Promise<{
    ok: boolean;
    selector?: string;
    cancelled?: boolean;
    error?: string | null;
  }> {
    return this.flows.pickDeviceSelector({
      ...payload,
      databases: this.options.store.databases,
      envVars: this.activeEnvVars(),
    });
  }

  async runLoad(loadId: string) {
    const node = findServiceNode(this.options.store.loadFile.items, loadId);
    if (!node || node.kind !== 'artifact')
      return this.load.snapshot();
    const result = await this.load.start({ ...node, id: node.id, name: node.name });
    if (result.run) {
      const items = patchServiceArtifact(
        this.options.store.loadFile.items,
        loadId,
        { runs: [result.run, ...node.runs].slice(0, 30) },
        result.run.at,
      );
      await this.options.store.patchLoad({ items });
    }
    return result.status;
  }

  async runRegression(id: string) {
    return this.regressions.run(id, (event) => this.send(IpcChannels.regressionEvent, event));
  }

  async runRegressionWithOptions(
    id: string,
    options?: import('@testrix/contracts').RegressionRunOptions,
  ) {
    return this.regressions.run(
      id,
      (event) => this.send(IpcChannels.regressionEvent, event),
      options,
    );
  }

  private send(channel: string, payload: unknown): void {
    const win = this.options.getMainWindow();
    if (win && !win.isDestroyed())
      win.webContents.send(channel, payload);
  }
}

export type { FlowRunEvent, InterceptHitEvent, LoadMetrics, MockActivityEvent };
