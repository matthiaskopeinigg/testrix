import { randomUUID } from 'node:crypto';
import { BrowserWindow, session } from 'electron';
import {
  DEFAULT_FOLDER_AUTH,
  FLOW_LOOP_MAX_ITERATIONS,
  buildFlowRunPlan,
  evalFlowCondition,
  findDatabaseConnection,
  flowConfigBoolean,
  flowConfigNumber,
  flowConfigString,
  flowExecutionScopeId,
  flowHasDeviceNodes,
  flowHasStartToEndPath,
  flowNodeLabel,
  flowScenarioRunCount,
  interpolateFlow,
  ensureRequestUrlScheme,
  browserOpenUrlCandidates,
  isAbortedNavigationError,
  isDnsOrHostLoadError,
  isUsableBrowserPageUrl,
  parseFlowHttpStage,
  parseFlowInterceptAction,
  parseFlowRequestKvRows,
  parseFlowScenariosRunMode,
  planFlowRequestUrl,
  flowRequestHeaderPairs,
  flowRequestBodyFromConfig,
  interpolateFlowRequestBody,
  mergeFlowRequestContentType,
  planFlowRequestEncodedBody,
  isFlowFrameKind,
  isFlowBrowserKind,
  isFlowDeviceKind,
  DEFAULT_DATABASES_FILE,
  IpcChannels,
  type DatabasesFile,
  type FlowArtifactFields,
  type FlowE2eReplay,
  type FlowEvalContext,
  type FlowGraphNode,
  type FlowManualPromptReply,
  type FlowManualPromptRequest,
  type FlowPort,
  type FlowRunEvent,
  type FlowRunEventDetail,
  type FlowScenario,
  type HttpExecuteRequest,
  type HttpExecuteResponse,
} from '@testrix/contracts';

import type { DatabaseHost } from '../database/database-host.service';
import type { HttpHost } from '../http-host.service';
import type { MockHost } from './mock-host.service';
import type { InterceptHost } from './intercept-host.service';
import type { AndroidToolchainHost } from './android-toolchain.service';
import { DeviceLane, type DeviceLaneVars } from './device-lane';
import { DeviceProxyHost } from './device-proxy-host.service';
import { pickDeviceSelector } from './device-picker';
import type { ConfigStore } from '../config.service';
import {
  collectPageFrames,
  evalAcrossFrames,
  toTopLevelPoint,
} from './e2e-frames';
import {
  buildE2ePickerHintScript,
  buildE2ePickerHintTeardownScript,
  DEEP_QUERY_HELPER,
  pickSelectorWithCdp,
} from './e2e-picker-cdp';
import { prefixNodeIdsBefore } from './e2e-picker-targets';
import { BrowserLane, E2E_PARTITION } from './flow-browser-lane';
import {
  assertFlowMatch,
  devicePickPrefixKind,
  devicePickPrefixNeedsSelector,
  FlowStepError,
  flowUrlMatches,
  headerMapFromPairs,
  httpSummary,
  normalizeUrlForCompare,
  previewBody,
  scenarioNeedsDeviceProxy,
  settleWebContents,
  sleep,
  applyFlowCaptureRules,
  applyFlowResponse,
  type ArmedHttpListen,
} from './flow-host-helpers';

interface ScopeContext {
  readonly flowId: string;
  readonly scenario: FlowScenario;
  readonly rowIndex: number;
  readonly vars: FlowEvalContext;
  readonly databases: DatabasesFile;
  readonly signal: AbortSignal;
  readonly lane: BrowserLane;
  /** Armed HTTP listens keyed by the Listen / Intercept node that armed them. */
  readonly armedByNodeId: Map<string, ArmedHttpListen>;
  /** Flow artifact for device settings (show emulator, etc.). */
  readonly artifact: FlowArtifactFields | null;
}

type NodeOutcome = 'ok' | 'error' | 'skipped';

/**
 * Executes scenario graphs in the main process. Nodes start once every enabled
 * predecessor settles, so a fan-out runs its branches at the same time and a
 * node with several inputs acts as a join.
 */
export class FlowHost {
  private abort: AbortController | null = null;
  /** True while a regression batch owns the host (hidden windows, shared abort). */
  private batching = false;
  private onEvent: ((event: FlowRunEvent) => void) | null = null;
  private windows = new Set<BrowserWindow>();
  /** Windows closed because a parallel branch finished — do not abort the run. */
  private intentionalCloses = new WeakSet<BrowserWindow>();
  private pickLane: BrowserLane | null = null;
  /** Active run pacing; slow keeps watchable delays. */
  private e2eReplay: FlowE2eReplay = 'slow';
  /** Whether E2E windows are shown during the active run (pick always shows). */
  e2eWindowVisible = true;

  private readonly devices: DeviceLane;
  /** Shared with TestingRuntime Listener / Interceptor workbench sessions. */
  readonly deviceProxy = new DeviceProxyHost();
  private readonly android: AndroidToolchainHost;
  private readonly emulatorSerial: () => string;
  private activeArtifact: FlowArtifactFields | null = null;
  /** Serializes emulator stop so a new run does not race an in-flight release. */
  private deviceRelease: Promise<void> = Promise.resolve();
  private readonly pendingManual = new Map<string, { readonly resolve: (value: string | null) => void }>();

  constructor(
    private readonly http: HttpHost,
    private readonly database: DatabaseHost,
    private readonly mock: MockHost,
    private readonly intercept: InterceptHost,
    android: AndroidToolchainHost,
    store: ConfigStore,
  ) {
    this.android = android;
    this.emulatorSerial = () => store.emulator.selectedSerial?.trim() || '';
    this.devices = new DeviceLane(android, () => store.emulator);
  }

  bind(listener: ((event: FlowRunEvent) => void) | null): void {
    this.onEvent = listener;
  }

  cancel(): void {
    this.abort?.abort();
    this.abort = null;
    this.batching = false;
    this.rejectPendingManuals();
    this.closeWindows();
    this.deviceRelease = this.releaseDevicesAndProxy();
  }

  /** Renderer answered (or cancelled) a Manual step prompt. */
  resolveManualPrompt(reply: FlowManualPromptReply): void {
    const pending = this.pendingManual.get(reply.requestId);
    if (!pending)
      return;
    this.pendingManual.delete(reply.requestId);
    pending.resolve(reply.ok ? reply.value.trim() : null);
  }

  /**
   * Starts a hidden, fast-replay batch so a regression can run several flows
   * without opening E2E windows or cancelling sibling workers.
   */
  async beginBatch(): Promise<void> {
    this.cancel();
    await this.deviceRelease;
    const controller = new AbortController();
    this.abort = controller;
    this.batching = true;
    this.e2eWindowVisible = false;
    this.e2eReplay = 'fast';
    await this.clearE2eSession();
  }

  /** Closes hidden batch windows and restores interactive E2E defaults. */
  endBatch(): void {
    this.batching = false;
    this.closeWindows();
    this.e2eReplay = 'slow';
    this.e2eWindowVisible = true;
    if (this.abort && !this.abort.signal.aborted)
      this.abort = null;
    this.deviceRelease = this.releaseDevicesAndProxy();
  }

  /**
   * Runs one flow inside an active batch. Does not cancel siblings or show a window.
   */
  async runInBatch(
    flowId: string,
    artifact: FlowArtifactFields,
    databases: DatabasesFile,
    envVars: Readonly<Record<string, string>> = {},
    scenarioId?: string | null,
  ): Promise<{ ok: boolean; error: string | null }> {
    const signal = this.abort?.signal;
    if (!this.batching || !signal)
      return { ok: false, error: 'cancelled' };
    if (signal.aborted)
      return { ok: false, error: 'cancelled' };
    this.e2eWindowVisible = false;
    this.e2eReplay = 'fast';
    const usesDevice = flowHasDeviceNodes(artifact.scenarios);
    // Only device flows own the shared DeviceLane — parallel API/E2E must not reset it.
    if (usesDevice) {
      this.activeArtifact = artifact;
      this.devices.beginRun();
    }
    try {
      const selected = artifact.scenarios.filter((scenario) =>
        scenarioId ? scenario.id === scenarioId : scenario.enabled,
      );
      const blocked = selected.find((scenario) => !flowHasStartToEndPath(scenario));
      if (blocked)
        return { ok: false, error: `${blocked.name}: connect Start to End before running` };
      let failure: string | null = null;
      for (const scenario of selected) {
        if (signal.aborted)
          return { ok: false, error: 'cancelled' };
        const error = await this.runScenarioRows(
          flowId,
          scenario,
          databases,
          envVars,
          signal,
          artifact,
        );
        failure = failure ?? error;
      }
      if (signal.aborted)
        return { ok: false, error: 'cancelled' };
      return { ok: failure === null, error: failure };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Flow failed';
      if (message === 'cancelled' || signal.aborted)
        return { ok: false, error: 'cancelled' };
      return { ok: false, error: message };
    } finally {
      if (usesDevice) {
        this.deviceRelease = this.releaseDevicesAndProxy();
        await this.deviceRelease;
      }
    }
  }

  /** How many live E2E windows this host is tracking. */
  activeWindowCount(): number {
    let count = 0;
    for (const win of this.windows) {
      if (!win.isDestroyed())
        count += 1;
    }
    return count;
  }

  /** Wipe cookies + site storage so each run starts logged-out / clean. */
  private async clearE2eSession(): Promise<void> {
    try {
      await session.fromPartition(E2E_PARTITION).clearStorageData({
        storages: [
          'cookies',
          'localstorage',
          'indexdb',
          'shadercache',
          'serviceworkers',
          'cachestorage',
        ],
      });
    } catch {
      // Partition may not exist yet on first run.
    }
  }

