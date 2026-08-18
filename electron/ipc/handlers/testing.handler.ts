import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';

import {
  captureFileSchema,
  migrateCaptureFile,
  interceptorFileSchema,
  loadTestsFileSchema,
  mockServerFileSchema,
  monitorsFileSchema,
  parseLoadTestIpcId,
  parseMonitorsFile,
  lookupsFileSchema,
  parseLookupsFile,
  regressionsFileSchema,
  testSuitesFileSchema,
} from '../../../shared/testing';
import { ErrorCodes, TestrixError } from '../../../shared/errors';

import type { ConfigFileService } from '../../services/config/config-file.service';
import { TestingRuntimeService } from '../../services/testing/testing-runtime.service';
import { getMonitorScheduler } from '../../services/testing/monitor-scheduler.service';
import { getLookupRunner } from '../../services/testing/lookup-runner.service';
import { E2eChannels } from '../channels/e2e.channels';
import { TestingChannels } from '../channels/testing.channels';
import { wrapInvokeHandler } from '../wrap-ipc-handler';
import type { IpcMainBinder } from '../register-ipc';

export interface TestingHandlerDeps {
  readonly files: ConfigFileService;
  readonly getMainWindow?: () => BrowserWindow | null;
}

let runtimeInstance: TestingRuntimeService | null = null;

/**
 * Returns the shared testing runtime (mock server, load test, …).
 */
export function getTestingRuntime(files: ConfigFileService): TestingRuntimeService {
  if (!runtimeInstance) {
    runtimeInstance = new TestingRuntimeService(files);
  }
  return runtimeInstance;
}

/**
 * Wires main window for mock-server push events after the window is created.
 */
export function setTestingRuntimeMainWindow(provider: () => BrowserWindow | null): void {
  runtimeInstance?.setMainWindowProvider(provider);
}

/**
 * Attempts mock server auto-start when profile config is ready.
 */
export async function tryTestingRuntimeAutoStart(files: ConfigFileService): Promise<void> {
  await getTestingRuntime(files).tryAutoStartMockServer();
}

/** Requires a non-empty load-test id for status, metrics, and cancel IPC. */
function requireLoadTestIpcId(value: unknown): string {
  const id = parseLoadTestIpcId(value);
  if (!id) {
    throw new TestrixError(ErrorCodes.CONFIG_VALIDATION_FAILED, 'Load test id is required.');
  }
  return id;
}

