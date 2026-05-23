import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';

import {
  captureFileSchema,
  migrateCaptureFile,
  interceptorFileSchema,
  loadTestsFileSchema,
  mockServerFileSchema,
  regressionsFileSchema,
  testSuitesFileSchema,
} from '../../../shared/testing';

import type { ConfigFileService } from '../../services/config/config-file.service';
import { TestingRuntimeService } from '../../services/testing/testing-runtime.service';
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

export function registerTestingHandlers(ipc: IpcMainBinder, deps: TestingHandlerDeps): void {
  const runtime = getTestingRuntime(deps.files);
  if (deps.getMainWindow) {
    runtime.setMainWindowProvider(deps.getMainWindow);
  }

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
    wrapInvokeHandler(TestingChannels.loadTestStatus, async () => runtime.loadTestStatus()),
  );
  ipc.handle(
    TestingChannels.loadTestMetrics,
    wrapInvokeHandler(TestingChannels.loadTestMetrics, async () => runtime.loadTestMetrics()),
  );
  ipc.handle(
    TestingChannels.loadTestStart,
    wrapInvokeHandler(TestingChannels.loadTestStart, async (_e, options: unknown) =>
      await runtime.loadTestStart(options),
    ),
  );
  ipc.handle(
    TestingChannels.loadTestCancel,
    wrapInvokeHandler(TestingChannels.loadTestCancel, async () => runtime.loadTestCancel()),
  );
  ipc.handle(
    TestingChannels.e2eExecuteFlow,
    wrapInvokeHandler(TestingChannels.e2eExecuteFlow, async (event, flowId: unknown) => {
      if (typeof flowId !== 'string') {
        return { ok: false, message: 'Invalid flow id.' };
      }
      return runtime.e2eExecuteFlow(flowId, event.sender);
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
}