  /**
   * Opens (or reuses) the E2E window so the user can click an element and
   * receive a CSS selector for the flow inspector.
   * When `scenario` + `stopBeforeNodeId` are provided, runs preceding nodes first.
   */
  async pickSelector(options: {
    readonly url?: string | null;
    readonly kind?: string | null;
    readonly stopBeforeNodeId?: string | null;
    readonly scenario?: FlowScenario | null;
    readonly databases?: DatabasesFile;
    readonly envVars?: Readonly<Record<string, string>>;
  } = {}): Promise<{
    ok: boolean;
    selector?: string;
    loadedUrl?: string;
    cancelled?: boolean;
    error?: string | null;
  }> {
    if (this.abort)
      return { ok: false, error: 'Stop the current flow run before picking a selector.' };

    if (!this.pickLane || !this.pickLane.current())
      this.pickLane = new BrowserLane(this, null);
    const lane = this.pickLane;
    const kind = typeof options.kind === 'string' ? options.kind : null;
    const stopBeforeNodeId =
      typeof options.stopBeforeNodeId === 'string' ? options.stopBeforeNodeId.trim() : '';
    const scenario = options.scenario ?? null;
    const databases = options.databases;
    const envVars = options.envVars ?? {};

    const previousVisible = this.e2eWindowVisible;
    this.e2eWindowVisible = true;
    lane.setInputAllowed(true);

    try {
      let win = await lane.ensure(1100, 800, { visible: true });
      let loadedUrl: string | undefined;

      if (scenario && stopBeforeNodeId) {
        const prefixError = await this.runPickPrefix({
          scenario,
          stopBeforeNodeId,
          lane,
          databases: databases ?? DEFAULT_DATABASES_FILE,
          envVars,
        });
        if (prefixError)
          return { ok: false, error: prefixError };
        win = lane.current() ?? (await lane.ensure(1100, 800, { visible: true }));
        const after = win.webContents.getURL();
        if (after && after !== 'about:blank')
          loadedUrl = after;
      }

      const current = win.webContents.getURL();
      const target = typeof options.url === 'string' ? options.url.trim() : '';
      const needsLoad =
        !!target &&
        (!current ||
          current === 'about:blank' ||
          normalizeUrlForCompare(current) !== normalizeUrlForCompare(ensureRequestUrlScheme(target)));
      if (needsLoad && !loadedUrl) {
        loadedUrl = await this.load(win, target);
      } else if ((!current || current === 'about:blank') && !loadedUrl) {
        return {
          ok: false,
          error: 'Open a page first (add a browser Open node with a URL), then pick again.',
        };
      } else if (!loadedUrl) {
        loadedUrl = current;
      }
      lane.reveal();

      await win.webContents
        .executeJavaScript(buildE2ePickerHintTeardownScript())
        .catch(() => undefined);
      await win.webContents
        .executeJavaScript(buildE2ePickerHintScript(kind))
        .catch(() => undefined);

      try {
        const picked = await pickSelectorWithCdp(win, {
          timeoutMs: 120_000,
          kind,
        });
        if (picked.cancelled)
          return { ok: false, cancelled: true };
        if (!picked.ok)
          return { ok: false, error: picked.error ?? 'Could not attach the CSS selector picker.' };
        return { ok: true, selector: picked.selector, loadedUrl };
      } finally {
        await win.webContents
          .executeJavaScript(buildE2ePickerHintTeardownScript())
          .catch(() => undefined);
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to start selector picker',
      };
    } finally {
      lane.setInputAllowed(false);
      this.e2eWindowVisible = previousVisible;
      try {
        lane.close();
      } catch {
        // Window may already be gone.
      }
      this.pickLane = null;
    }
  }