export function registerTestingHandlers(ipc: IpcMainBinder, deps: TestingHandlerDeps): void {
  const runtime = getTestingRuntime(deps.files);
  if (deps.getMainWindow) {
    runtime.setMainWindowProvider(deps.getMainWindow);
  }
  const scheduler = getMonitorScheduler(deps.files, runtime, () => deps.getMainWindow?.() ?? null);
  scheduler.start();

  ipc.handle(
    TestingChannels.getTestSuites,
    wrapInvokeHandler(TestingChannels.getTestSuites, async () => deps.files.readTestSuites()),
  );
  ipc.handle(
    TestingChannels.setTestSuites,
    wrapInvokeHandler(TestingChannels.setTestSuites, async (_e: IpcMainInvokeEvent, data: unknown) => {
      const parsed = testSuitesFileSchema.parse(data);
      return deps.files.saveTestSuites(parsed);
    }),
  );
  ipc.handle(
    TestingChannels.getLoadTests,
    wrapInvokeHandler(TestingChannels.getLoadTests, async () => deps.files.readLoadTests()),
  );
  ipc.handle(
    TestingChannels.setLoadTests,
    wrapInvokeHandler(TestingChannels.setLoadTests, async (_e: IpcMainInvokeEvent, data: unknown) => {
      const parsed = loadTestsFileSchema.parse(data);
      return deps.files.saveLoadTests(parsed);
    }),
  );
  ipc.handle(
    TestingChannels.getRegressions,
    wrapInvokeHandler(TestingChannels.getRegressions, async () => deps.files.readRegressions()),
  );
  ipc.handle(
    TestingChannels.setRegressions,
    wrapInvokeHandler(TestingChannels.setRegressions, async (_e: IpcMainInvokeEvent, data: unknown) => {
      const parsed = regressionsFileSchema.parse(data);
      return deps.files.saveRegressions(parsed);
    }),
  );
  ipc.handle(
    TestingChannels.getMockServer,
    wrapInvokeHandler(TestingChannels.getMockServer, async () => deps.files.readMockServer()),
  );
  ipc.handle(
    TestingChannels.setMockServer,
    wrapInvokeHandler(TestingChannels.setMockServer, async (_e: IpcMainInvokeEvent, data: unknown) => {
      const parsed = mockServerFileSchema.parse(data);
      const saved = await deps.files.saveMockServer(parsed);
      runtime.onMockServerFileSaved(saved);
      return saved;
    }),
  );
  ipc.handle(
    TestingChannels.getCapture,
    wrapInvokeHandler(TestingChannels.getCapture, async () => deps.files.readCapture()),
  );
  ipc.handle(
    TestingChannels.setCapture,
    wrapInvokeHandler(TestingChannels.setCapture, async (_e: IpcMainInvokeEvent, data: unknown) => {
      const parsed = migrateCaptureFile(data);
      return deps.files.saveCapture(parsed);
    }),
  );
  ipc.handle(
    TestingChannels.getInterceptor,
    wrapInvokeHandler(TestingChannels.getInterceptor, async () => deps.files.readInterceptor()),
  );
  ipc.handle(
    TestingChannels.setInterceptor,
    wrapInvokeHandler(TestingChannels.setInterceptor, async (_e: IpcMainInvokeEvent, data: unknown) => {
      const parsed = interceptorFileSchema.parse(data);
      const saved = await deps.files.saveInterceptor(parsed);
      runtime.onInterceptorFileSaved(saved);
      return saved;
    }),
  );

  ipc.handle(
    TestingChannels.mockStatus,
    wrapInvokeHandler(TestingChannels.mockStatus, async () => runtime.mockStatus()),
  );
  ipc.handle(
    TestingChannels.mockStart,
    wrapInvokeHandler(TestingChannels.mockStart, async () => runtime.mockStart()),
  );
  ipc.handle(
    TestingChannels.mockStop,
    wrapInvokeHandler(TestingChannels.mockStop, async () => runtime.mockStop()),
  );
  ipc.handle(
    TestingChannels.mockListMismatches,
    wrapInvokeHandler(TestingChannels.mockListMismatches, async () => runtime.mockListMismatches()),
  );
  ipc.handle(
    TestingChannels.mockClearMismatches,
    wrapInvokeHandler(TestingChannels.mockClearMismatches, async () => {
      runtime.mockClearMismatches();
      return undefined;
    }),
  );
  ipc.handle(
    TestingChannels.captureStatus,
    wrapInvokeHandler(TestingChannels.captureStatus, async () => runtime.captureStatus()),
  );
  ipc.handle(
    TestingChannels.captureStart,
    wrapInvokeHandler(TestingChannels.captureStart, async (_e, options: unknown) =>
      runtime.captureStart(options),
    ),
  );
  ipc.handle(
    TestingChannels.captureStop,
    wrapInvokeHandler(TestingChannels.captureStop, async () => runtime.captureStop()),
  );
  ipc.handle(
    TestingChannels.captureListEntries,
    wrapInvokeHandler(TestingChannels.captureListEntries, async (_e, captureItemId?: string) =>
      runtime.captureListEntries(captureItemId),
    ),
  );
  ipc.handle(
    TestingChannels.captureClearEntries,
    wrapInvokeHandler(TestingChannels.captureClearEntries, async (_e, captureItemId?: string) => {
      runtime.captureClearEntries(captureItemId);
      return undefined;
    }),
  );
  ipc.handle(
    TestingChannels.interceptorStatus,
    wrapInvokeHandler(TestingChannels.interceptorStatus, async () => runtime.interceptorStatus()),
  );
  ipc.handle(
    TestingChannels.interceptorStart,
    wrapInvokeHandler(TestingChannels.interceptorStart, async (_e, options: unknown) =>
      runtime.interceptorStart(options),
    ),
  );
  ipc.handle(
    TestingChannels.interceptorStop,
    wrapInvokeHandler(TestingChannels.interceptorStop, async () => runtime.interceptorStop()),
  );
  ipc.handle(
    TestingChannels.interceptorListHits,
    wrapInvokeHandler(TestingChannels.interceptorListHits, async () => runtime.interceptorListHits()),
  );
  ipc.handle(
    TestingChannels.interceptorClearHits,
    wrapInvokeHandler(TestingChannels.interceptorClearHits, async () => {
      runtime.interceptorClearHits();
      return undefined;
    }),
  );
  ipc.handle(
    TestingChannels.loadTestStatus,
    wrapInvokeHandler(TestingChannels.loadTestStatus, async (_e, loadTestId: unknown) => {
      const id = requireLoadTestIpcId(loadTestId);
      return runtime.loadTestStatus(id);
    }),
  );
  ipc.handle(
    TestingChannels.loadTestMetrics,
    wrapInvokeHandler(TestingChannels.loadTestMetrics, async (_e, loadTestId: unknown) => {
      const id = requireLoadTestIpcId(loadTestId);
      return runtime.loadTestMetrics(id);
    }),
  );
  ipc.handle(
    TestingChannels.loadTestStart,
    wrapInvokeHandler(TestingChannels.loadTestStart, async (_e, options: unknown) =>
      await runtime.loadTestStart(options),
    ),
  );
  ipc.handle(
    TestingChannels.loadTestCancel,
    wrapInvokeHandler(TestingChannels.loadTestCancel, async (_e, loadTestId: unknown) => {
      const id = requireLoadTestIpcId(loadTestId);
      return runtime.loadTestCancel(id);
    }),
  );
  ipc.handle(
    TestingChannels.e2eExecuteFlow,
    wrapInvokeHandler(TestingChannels.e2eExecuteFlow, async (event, flowId: unknown, options?: unknown) => {
      if (typeof flowId !== 'string') {
        return { ok: false, message: 'Invalid flow id.' };
      }
      const opts =
        options && typeof options === 'object' && !Array.isArray(options)
          ? (options as Record<string, unknown>)
          : {};
      return runtime.e2eExecuteFlow(flowId, event.sender, {
        startAtStepId: typeof opts.startAtStepId === 'string' ? opts.startAtStepId : undefined,
        stopAfterStepId: typeof opts.stopAfterStepId === 'string' ? opts.stopAfterStepId : undefined,
        stopBeforeStepId: typeof opts.stopBeforeStepId === 'string' ? opts.stopBeforeStepId : undefined,
        initialVariables:
          opts.initialVariables && typeof opts.initialVariables === 'object'
            ? (opts.initialVariables as Record<string, string>)
            : undefined,
      });
    }),
  );
  ipc.handle(
    E2eChannels.pickElementStart,
    wrapInvokeHandler(E2eChannels.pickElementStart, async (event, payload: unknown) => {
      const body =
        payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
      return runtime.e2ePickElement(body, event.sender);
    }),
  );
  ipc.handle(
    TestingChannels.e2eCancel,
    wrapInvokeHandler(TestingChannels.e2eCancel, async () => {
      runtime.e2eCancel();
      return undefined;
    }),
  );
  ipc.handle(
    TestingChannels.flowManualInputSubmit,
    wrapInvokeHandler(TestingChannels.flowManualInputSubmit, async (_event, payload: unknown) =>
      runtime.submitFlowManualInput(payload),
    ),
  );
  ipc.handle(
    TestingChannels.e2eUpdateCheckpointBaseline,
    wrapInvokeHandler(TestingChannels.e2eUpdateCheckpointBaseline, async (_event, payload: unknown) => {
      const body =
        payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
      return runtime.e2eUpdateCheckpointBaseline({
        flowId: typeof body.flowId === 'string' ? body.flowId : '',
        stepId: typeof body.stepId === 'string' ? body.stepId : '',
      });
    }),
  );
  ipc.handle(
    TestingChannels.regressionStatus,
    wrapInvokeHandler(TestingChannels.regressionStatus, async () => runtime.regressionStatus()),
  );
  ipc.handle(
    TestingChannels.regressionStart,
    wrapInvokeHandler(TestingChannels.regressionStart, async (event, options: unknown) =>
      runtime.regressionStart(options, event.sender),
    ),
  );
  ipc.handle(
    TestingChannels.regressionCancel,
    wrapInvokeHandler(TestingChannels.regressionCancel, async () => runtime.regressionCancel()),
  );
  ipc.handle(
    TestingChannels.getMonitors,
    wrapInvokeHandler(TestingChannels.getMonitors, async () => deps.files.readMonitors()),
  );
  ipc.handle(
    TestingChannels.setMonitors,
    wrapInvokeHandler(TestingChannels.setMonitors, async (_e, data: unknown) => {
      const parsed = monitorsFileSchema.safeParse(data);
      if (!parsed.success) {
        throw new TestrixError(ErrorCodes.CONFIG_VALIDATION_FAILED, 'Invalid monitors payload.');
      }
      return deps.files.saveMonitors(parseMonitorsFile(parsed.data));
    }),
  );
  ipc.handle(
    TestingChannels.monitorRunNow,
    wrapInvokeHandler(TestingChannels.monitorRunNow, async (_e, monitorId: unknown) => {
      if (typeof monitorId !== 'string' || !monitorId.trim()) {
        throw new TestrixError(ErrorCodes.CONFIG_VALIDATION_FAILED, 'Monitor id is required.');
      }
      return scheduler.runNow(monitorId.trim());
    }),
  );
  const lookupRunner = getLookupRunner(deps.files);
  ipc.handle(
    TestingChannels.getLookups,
    wrapInvokeHandler(TestingChannels.getLookups, async () => deps.files.readLookups()),
  );
  ipc.handle(
    TestingChannels.setLookups,
    wrapInvokeHandler(TestingChannels.setLookups, async (_e, data: unknown) => {
      const parsed = lookupsFileSchema.safeParse(data);
      if (!parsed.success) {
        throw new TestrixError(ErrorCodes.CONFIG_VALIDATION_FAILED, 'Invalid lookups payload.');
      }
      return deps.files.saveLookups(parseLookupsFile(parsed.data));
    }),
  );
  ipc.handle(
    TestingChannels.lookupRun,
    wrapInvokeHandler(TestingChannels.lookupRun, async (_e, payload: unknown) => lookupRunner.run(payload)),
  );
}