  /**
   * Opens the device selector on the live emulator. Never boots the AVD — the
   * emulator must already be running. With Previous on, runs preceding device
   * steps first (Start Device never boots; Home only when that node's openHome
   * is on). With Previous off, leaves the current app/screen untouched.
   */
  async pickDeviceSelector(options: {
    readonly stopBeforeNodeId?: string | null;
    readonly scenario?: FlowScenario | null;
    readonly databases?: DatabasesFile;
    readonly envVars?: Readonly<Record<string, string>>;
    readonly runPrevious?: boolean;
  } = {}): Promise<{
    ok: boolean;
    selector?: string;
    cancelled?: boolean;
    error?: string | null;
  }> {
    if (this.abort)
      return { ok: false, error: 'Stop the current flow run before picking a selector.' };

    await this.deviceRelease;

    const status = this.android.status();
    if (!status.emulatorRunning) {
      const devices = await this.android.listDevices();
      const online = devices.some((item) => item.state === 'device');
      if (!online)
        return { ok: false, error: 'Start the emulator before picking a selector.' };
    }

    const stopBeforeNodeId =
      typeof options.stopBeforeNodeId === 'string' ? options.stopBeforeNodeId.trim() : '';
    const scenario = options.scenario ?? null;
    const envVars = options.envVars ?? {};
    const runPrevious = options.runPrevious === true;
    const previousArtifact = this.activeArtifact;

    try {
      // Previous off: leave the current app/screen alone — do not press Home or re-run steps.
      if (runPrevious && scenario && stopBeforeNodeId) {
        const prefixError = await this.runDevicePickPrefix({
          scenario,
          stopBeforeNodeId,
          envVars,
          runPrevious: true,
        });
        if (prefixError)
          return { ok: false, error: prefixError };
      }

      return await pickDeviceSelector({
        android: this.android,
        preferredSerial: this.devices.activeSerial() ?? this.emulatorSerial(),
        requireRunning: true,
      });
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to start device selector picker',
      };
    } finally {
      this.activeArtifact = previousArtifact;
      this.devices.detach();
    }
  }

  /**
   * For Pick + Previous: never boots Start Device. When openHome is on, presses Home.
   * Then runs Launch / Tap / Type / Wait / … before the target.
   */
  private async runDevicePickPrefix(options: {
    readonly scenario: FlowScenario;
    readonly stopBeforeNodeId: string;
    readonly envVars: Readonly<Record<string, string>>;
    readonly runPrevious: boolean;
  }): Promise<string | null> {
    const { scenario, stopBeforeNodeId, envVars, runPrevious } = options;
    const prefixIds = prefixNodeIdsBefore(scenario, stopBeforeNodeId);
    if (!prefixIds)
      return 'Connect Start to this node before picking a selector.';

    const controller = new AbortController();
    const signal = controller.signal;
    const vars: DeviceLaneVars = { vars: { ...envVars } };
    this.devices.beginRun();
    this.activeArtifact = {
      description: '',
      tags: [],
      environmentId: null,
      docs: '',
      e2eReplay: 'fast',
      e2eShowWindow: false,
      scenariosRunMode: 'sequential',
      scenarioFolders: [],
      scenarios: [scenario],
      deviceSerial: '',
      apkPath: '',
      deviceStartEmulator: true,
      deviceShowEmulator: true,
    };

    const nodes = new Map(scenario.nodes.map((node) => [node.id, node]));
    try {
      let attached = false;
      for (const id of prefixIds) {
        if (signal.aborted)
          return 'cancelled';
        const node = nodes.get(id);
        if (!node || node.enabled === false)
          continue;

        if (node.kind === 'device-start') {
          // Never press Home during Pick — that closes the app the user is authoring on.
          // Launch (when Previous is on) brings the package back to the foreground.
          if (!attached) {
            await this.devices.attachRunningSession(signal);
            attached = true;
          }
          continue;
        }

        if (!runPrevious)
          continue;
        if (!devicePickPrefixKind(node.kind))
          continue;
        // Skip Tap / Wait / Assert that still have no selector (still being authored).
        if (devicePickPrefixNeedsSelector(node.kind)) {
          const selector = interpolateFlow(flowConfigString(node, 'selector', ''), vars.vars).trim();
          if (!selector)
            continue;
        }
        if (!attached) {
          await this.devices.attachRunningSession(signal);
          attached = true;
        }
        try {
          await this.devices.run(node, this.activeArtifact, vars, signal);
        } catch (error) {
          const detail = error instanceof Error ? error.message : 'Device step failed';
          const label = node.name?.trim() || node.kind;
          throw new Error(`Previous · ${label}: ${detail}`);
        }
      }
      return null;
    } catch (error) {
      if (error instanceof Error && error.message === 'cancelled')
        return 'cancelled';
      return error instanceof Error ? error.message : 'Failed to run device steps before pick';
    }
  }

  /**
   * Runs draft scenario nodes that precede `stopBeforeNodeId` on the pick lane.
   * Leaves the window open for inspect mode when a browser step ran.
   */
  private async runPickPrefix(options: {
    readonly scenario: FlowScenario;
    readonly stopBeforeNodeId: string;
    readonly lane: BrowserLane;
    readonly databases: DatabasesFile;
    readonly envVars: Readonly<Record<string, string>>;
    /** When false, only opens a browser window if a browser node is in the prefix. */
    readonly ensureBrowser?: boolean;
  }): Promise<string | null> {
    const { scenario, stopBeforeNodeId, lane, databases, envVars } = options;
    const ensureBrowser = options.ensureBrowser !== false;
    const prefixIds = prefixNodeIdsBefore(scenario, stopBeforeNodeId);
    if (!prefixIds)
      return 'Connect Start to this node before picking a selector.';

    await this.clearE2eSession();
    const controller = new AbortController();
    const signal = controller.signal;
    const ctx: FlowEvalContext = {
      status: 0,
      body: '',
      headers: {},
      vars: { ...envVars },
      method: '',
      url: '',
      requestBody: '',
    };
    const scope: ScopeContext = {
      flowId: `pick:${scenario.id}`,
      scenario,
      rowIndex: 0,
      vars: ctx,
      databases,
      signal,
      lane,
      armedByNodeId: new Map(),
      artifact: this.activeArtifact,
    };
    this.e2eReplay = 'slow';

    const nodes = new Map(scenario.nodes.map((node) => [node.id, node]));
    try {
      if (ensureBrowser)
        await lane.ensure(1100, 800, { visible: true });
      for (const id of prefixIds) {
        if (signal.aborted)
          return 'cancelled';
        const node = nodes.get(id);
        if (!node || node.enabled === false)
          continue;
        if (isFlowBrowserKind(node.kind) && !lane.current())
          await lane.ensure(1100, 800, { visible: true });
        if (lane.current())
          await lane.setAction(flowNodeLabel(node));
        await this.runNode(scope, node, []);
      }
      return null;
    } catch (error) {
      if (error instanceof Error && error.message === 'cancelled')
        return 'cancelled';
      return error instanceof Error ? error.message : 'Failed to run steps before pick';
    }
  }

  trackWindow(win: BrowserWindow): void {
    this.windows.add(win);
    win.on('closed', () => {
      this.windows.delete(win);
      if (this.intentionalCloses.has(win)) {
        this.intentionalCloses.delete(win);
        return;
      }
      // User closed an E2E window mid-run → stop the flow (same as Cancel).
      if (!this.abort)
        return;
      this.abort.abort();
      this.abort = null;
      this.closeWindows();
    });
  }

  /** Mark a window so its close event does not cancel the active run. */
  markIntentionalClose(win: BrowserWindow): void {
    this.intentionalCloses.add(win);
  }

  async run(
    flowId: string,
    artifact: FlowArtifactFields,
    databases: DatabasesFile,
    envVars: Readonly<Record<string, string>> = {},
    scenarioId?: string | null,
  ): Promise<{ ok: boolean; error: string | null }> {
    this.cancel();
    await this.deviceRelease;
    const controller = new AbortController();
    this.abort = controller;
    this.activeArtifact = artifact;
    const usesDevice = flowHasDeviceNodes(artifact.scenarios);
    if (usesDevice)
      this.devices.beginRun();
    this.e2eWindowVisible = artifact.e2eShowWindow !== false;
    // Watchable pacing when the E2E window is shown; fast when it stays hidden.
    this.e2eReplay = this.e2eWindowVisible ? 'slow' : 'fast';
    let failure: string | null = null;

    try {
      await this.clearE2eSession();
      const selected = artifact.scenarios.filter((scenario) =>
        scenarioId ? scenario.id === scenarioId : scenario.enabled,
      );
      const blocked = selected.find((scenario) => !flowHasStartToEndPath(scenario));
      if (blocked)
        return {
          ok: false,
          error: `${blocked.name}: connect Start to End before running`,
        };
      const runMode = scenarioId
        ? 'sequential'
        : parseFlowScenariosRunMode(artifact.scenariosRunMode);

      if (runMode === 'parallel' && selected.length > 1) {
        const results = await Promise.all(
          selected.map((scenario) =>
            this.runScenarioRows(flowId, scenario, databases, envVars, controller.signal, artifact),
          ),
        );
        failure = results.find((item) => item !== null) ?? null;
      } else {
        for (const scenario of selected) {
          const error = await this.runScenarioRows(
            flowId,
            scenario,
            databases,
            envVars,
            controller.signal,
            artifact,
          );
          failure = failure ?? error;
        }
      }
      return { ok: failure === null, error: failure };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Flow failed';
      return { ok: message === 'cancelled', error: message === 'cancelled' ? null : message };
    } finally {
      if (usesDevice) {
        this.deviceRelease = this.releaseDevicesAndProxy();
        await this.deviceRelease;
      }
      this.closeWindows();
      this.e2eReplay = 'slow';
      this.e2eWindowVisible = true;
      if (this.abort === controller)
        this.abort = null;
    }
  }

  /**
   * Runs an in-memory scenario (template dry-run) without a saved flow artifact.
   */
  async runDraft(
    scenario: FlowScenario,
    databases: DatabasesFile,
    envVars: Readonly<Record<string, string>> = {},
    options: { readonly e2eShowWindow?: boolean; readonly deviceShowEmulator?: boolean } = {},
  ): Promise<{ ok: boolean; error: string | null }> {
    this.cancel();
    await this.deviceRelease;
    const controller = new AbortController();
    this.abort = controller;
    this.e2eWindowVisible = options.e2eShowWindow !== false;
    this.e2eReplay = this.e2eWindowVisible ? 'slow' : 'fast';
    this.activeArtifact = {
      description: '',
      tags: [],
      environmentId: null,
      docs: '',
      e2eReplay: this.e2eReplay,
      e2eShowWindow: this.e2eWindowVisible,
      scenariosRunMode: 'sequential',
      scenarioFolders: [],
      scenarios: [scenario],
      deviceSerial: '',
      apkPath: '',
      deviceStartEmulator: true,
      deviceShowEmulator: options.deviceShowEmulator !== false,
    };
    const draftArtifact = this.activeArtifact;
    const usesDevice = flowHasDeviceNodes(draftArtifact.scenarios);
    if (usesDevice)
      this.devices.beginRun();

    try {
      await this.clearE2eSession();
      if (!flowHasStartToEndPath(scenario))
        return { ok: false, error: `${scenario.name}: connect Start to End before running` };
      const failure = await this.runScenarioRows(
        `tpl:${scenario.id}`,
        scenario,
        databases,
        envVars,
        controller.signal,
        draftArtifact,
      );
      return { ok: failure === null, error: failure };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Flow failed';
      return { ok: message === 'cancelled', error: message === 'cancelled' ? null : message };
    } finally {
      if (usesDevice) {
        this.deviceRelease = this.releaseDevicesAndProxy();
        await this.deviceRelease;
      }
      this.closeWindows();
      this.e2eReplay = 'slow';
      this.e2eWindowVisible = true;
      if (this.abort === controller)
        this.abort = null;
    }
  }

  /** Runs every data row for one scenario. Returns the first failure message, if any. */
  private async runScenarioRows(
    flowId: string,
    scenario: FlowScenario,
    databases: DatabasesFile,
    envVars: Readonly<Record<string, string>>,
    signal: AbortSignal,
    artifact: FlowArtifactFields | null = null,
  ): Promise<string | null> {
    let failure: string | null = null;
    const runs = flowScenarioRunCount(scenario);
    for (let rowIndex = 0; rowIndex < runs; rowIndex += 1) {
      if (signal.aborted)
        throw new Error('cancelled');
      const row = scenario.data.enabled ? (scenario.data.rows[rowIndex] ?? {}) : {};
      const ctx: FlowEvalContext = {
        status: 0,
        body: '',
        headers: {},
        vars: { ...envVars, ...row },
        method: '',
        url: '',
        requestBody: '',
      };
      const scope: ScopeContext = {
        flowId,
        scenario,
        rowIndex,
        vars: ctx,
        databases,
        signal,
        lane: new BrowserLane(this, null),
        armedByNodeId: new Map(),
        artifact: artifact ?? this.activeArtifact,
      };
      try {
        await this.runScope(scope, null);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Scenario failed';
        if (message === 'cancelled')
          throw error;
        failure = failure ?? `${scenario.name}: ${message}`;
      }
    }
    return failure;
  }

  /** HTTP execute that aborts promptly when the flow/regression signal fires. */
  private async executeHttp(
    signal: AbortSignal,
    payload: HttpExecuteRequest,
  ): Promise<HttpExecuteResponse> {
    if (signal.aborted)
      throw new Error('cancelled');
    const abortId = `flow-${randomUUID()}`;
    const onAbort = (): void => {
      this.http.abort(abortId);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      const response = await this.http.execute({ ...payload, abortId });
      if (signal.aborted)
        throw new Error('cancelled');
      return response;
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  }

  private emit(
    scope: ScopeContext,
    node: FlowGraphNode,
    status: FlowRunEvent['status'],
    message: string,
    durationMs = 0,
    detail?: FlowRunEventDetail,
  ): void {
    this.onEvent?.({
      flowId: scope.flowId,
      scenarioId: scope.scenario.id,
      stepId: node.id,
      status,
      message,
      rowIndex: scope.rowIndex,
      durationMs,
      ...(detail ? { detail } : {}),
    });
  }

  /**
   * Runs one scope of the graph. Every node waits on its predecessors, and
   * sibling branches are started together with Promise.all.
   */
  private async runScope(scope: ScopeContext, scopeId: string | null): Promise<void> {
    const { scenario, signal } = scope;
    const plan = buildFlowRunPlan(scenario, scopeId);
    if (plan.roots.length === 0)
      return;

    const nodes = new Map(scenario.nodes.map((node) => [node.id, node]));
    const inScope = new Set(
      scenario.nodes
        .filter(
          (node) =>
            node.enabled &&
            node.kind !== 'note' &&
            !isFlowFrameKind(node.kind) &&
            flowExecutionScopeId(scenario, node) === scopeId,
        )
        .map((node) => node.id),
    );
    const edges = scenario.edges.filter((edge) => inScope.has(edge.from) && inScope.has(edge.to));
    const incoming = new Map<string, string[]>();
    for (const id of inScope)
      incoming.set(id, []);
    for (const edge of edges)
      incoming.get(edge.to)?.push(edge.from);

    const outcomes = new Map<string, NodeOutcome>();
    const started = new Map<string, Promise<void>>();
    const laneByNode = new Map<string, BrowserLane>();
    let firstError: unknown = null;

    const takenPort = (from: string, port: FlowPort): boolean => {
      const outcome = outcomes.get(from);
      if (outcome !== 'ok')
        return false;
      const node = nodes.get(from);
      if (!node)
        return false;
      if (node.kind === 'if')
        return port === (this.ifBranch(scope, node) ? 'then' : 'else');
      // A loop's body already ran inside runNode, so only Done continues here.
      if (port === 'body')
        return false;
      return true;
    };

    const visit = (id: string): Promise<void> => {
      const existing = started.get(id);
      if (existing)
        return existing;

      // Reserve the slot before any await so concurrent leaf walks cannot
      // double-run the same node (and assert against a sibling's navigated page).
      let settled = false;
      let resolveGate!: () => void;
      let rejectGate!: (error: unknown) => void;
      const gate = new Promise<void>((resolve, reject) => {
        resolveGate = resolve;
        rejectGate = reject;
      });
      const settle = (error: unknown) => {
        if (settled)
          return;
        settled = true;
        if (error)
          rejectGate(error);
        else
          resolveGate();
      };
      started.set(id, gate);

      void (async () => {
        try {
          const parents = incoming.get(id) ?? [];
          await Promise.all(parents.map((parent) => visit(parent)));
          if (signal.aborted)
            throw new Error('cancelled');

          const node = nodes.get(id);
          if (!node) {
            settle(null);
            return;
          }

          const reachable =
            parents.length === 0 ||
            edges.some((edge) => edge.to === id && takenPort(edge.from, edge.fromPort));
          if (!reachable) {
            outcomes.set(id, 'skipped');
            this.emit(scope, node, 'skipped', 'Branch not taken');
            settle(null);
            return;
          }

          const lane = this.laneFor(scope, node, parents, edges, laneByNode, nodes);
          laneByNode.set(id, lane);

          const startedAt = Date.now();
          const label = flowNodeLabel(node);
          this.emit(scope, node, 'running', label);
          try {
            await lane.setAction(label);
            const parentNodes = parents
              .map((parentId) => nodes.get(parentId))
              .filter((item): item is FlowGraphNode => Boolean(item));
            const detail = await this.runNode({ ...scope, lane }, node, parentNodes);
            outcomes.set(id, 'ok');
            const message = detail ? httpSummary(detail) : 'ok';
            this.emit(scope, node, 'ok', message, Date.now() - startedAt, detail ?? undefined);
            settle(null);
            // Defer close until successors have forked/inherited this lane.
            queueMicrotask(() =>
              this.releaseLaneIfIdle(lane, id, edges, started, outcomes, laneByNode),
            );
          } catch (error) {
            outcomes.set(id, 'error');
            const message = error instanceof Error ? error.message : 'Node failed';
            const detail = error instanceof FlowStepError ? error.detail : undefined;
            this.emit(scope, node, 'error', message, Date.now() - startedAt, detail);
            firstError = firstError ?? error;
            settle(error);
            queueMicrotask(() =>
              this.releaseLaneIfIdle(lane, id, edges, started, outcomes, laneByNode),
            );
          }
        } catch (error) {
          settle(error);
        }
      })();

      return gate;
    };

    const leaves = [...inScope].filter((id) => !edges.some((edge) => edge.from === id));
    const targets = leaves.length > 0 ? leaves : plan.roots;
    const results = await Promise.allSettled(targets.map((id) => visit(id)));
    const rejected = results.find((result) => result.status === 'rejected');
    if (rejected && rejected.status === 'rejected')
      throw rejected.reason;
    if (firstError)
      throw firstError;
  }

  /**
   * Close a browser lane once nothing still running (or about to start from it)
   * needs that window. Parallel forks shut down as soon as their branch ends.
   */
  private releaseLaneIfIdle(
    lane: BrowserLane,
    justFinishedId: string,
    edges: readonly { readonly from: string; readonly to: string; readonly fromPort: FlowPort }[],
    started: ReadonlyMap<string, Promise<void>>,
    outcomes: ReadonlyMap<string, NodeOutcome>,
    laneByNode: ReadonlyMap<string, BrowserLane>,
  ): void {
    for (const [nodeId, assigned] of laneByNode) {
      if (assigned !== lane || nodeId === justFinishedId)
        continue;
      if (!outcomes.has(nodeId))
        return;
    }

    // Successors are marked `started` while still awaiting parents — before they
    // call laneFor / laneByNode.set. Closing here would destroy the Open window
    // the moment it settles, then Wait/assert run against a fresh blank shell.
    for (const [nodeId, assigned] of laneByNode) {
      if (assigned !== lane)
        continue;
      for (const edge of edges) {
        if (edge.from !== nodeId)
          continue;
        if (!started.has(edge.to))
          return;
        if (!laneByNode.has(edge.to))
          return;
        if (laneByNode.get(edge.to) === lane && !outcomes.has(edge.to))
          return;
      }
    }

    lane.close();
  }

  /**
   * A node inherits its predecessor's browser lane. When that predecessor fans
   * out to several browser-driving branches, each branch forks a window seeded
   * at the page the parent left open. A single browser driver (e.g. Click next
   * to Validate HTTP) keeps the shared window so CDP listen/validate sees the
   * same traffic.
   */
  private laneFor(
    scope: ScopeContext,
    node: FlowGraphNode,
    parents: readonly string[],
    edges: readonly { readonly from: string; readonly to: string }[],
    laneByNode: ReadonlyMap<string, BrowserLane>,
    nodes: ReadonlyMap<string, FlowGraphNode>,
  ): BrowserLane {
    const first = parents[0];
    if (!first)
      return scope.lane;
    const inherited = laneByNode.get(first) ?? scope.lane;
    if (parents.length > 1)
      return inherited;
    const siblings = edges.filter((edge) => edge.from === first).map((edge) => edge.to);
    if (siblings.length <= 1)
      return inherited;
    const browserDrivers = siblings.filter((id) => {
      const sibling = nodes.get(id);
      return sibling ? isFlowBrowserKind(sibling.kind) : false;
    });
    if (browserDrivers.length <= 1)
      return inherited;
    if (!isFlowBrowserKind(node.kind))
      return inherited;
    return inherited.fork(this);
  }

  private ifBranch(scope: ScopeContext, node: FlowGraphNode): boolean {
    return evalFlowCondition(flowConfigString(node, 'condition', 'true') || 'true', scope.vars);
  }

  private async runNode(
    scope: ScopeContext,
    node: FlowGraphNode,
    parents: readonly FlowGraphNode[] = [],
  ): Promise<FlowRunEventDetail | null> {
    const { signal } = scope;
    switch (node.kind) {
      case 'wait':
        await sleep(flowConfigNumber(node, 'waitMs', 250), signal);
        return null;

      case 'join':
      case 'note':
      case 'if':
      case 'start':
      case 'end':
        return null;

      case 'manual': {
        if (this.batching)
          throw new FlowStepError('Manual step cannot run inside a regression pack');
        const prompt =
          interpolateFlow(flowConfigString(node, 'prompt', 'Enter a value to continue'), scope.vars.vars).trim() ||
          'Enter a value to continue';
        const variable =
          interpolateFlow(flowConfigString(node, 'variable', 'manual'), scope.vars.vars).trim() || 'manual';
        const placeholder = interpolateFlow(flowConfigString(node, 'placeholder'), scope.vars.vars);
        const value = await this.askManualPrompt(signal, {
          title: flowNodeLabel(node),
          prompt,
          variable,
          placeholder,
        });
        if (signal.aborted)
          throw new Error('cancelled');
        if (value == null)
          throw new FlowStepError('Manual step cancelled');
        if (!value.trim())
          throw new FlowStepError('Manual step requires a value');
        scope.vars.vars[variable] = value.trim();
        return {
          kind: 'manual',
          body: previewBody(value.trim()),
          captures: { [variable]: previewBody(value.trim()) },
        };
      }

      case 'set-var': {
        const name = flowConfigString(node, 'name');
        if (name)
          scope.vars.vars[name] = interpolateFlow(flowConfigString(node, 'value'), scope.vars.vars);
        return null;
      }

      case 'capture': {
        const captures = applyFlowCaptureRules(scope.vars, flowConfigString(node, 'rules'));
        return {
          kind: 'capture',
          status: scope.vars.status,
          method: scope.vars.method || undefined,
          url: scope.vars.url || undefined,
          body: previewBody(scope.vars.body),
          requestBody: scope.vars.requestBody ? previewBody(scope.vars.requestBody) : undefined,
          headers: scope.vars.headers,
          captures,
        };
      }

      case 'cache': {
        const key = `cache:${node.id}:${flowConfigString(node, 'key')}`;
        if (scope.vars.vars[key])
          return null;
        scope.vars.vars[key] = '1';
        return null;
      }

      case 'for-each': {
        const raw = scope.vars.vars[flowConfigString(node, 'items', 'items')] ?? '[]';
        let items: unknown[] = [];
        try {
          const parsed = JSON.parse(raw) as unknown;
          items = Array.isArray(parsed) ? parsed : [];
        } catch {
          items = [];
        }
        for (const item of items.slice(0, FLOW_LOOP_MAX_ITERATIONS)) {
          scope.vars.vars['item'] = typeof item === 'string' ? item : JSON.stringify(item);
          await this.runScope(scope, node.id);
        }
        return null;
      }

      case 'while': {
        const max = Math.max(1, Math.min(FLOW_LOOP_MAX_ITERATIONS, flowConfigNumber(node, 'maxIterations', 10)));
        let passes = 0;
        while (passes < max && evalFlowCondition(flowConfigString(node, 'condition', 'false'), scope.vars)) {
          await this.runScope(scope, node.id);
          passes += 1;
        }
        return null;
      }

      case 'retry': {
        const attempts = Math.max(1, Math.min(8, flowConfigNumber(node, 'attempts', 3)));
        let lastError: unknown = null;
        for (let attempt = 0; attempt < attempts; attempt += 1) {
          this.emit(scope, node, 'running', `Attempt ${attempt + 1}/${attempts}`);
          await scope.lane.setAction(`Retry ${attempt + 1}/${attempts}`);
          try {
            await this.runScope(scope, node.id);
            lastError = null;
            break;
          } catch (error) {
            if (error instanceof Error && error.message === 'cancelled')
              throw error;
            lastError = error;
          }
        }
        if (lastError)
          throw lastError;
        return null;
      }

      case 'request': {
        const method =
          interpolateFlow(flowConfigString(node, 'method', 'GET'), scope.vars.vars).trim().toUpperCase() || 'GET';
        const rawUrl = interpolateFlow(flowConfigString(node, 'url', '127.0.0.1/'), scope.vars.vars);
        const pathParams = parseFlowRequestKvRows(flowConfigString(node, 'pathParams')).map((row) => ({
          ...row,
          key: interpolateFlow(row.key, scope.vars.vars),
          value: interpolateFlow(row.value, scope.vars.vars),
        }));
        const queryParams = parseFlowRequestKvRows(flowConfigString(node, 'queryParams')).map((row) => ({
          ...row,
          key: interpolateFlow(row.key, scope.vars.vars),
          value: interpolateFlow(row.value, scope.vars.vars),
        }));
        const url = planFlowRequestUrl({ url: rawUrl, pathParams, queryParams });
        const requestBodyModel = interpolateFlowRequestBody(
          flowRequestBodyFromConfig({
            bodyMode: flowConfigString(node, 'bodyMode'),
            body: flowConfigString(node, 'body'),
            formRows: flowConfigString(node, 'formRows'),
            graphqlQuery: flowConfigString(node, 'graphqlQuery'),
            graphqlVariables: flowConfigString(node, 'graphqlVariables'),
            graphqlOperation: flowConfigString(node, 'graphqlOperation'),
            binaryName: flowConfigString(node, 'binaryName'),
            binaryType: flowConfigString(node, 'binaryType'),
            binaryBase64: flowConfigString(node, 'binaryBase64'),
          }),
          (value) => interpolateFlow(value, scope.vars.vars),
        );
        const encoded = planFlowRequestEncodedBody(requestBodyModel);
        const requestBody = encoded.text;
        const headers = mergeFlowRequestContentType(
          flowRequestHeaderPairs(parseFlowRequestKvRows(flowConfigString(node, 'headers'))).map(
            (pair) => ({
              key: interpolateFlow(pair.key, scope.vars.vars),
              value: interpolateFlow(pair.value, scope.vars.vars),
            }),
          ),
          encoded.contentType,
        );
        const response = await this.executeHttp(signal, {
          method,
          url,
          headers: [...headers],
          body: requestBody,
          followRedirects: true,
          verifyTls: true,
          timeoutMs: 30000,
          sendCookies: false,
          cookies: [],
          auth: DEFAULT_FOLDER_AUTH,
          preRequest: [],
          postResponse: [],
          variables: { ...scope.vars.vars },
        });
        const responseHeaders = headerMapFromPairs(response.headers);
        applyFlowResponse(scope.vars, response.status, response.body, responseHeaders, {
          method,
          url,
          requestBody,
        });
        return {
          kind: 'request',
          method,
          url,
          status: response.status,
          body: previewBody(response.body),
          requestBody: requestBody ? previewBody(requestBody) : undefined,
          headers: responseHeaders,
        };
      }

      case 'database': {
        const connection = findDatabaseConnection(scope.databases.nodes, flowConfigString(node, 'connectionId'));
        if (!connection)
          throw new Error('Database connection missing');
        const query = interpolateFlow(flowConfigString(node, 'query', 'SELECT 1'), scope.vars.vars);
        const envelope = await this.database.query({ connection, query });
        const columns = envelope.table.columns;
        const objects = envelope.table.rows.map((row) => {
          const record: Record<string, string | number | boolean | null> = {};
          columns.forEach((column, index) => {
            record[column] = row[index] ?? null;
          });
          return record;
        });
        const body = JSON.stringify(objects.slice(0, 50));
        applyFlowResponse(scope.vars, 200, body, {}, { url: query });
        scope.vars.vars['rowCount'] = String(envelope.table.rows.length);
        scope.vars.vars['rows'] = body;
        const first = objects[0];
        if (first) {
          for (const [column, value] of Object.entries(first))
            scope.vars.vars[column] = value == null ? '' : String(value);
        }
        return {
          kind: 'database',
          status: 200,
          body: previewBody(body),
          url: query.length > 120 ? `${query.slice(0, 120)}…` : query,
        };
      }

      case 'http-listener': {
        const matchUrl = interpolateFlow(flowConfigString(node, 'url'), scope.vars.vars);
        const method = interpolateFlow(flowConfigString(node, 'method', '*'), scope.vars.vars) || '*';
        const match = flowConfigString(node, 'match', 'contains') || 'contains';
        const waitMs = flowConfigNumber(node, 'waitMs', 10_000);
        const stage = parseFlowHttpStage(flowConfigString(node, 'stage', 'response'));
        const headerName = interpolateFlow(flowConfigString(node, 'headerName'), scope.vars.vars);
        const headerValue = interpolateFlow(flowConfigString(node, 'headerValue'), scope.vars.vars);
        const bodyContains = interpolateFlow(flowConfigString(node, 'bodyContains'), scope.vars.vars);
        const useProxy = Boolean(this.devices.activeSerial());
        const useBrowser =
          !useProxy &&
          (Boolean(scope.lane.current()) ||
            scope.scenario.nodes.some((item) => isFlowBrowserKind(item.kind)));
        if (useProxy) {
          await this.ensureDeviceProxy(scope.scenario);
          await this.deviceProxy.armRule({
            id: node.id,
            kind: 'listen',
            stage,
            method,
            match,
            url: matchUrl,
            headerName,
            headerValue,
            bodyContains,
            action: 'passthrough',
            setHeaders: '[]',
            removeHeaders: '[]',
            setBody: '',
            mockStatus: 200,
            mockBody: '{}',
          });
          scope.armedByNodeId.set(node.id, {
            source: 'proxy',
            method,
            match,
            urlNeedle: matchUrl,
            waitMs,
            since: Date.now(),
            stage,
            headerName,
            headerValue,
            bodyContains,
          });
        } else {
          if (useBrowser)
            await scope.lane.ensureNetworkCapture();
          scope.armedByNodeId.set(node.id, {
            source: useBrowser ? 'browser' : 'mock',
            method,
            match,
            urlNeedle: matchUrl,
            waitMs,
            since: Date.now(),
            stage,
            headerName,
            headerValue,
            bodyContains,
          });
        }
        return { kind: 'listener', url: matchUrl, method: 'ARM' };
      }

      case 'http-interceptor': {
        const matchUrl = interpolateFlow(flowConfigString(node, 'url'), scope.vars.vars);
        const method = interpolateFlow(flowConfigString(node, 'method', '*'), scope.vars.vars) || '*';
        const match = flowConfigString(node, 'match', 'contains') || 'contains';
        const waitMs = flowConfigNumber(node, 'waitMs', 10_000);
        const stage = parseFlowHttpStage(flowConfigString(node, 'stage', 'request'));
        const headerName = interpolateFlow(flowConfigString(node, 'headerName'), scope.vars.vars);
        const headerValue = interpolateFlow(flowConfigString(node, 'headerValue'), scope.vars.vars);
        const bodyContains = interpolateFlow(flowConfigString(node, 'bodyContains'), scope.vars.vars);
        const action = parseFlowInterceptAction(flowConfigString(node, 'action', 'passthrough'));
        const setHeaders = interpolateFlow(flowConfigString(node, 'setHeaders', '[]'), scope.vars.vars);
        const removeHeaders = interpolateFlow(flowConfigString(node, 'removeHeaders', '[]'), scope.vars.vars);
        const setBody = interpolateFlow(flowConfigString(node, 'setBody'), scope.vars.vars);
        const mockStatus = flowConfigNumber(node, 'mockStatus', 200);
        const mockBody = interpolateFlow(flowConfigString(node, 'mockBody', '{\n}\n'), scope.vars.vars);
        const useProxy = Boolean(this.devices.activeSerial());
        const useBrowser =
          !useProxy &&
          (Boolean(scope.lane.current()) ||
            scope.scenario.nodes.some((item) => isFlowBrowserKind(item.kind)));
        if (useProxy) {
          await this.ensureDeviceProxy(scope.scenario);
          await this.deviceProxy.armRule({
            id: node.id,
            kind: 'intercept',
            stage,
            method,
            match,
            url: matchUrl,
            headerName,
            headerValue,
            bodyContains,
            action,
            setHeaders,
            removeHeaders,
            setBody,
            mockStatus,
            mockBody,
          });
          scope.armedByNodeId.set(node.id, {
            source: 'proxy',
            method,
            match,
            urlNeedle: matchUrl,
            waitMs,
            since: Date.now(),
            stage,
            headerName,
            headerValue,
            bodyContains,
          });
        } else {
          if (useBrowser)
            await scope.lane.ensureNetworkCapture();
          scope.armedByNodeId.set(node.id, {
            source: useBrowser ? 'browser' : 'intercept',
            method,
            match,
            urlNeedle: matchUrl,
            waitMs,
            since: Date.now(),
            stage,
            headerName,
            headerValue,
            bodyContains,
          });
        }
        return { kind: 'interceptor', url: matchUrl, method: 'ARM' };
      }

      case 'trigger':
        // Nested flow runs are queued by the caller, not recursed here.
        return null;

      case 'http-validate':
      case 'assert-status': {
        await this.resolvePreviousHttp(scope, parents);
        const expected = flowConfigNumber(node, 'expected', 200);
        const actual = scope.vars.status;
        if (actual !== expected) {
          throw new FlowStepError(`Expected status ${expected}, saw ${actual}`, {
            kind: 'assert',
            expected: String(expected),
            actual: String(actual),
            status: actual,
            body: previewBody(scope.vars.body),
          });
        }
        return {
          kind: 'assert',
          expected: String(expected),
          actual: String(actual),
          status: actual,
        };
      }

      case 'assert-json': {
        await this.resolvePreviousHttp(scope, parents);
        const expression = flowConfigString(node, 'expression', 'status == 200');
        if (!evalFlowCondition(expression, scope.vars)) {
          throw new FlowStepError(`${flowNodeLabel(node)} did not hold`, {
            kind: 'assert',
            expected: expression,
            actual: `status=${scope.vars.status}`,
            status: scope.vars.status,
            body: previewBody(scope.vars.body),
          });
        }
        return {
          kind: 'assert',
          expected: expression,
          actual: 'true',
          status: scope.vars.status,
        };
      }

      default:
        if (isFlowDeviceKind(node.kind)) {
          const artifact = scope.artifact ?? this.activeArtifact;
          if (!artifact)
            throw new Error('Device nodes need a flow artifact.');
          await this.devices.run(node, artifact, scope.vars, signal);
          if (node.kind === 'device-start' && scenarioNeedsDeviceProxy(scope.scenario))
            await this.ensureDeviceProxy(scope.scenario);
          return null;
        }
        await this.runBrowserNode(scope, node);
        return null;
    }
  }

  /**
   * Validators always check the previous connected node. When that predecessor is
   * an armed Listen / Intercept, wait for its hit and load the response into scope.
   * Otherwise the previous node already left status/body on the shared scope.
   */
  private async resolvePreviousHttp(
    scope: ScopeContext,
    parents: readonly FlowGraphNode[],
  ): Promise<void> {
    const armParent = parents.find(
      (parent) => parent.kind === 'http-listener' || parent.kind === 'http-interceptor',
    );
    if (!armParent)
      return;
    await this.consumeArmedListen(scope, armParent.id);
  }

  private async consumeArmedListen(scope: ScopeContext, armNodeId: string): Promise<void> {
    const armed = scope.armedByNodeId.get(armNodeId);
    if (!armed) {
      throw new FlowStepError(
        'Previous Listen / Intercept did not arm a match. Check the Match URL on that node.',
        { kind: 'listener', hit: false },
      );
    }
    scope.armedByNodeId.delete(armNodeId);
    const filter = {
      method: armed.method,
      match: armed.match,
      url: armed.urlNeedle,
      stage: armed.stage,
      headerName: armed.headerName,
      headerValue: armed.headerValue,
      bodyContains: armed.bodyContains,
    };
    const hit =
      armed.source === 'proxy'
        ? await this.waitForProxyHit(armNodeId, filter, armed.waitMs, scope.signal, armed.since)
        : armed.source === 'browser'
          ? await scope.lane.waitForNetworkHit(filter, armed.waitMs, scope.signal, armed.since)
          : armed.source === 'mock'
            ? await this.waitForMockHit(filter, armed.waitMs, scope.signal, armed.since)
            : await this.waitForInterceptHit(filter, armed.waitMs, scope.signal, armed.since);
    if (armed.source === 'proxy')
      await this.deviceProxy.disarmRule(armNodeId).catch(() => undefined);
    if (!hit) {
      const message = armed.urlNeedle
        ? `No matching HTTP response for ${armed.method === '*' || !armed.method ? '' : `${armed.method} `}${armed.urlNeedle}`
        : 'No HTTP response captured';
      const armNode = scope.scenario.nodes.find((node) => node.id === armNodeId);
      if (armNode) {
        this.emit(scope, armNode, 'error', message.trim(), 0, {
          kind: armNode.kind === 'http-interceptor' ? 'interceptor' : 'listener',
          url: armed.urlNeedle,
          method: armed.method !== '*' ? armed.method : undefined,
          hit: false,
        });
      }
      throw new FlowStepError(message.trim(), { kind: 'assert', expected: 'HTTP hit', actual: 'none' });
    }
    const method = 'method' in hit && hit.method ? hit.method : 'GET';
    const url = 'url' in hit && hit.url ? hit.url : armed.urlNeedle;
    const requestBody = 'requestBody' in hit && typeof hit.requestBody === 'string' ? hit.requestBody : '';
    const requestHeaders =
      'requestHeaders' in hit && hit.requestHeaders ? hit.requestHeaders : undefined;
    applyFlowResponse(scope.vars, hit.status, hit.body, hit.headers, { method, url, requestBody });
    const armNode = scope.scenario.nodes.find((node) => node.id === armNodeId);
    if (armNode) {
      const detail: FlowRunEventDetail = {
        kind: armNode.kind === 'http-interceptor' ? 'interceptor' : 'listener',
        method,
        url,
        status: hit.status,
        body: previewBody(hit.body),
        requestBody: requestBody ? previewBody(requestBody) : undefined,
        headers: hit.headers,
        requestHeaders,
        hit: true,
      };
      this.emit(scope, armNode, 'ok', httpSummary(detail), 0, detail);
    }
  }

  private async waitForMockHit(
    filter: { readonly method?: string; readonly match?: string; readonly url?: string },
    waitMs: number,
    signal: AbortSignal,
    since: number,
  ): Promise<{
    status: number;
    body: string;
    headers: Readonly<Record<string, string>>;
    method: string;
    url: string;
    requestBody?: string;
    requestHeaders?: Readonly<Record<string, string>>;
  } | null> {
    const deadline = Date.now() + Math.max(0, waitMs);
    while (Date.now() <= deadline) {
      if (signal.aborted)
        throw new Error('cancelled');
      const hit = this.mock.latestHit(filter);
      if (hit && hit.at >= since)
        return hit;
      await sleep(50, signal);
    }
    const hit = this.mock.latestHit(filter);
    return hit && hit.at >= since ? hit : null;
  }

  private async waitForInterceptHit(
    filter: { readonly method?: string; readonly match?: string; readonly url?: string },
    waitMs: number,
    signal: AbortSignal,
    since: number,
  ): Promise<{
    status: number;
    body: string;
    headers: Readonly<Record<string, string>>;
    method?: string;
    url: string;
    requestBody?: string;
    requestHeaders?: Readonly<Record<string, string>>;
  } | null> {
    const deadline = Date.now() + Math.max(0, waitMs);
    while (Date.now() <= deadline) {
      if (signal.aborted)
        throw new Error('cancelled');
      const hit = this.intercept.latestHit(filter);
      if (hit && hit.at >= since)
        return hit;
      await sleep(50, signal);
    }
    const hit = this.intercept.latestHit(filter);
    return hit && hit.at >= since ? hit : null;
  }

  private async waitForProxyHit(
    ruleId: string,
    filter: {
      readonly method?: string;
      readonly match?: string;
      readonly url?: string;
      readonly stage?: 'request' | 'response';
      readonly headerName?: string;
      readonly headerValue?: string;
      readonly bodyContains?: string;
    },
    waitMs: number,
    signal: AbortSignal,
    since: number,
  ): Promise<{
    status: number;
    body: string;
    headers: Readonly<Record<string, string>>;
    method: string;
    url: string;
    requestBody?: string;
    requestHeaders?: Readonly<Record<string, string>>;
  } | null> {
    const deadline = Date.now() + Math.max(0, waitMs);
    while (Date.now() <= deadline) {
      if (signal.aborted)
        throw new Error('cancelled');
      const hit = this.deviceProxy.latestHit({ ruleId, ...filter, since });
      if (hit)
        return hit;
      await sleep(50, signal);
    }
    return this.deviceProxy.latestHit({ ruleId, ...filter, since });
  }

  private async ensureDeviceProxy(scenario: FlowScenario): Promise<void> {
    if (!scenarioNeedsDeviceProxy(scenario))
      return;
    const serial = this.devices.activeSerial();
    const adb = this.devices.adbClient();
    if (!serial || !adb)
      return;
    await this.deviceProxy.ensureForDevice(adb, serial);
  }

  private async releaseDevicesAndProxy(): Promise<void> {
    const serial = this.devices.activeSerial();
    const adb = this.devices.adbClient();
    await this.deviceProxy.releaseDevice(adb, serial).catch(() => undefined);
    await this.devices.release();
  }

  private rejectPendingManuals(): void {
    for (const [id, pending] of this.pendingManual) {
      this.pendingManual.delete(id);
      pending.resolve(null);
    }
  }

  private async askManualPrompt(
    signal: AbortSignal,
    input: {
      readonly title: string;
      readonly prompt: string;
      readonly variable: string;
      readonly placeholder: string;
    },
  ): Promise<string | null> {
    const parent =
      BrowserWindow.getFocusedWindow() ??
      BrowserWindow.getAllWindows().find((win) => !win.isDestroyed()) ??
      null;
    if (!parent || parent.isDestroyed())
      throw new FlowStepError('No window available for manual step');

    const requestId = randomUUID();
    const payload: FlowManualPromptRequest = {
      requestId,
      title: input.title,
      prompt: input.prompt,
      variable: input.variable,
      placeholder: input.placeholder || undefined,
    };

    return new Promise<string | null>((resolve) => {
      const finish = (value: string | null): void => {
        signal.removeEventListener('abort', onAbort);
        this.pendingManual.delete(requestId);
        resolve(value);
      };
      const onAbort = (): void => finish(null);
      if (signal.aborted) {
        resolve(null);
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
      this.pendingManual.set(requestId, {
        resolve: (value) => finish(value),
      });
      parent.webContents.send(IpcChannels.flowManualPrompt, payload);
    });
  }

  private async runBrowserNode(scope: ScopeContext, node: FlowGraphNode): Promise<void> {
    const vars = scope.vars.vars;
    const selector = interpolateFlow(flowConfigString(node, 'selector'), vars);

    if (node.kind === 'browser-open') {
      const win = await scope.lane.ensure(
        flowConfigNumber(node, 'width', 1100),
        flowConfigNumber(node, 'height', 800),
      );
      if (scope.signal.aborted || win.isDestroyed())
        throw new Error('cancelled');
      await this.load(win, interpolateFlow(flowConfigString(node, 'url', 'http://127.0.0.1/'), vars));
      if (scope.signal.aborted || win.isDestroyed())
        throw new Error('cancelled');
      await scope.lane.setAction(flowNodeLabel(node));
      scope.lane.reveal();
      return;
    }

    const win = scope.lane.current() ?? (await scope.lane.ensure());
    if (scope.signal.aborted || win.isDestroyed())
      throw new Error('cancelled');
    scope.lane.reveal();
    const run = async <T>(script: string, budgetMs = 4000): Promise<T> =>
      this.evalInPage<T>(win, script, budgetMs, scope.signal);

    switch (node.kind) {
      case 'browser-click': {
        const before = win.webContents.getURL();
        const point = await this.prepareTarget(win, selector, scope.signal);
        if (!point)
          throw new Error(`No element for ${selector}`);
        await scope.lane.withAutomation(async () => {
          await this.mouseClick(win, point.x, point.y, scope.signal);
        });
        await this.waitForPossibleNavigation(win, before, scope.signal);
        return;
      }

      case 'browser-hover': {
        const point = await this.prepareTarget(win, selector, scope.signal);
        if (!point)
          throw new Error(`No element for ${selector}`);
        await scope.lane.withAutomation(async () => {
          win.webContents.sendInputEvent({ type: 'mouseMove', x: point.x, y: point.y });
          await this.pace(280, scope.signal);
        });
        return;
      }

      case 'browser-type': {
        const text = interpolateFlow(flowConfigString(node, 'text'), vars);
        const clear = flowConfigBoolean(node, 'clearFirst', true);
        if (this.e2eReplay === 'fast') {
          const ok = await evalAcrossFrames(
            win,
            `(() => {
              ${DEEP_QUERY_HELPER}
              const el = __txQuery(${JSON.stringify(selector)});
              if (!el) return false;
              el.focus();
              if (${clear ? 'true' : 'false'} && 'value' in el) el.value = '';
              if ('value' in el) {
                el.value = ${JSON.stringify(text)};
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
              } else {
                el.textContent = ${JSON.stringify(text)};
              }
              return true;
            })()`,
            (value): value is true => value === true,
          );
          if (!ok)
            throw new Error(`No input for ${selector}`);
          return;
        }
        const point = await this.prepareTarget(win, selector, scope.signal);
        if (!point)
          throw new Error(`No input for ${selector}`);
        await scope.lane.withAutomation(async () => {
          await this.mouseClick(win, point.x, point.y, scope.signal);
          if (clear) {
            win.webContents.selectAll();
            await this.pace(40, scope.signal);
            win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Backspace' });
            win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Backspace' });
            await this.pace(40, scope.signal);
          }
          for (const char of text) {
            if (scope.signal.aborted)
              throw new Error('cancelled');
            win.webContents.sendInputEvent({ type: 'char', keyCode: char });
            await this.pace(28, scope.signal);
          }
          await this.pace(120, scope.signal);
        });
        return;
      }

      case 'browser-select': {
        const value = interpolateFlow(flowConfigString(node, 'value'), vars);
        const point = await this.prepareTarget(win, selector, scope.signal);
        if (!point)
          throw new Error(`No select for ${selector}`);
        await scope.lane.withAutomation(async () => {
          await this.mouseClick(win, point.x, point.y, scope.signal);
          const hit = await evalAcrossFrames(
            win,
            `(() => { ${DEEP_QUERY_HELPER} const el = __txQuery(${JSON.stringify(selector)}); if (!el) return false; el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`,
            (result): result is true => result === true,
          );
          if (!hit)
            throw new Error(`No select for ${selector}`);
          await this.pace(180, scope.signal);
        });
        return;
      }

      case 'browser-press': {
        const key = flowConfigString(node, 'key', 'Enter');
        const point = selector
          ? await this.prepareTarget(win, selector, scope.signal)
          : null;
        await scope.lane.withAutomation(async () => {
          if (point)
            await this.mouseClick(win, point.x, point.y, scope.signal);
          win.webContents.sendInputEvent({ type: 'keyDown', keyCode: key });
          win.webContents.sendInputEvent({ type: 'keyUp', keyCode: key });
          await this.pace(160, scope.signal);
        });
        return;
      }

      case 'browser-wait-for': {
        const timeout = Math.max(200, flowConfigNumber(node, 'timeoutMs', 5000));
        const deadline = Date.now() + timeout;
        const query = `(() => { ${DEEP_QUERY_HELPER} return Boolean(__txQuery(${JSON.stringify(selector || 'body')})); })()`;
        for (;;) {
          if (scope.signal.aborted)
            throw new Error('cancelled');
          const remaining = deadline - Date.now();
          if (remaining <= 0)
            throw new Error(`Timed out waiting for ${selector || 'body'} (${timeout}ms)`);
          let found = false;
          try {
            found =
              (await evalAcrossFrames(win, query, (value): value is true => value === true)) === true;
          } catch (error) {
            if (error instanceof Error && error.message === 'cancelled')
              throw error;
            if (Date.now() >= deadline)
              throw new Error(`Timed out waiting for ${selector || 'body'} (${timeout}ms)`);
          }
          if (found) {
            await this.prepareTarget(win, selector || 'body', scope.signal, Math.min(2000, deadline - Date.now()));
            return;
          }
          await sleep(Math.min(120, Math.max(0, deadline - Date.now())), scope.signal);
        }
      }

      case 'browser-screenshot': {
        const label = flowConfigString(node, 'name') || flowNodeLabel(node);
        scope.lane.reveal();
        // Parallel BrowserWindows can trip Electron's compositor (UnknownVizError).
        let lastError: unknown = null;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            await sleep(80 + attempt * 120, scope.signal);
            const image = await scope.lane.withGuardHidden(() => win.webContents.capturePage());
            vars[`screenshot:${label}`] = image.isEmpty() ? '' : image.toDataURL().slice(0, 64);
            return;
          } catch (error) {
            lastError = error;
          }
        }
        vars[`screenshot:${label}`] = '';
        vars[`screenshotError:${label}`] =
          lastError instanceof Error ? lastError.message : 'Screenshot capture failed';
        // Soft-fail: demos should not die on GPU capture glitches.
        return;
      }

      case 'browser-eval': {
        const value = await run<unknown>(flowConfigString(node, 'script', 'null'));
        vars['result'] = typeof value === 'string' ? value : JSON.stringify(value ?? '');
        return;
      }

      case 'assert-visible': {
        const timeout = Math.max(200, flowConfigNumber(node, 'timeoutMs', 5000));
        const deadline = Date.now() + timeout;
        const query = `(() => { ${DEEP_QUERY_HELPER} const el = __txQuery(${JSON.stringify(selector || 'body')}); if (!el) return false; const rect = el.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; })()`;
        for (;;) {
          if (scope.signal.aborted)
            throw new Error('cancelled');
          const remaining = deadline - Date.now();
          if (remaining <= 0)
            throw new Error(`${selector} is not visible (timed out after ${timeout}ms)`);
          let visible = false;
          try {
            visible =
              (await evalAcrossFrames(win, query, (value): value is true => value === true)) === true;
          } catch (error) {
            if (error instanceof Error && error.message === 'cancelled')
              throw error;
            if (Date.now() >= deadline)
              throw new Error(`${selector} is not visible (timed out after ${timeout}ms)`);
          }
          if (visible) {
            await this.prepareTarget(win, selector || 'body', scope.signal, Math.min(2000, deadline - Date.now()));
            return;
          }
          await sleep(Math.min(120, Math.max(0, deadline - Date.now())), scope.signal);
        }
      }

      case 'assert-text': {
        const actual = await evalAcrossFrames(
          win,
          `(() => { ${DEEP_QUERY_HELPER} const el = __txQuery(${JSON.stringify(selector || 'body')}); return el ? (el.textContent ?? '') : null; })()`,
          (value): value is string => typeof value === 'string',
        );
        if (actual === null)
          throw new Error(`No element for ${selector}`);
        const expected = interpolateFlow(flowConfigString(node, 'expected'), vars);
        assertFlowMatch(actual.trim(), expected, flowConfigString(node, 'match', 'contains'), selector);
        await this.prepareTarget(win, selector || 'body', scope.signal);
        return;
      }

      case 'assert-url': {
        const expected = interpolateFlow(flowConfigString(node, 'expected'), vars);
        const mode = flowConfigString(node, 'match', 'contains');
        const timeout = Math.max(0, flowConfigNumber(node, 'timeoutMs', 5000));
        if (timeout === 0) {
          assertFlowMatch(win.webContents.getURL(), expected, mode, 'URL');
          return;
        }
        const deadline = Date.now() + timeout;
        let actual = win.webContents.getURL();
        for (;;) {
          if (scope.signal.aborted)
            throw new Error('cancelled');
          actual = win.webContents.getURL();
          if (flowUrlMatches(actual, expected, mode))
            return;
          if (Date.now() >= deadline)
            break;
          await sleep(Math.min(120, Math.max(0, deadline - Date.now())), scope.signal);
        }
        assertFlowMatch(actual, expected, mode, 'URL');
        return;
      }

      default:
        return;
    }
  }

  /**
   * Run a page script with a hard deadline so a hung / throttled BrowserWindow
   * cannot stall wait / assert nodes forever.
   */
  private async evalInPage<T>(
    win: BrowserWindow,
    script: string,
    timeoutMs: number,
    signal: AbortSignal,
  ): Promise<T> {
    if (signal.aborted)
      throw new Error('cancelled');
    if (win.isDestroyed())
      throw new Error('cancelled');
    const budget = Math.max(100, timeoutMs);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onAbort = () => {
      if (timer)
        clearTimeout(timer);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      return await Promise.race([
        win.webContents.executeJavaScript(script) as Promise<T>,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`Page script timed out after ${budget}ms`)), budget);
          signal.addEventListener(
            'abort',
            () => reject(new Error('cancelled')),
            { once: true },
          );
        }),
      ]);
    } finally {
      if (timer)
        clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    }
  }

  /** Scrolls the target into view, paints a highlight ring, returns click coordinates. */
  private async prepareTarget(
    win: BrowserWindow,
    selector: string,
    signal: AbortSignal,
    timeoutMs = 4000,
  ): Promise<{ readonly x: number; readonly y: number } | null> {
    if (win.isDestroyed())
      return null;
    const quoted = JSON.stringify(selector || 'body');
    const script = `(() => {
      ${DEEP_QUERY_HELPER}
      const el = __txQuery(${quoted});
      if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
      const rect = el.getBoundingClientRect();
      let ring = document.getElementById('tx-e2e-target');
      if (!ring) {
        ring = document.createElement('div');
        ring.id = 'tx-e2e-target';
        ring.style.cssText = [
          'position:fixed',
          'z-index:2147483645',
          'border:2px solid #e85d8a',
          'border-radius:8px',
          'pointer-events:none',
          'box-shadow:0 0 0 4px rgba(232,93,138,0.28)',
          'transition:left 120ms ease,top 120ms ease,width 120ms ease,height 120ms ease',
        ].join(';');
        (document.body || document.documentElement).appendChild(ring);
      }
      ring.style.display = 'block';
      ring.style.left = Math.max(0, rect.left - 4) + 'px';
      ring.style.top = Math.max(0, rect.top - 4) + 'px';
      ring.style.width = Math.max(8, rect.width + 8) + 'px';
      ring.style.height = Math.max(8, rect.height + 8) + 'px';
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    })()`;

    const budget = Math.max(100, timeoutMs);
    const deadline = Date.now() + budget;
    type LocalPoint = { readonly x: number; readonly y: number };

    while (Date.now() < deadline) {
      if (signal.aborted || win.isDestroyed())
        return null;
      for (const frame of collectPageFrames(win)) {
        if (signal.aborted || win.isDestroyed())
          return null;
        let local: LocalPoint | null = null;
        try {
          local = (await Promise.race([
            frame.executeJavaScript(script) as Promise<LocalPoint | null>,
            new Promise<null>((resolve) => {
              setTimeout(() => resolve(null), Math.min(2500, Math.max(50, deadline - Date.now())));
            }),
          ])) as LocalPoint | null;
        } catch {
          local = null;
        }
        if (!local || typeof local.x !== 'number' || typeof local.y !== 'number')
          continue;
        const point = await toTopLevelPoint(frame, local);
        await this.pace(220, signal);
        return point;
      }
      await sleep(Math.min(120, Math.max(0, deadline - Date.now())), signal).catch(() => undefined);
    }
    return null;
  }

  private async mouseClick(
    win: BrowserWindow,
    x: number,
    y: number,
    signal: AbortSignal,
  ): Promise<void> {
    win.webContents.sendInputEvent({ type: 'mouseMove', x, y });
    await this.pace(90, signal);
    win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    win.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
    await this.pace(140, signal);
  }

  /** Scales watchable automation delays; fast skips almost all pacing. */
  private async pace(ms: number, signal: AbortSignal): Promise<void> {
    if (ms <= 0)
      return;
    if (this.e2eReplay === 'fast') {
      const scaled = Math.round(ms * 0.04);
      if (scaled <= 0)
        return;
      await sleep(scaled, signal);
      return;
    }
    await sleep(ms, signal);
  }

  private closeWindows(): void {
    for (const win of this.windows) {
      if (!win.isDestroyed()) {
        this.intentionalCloses.add(win);
        win.close();
      }
    }
    this.windows.clear();
  }

  private async load(win: BrowserWindow, url: string): Promise<string> {
    const trimmed = url.trim();
    if (!trimmed)
      throw new Error('Open URL is empty — set the URL or bind environment variables.');
    if (/^file:/i.test(trimmed)) {
      await this.loadOnce(win, trimmed);
      return trimmed;
    }

    const primary = ensureRequestUrlScheme(trimmed);
    if (!/^https?:\/\//i.test(primary))
      throw new Error(`Open URL must start with http:// or https:// (got "${trimmed}")`);

    const candidates = [...browserOpenUrlCandidates(primary)];
    if (candidates.length === 0)
      candidates.push(primary);

    let lastError: Error | null = null;
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index]!;
      try {
        await this.loadOnce(win, candidate);
        return candidate;
      } catch (error) {
        if (win.isDestroyed())
          throw new Error('cancelled');
        lastError = error instanceof Error ? error : new Error(String(error));
        if (isUsableBrowserPageUrl(win.webContents.getURL()))
          return win.webContents.getURL();
        const isLast = index === candidates.length - 1;
        const canRetry =
          isDnsOrHostLoadError(lastError) || isAbortedNavigationError(lastError);
        if (isLast || !canRetry)
          throw lastError;
      }
    }
    throw lastError ?? new Error(`Failed to load ${primary}`);
  }

  private async loadOnce(win: BrowserWindow, trimmed: string): Promise<void> {
    // Await Electron's loadURL promise so we never settle on a prior about:blank
    // dom-ready and leave a white window while navigation is still in flight.
    try {
      const loadBudgetMs = 30_000;
      await Promise.race([
        win.loadURL(trimmed),
        new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error(`Timed out loading ${trimmed} after ${loadBudgetMs}ms`)),
            loadBudgetMs,
          );
        }),
      ]);
    } catch (error) {
      if (win.isDestroyed())
        throw new Error('cancelled');
      // HTTP redirects (e.g. magenta.at → www) often reject with ERR_ABORTED after landing.
      if (isUsableBrowserPageUrl(win.webContents.getURL()))
        return;
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load ${trimmed}: ${message}`);
    }
    if (win.isDestroyed())
      throw new Error('cancelled');

    const loaded = win.webContents.getURL();
    if (!isUsableBrowserPageUrl(loaded))
      throw new Error(`Open stayed on blank after loading ${trimmed}`);

    await this.waitForDocumentInteractive(win);
    if (win.isDestroyed())
      throw new Error('cancelled');
  }

  /** Give in-page navigations a brief window to settle after a click. */
  private async waitForPossibleNavigation(
    win: BrowserWindow,
    beforeUrl: string,
    signal: AbortSignal,
  ): Promise<void> {
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      if (signal.aborted)
        throw new Error('cancelled');
      if (win.isDestroyed())
        throw new Error('cancelled');
      const current = win.webContents.getURL();
      if (current !== beforeUrl) {
        await this.waitForDocumentInteractive(win);
        return;
      }
      if (!win.webContents.isLoadingMainFrame() && Date.now() > deadline - 3500)
        return;
      await sleep(50, signal);
    }
  }

  /** Resolves when DOM is usable (interactive/complete), not when all assets finish. */
  private async waitForDocumentInteractive(win: BrowserWindow): Promise<void> {
    if (win.isDestroyed())
      throw new Error('cancelled');

    const controller = new AbortController();
    let ready = false;
    try {
      ready = await this.evalInPage<boolean>(
        win,
        `document.readyState === 'interactive' || document.readyState === 'complete'`,
        2000,
        controller.signal,
      );
    } catch {
      ready = false;
    }
    if (ready)
      return;

    await new Promise<void>((resolve) => {
      const finish = settleWebContents(win, resolve, 8000);
      if (win.isDestroyed()) {
        finish();
        return;
      }
      win.webContents.once('dom-ready', finish);
      win.webContents.once('did-finish-load', finish);
      win.webContents.once('did-fail-load', finish);
    });
  }
}
