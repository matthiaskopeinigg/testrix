import type { IpcMainInvokeEvent } from 'electron';

import {
  captureFileSchema,
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

const runtime = new TestingRuntimeService();

export interface TestingHandlerDeps {
  readonly files: ConfigFileService;
}

export function registerTestingHandlers(ipc: IpcMainBinder, deps: TestingHandlerDeps): void {
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
      return deps.files.saveMockServer(parsed);
    }),
  );
  ipc.handle(
    TestingChannels.getCapture,
    wrapInvokeHandler(TestingChannels.getCapture, async () => deps.files.readCapture()),
  );
  ipc.handle(
    TestingChannels.setCapture,
    wrapInvokeHandler(TestingChannels.setCapture, async (_e: IpcMainInvokeEvent, data: unknown) => {
      const parsed = captureFileSchema.parse(data);
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
      return deps.files.saveInterceptor(parsed);
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
    TestingChannels.captureStatus,
    wrapInvokeHandler(TestingChannels.captureStatus, async () => runtime.captureStatus()),
  );
  ipc.handle(
    TestingChannels.captureStart,
    wrapInvokeHandler(TestingChannels.captureStart, async () => runtime.captureStart()),
  );
  ipc.handle(
    TestingChannels.captureStop,
    wrapInvokeHandler(TestingChannels.captureStop, async () => runtime.captureStop()),
  );
  ipc.handle(
    TestingChannels.captureListEntries,
    wrapInvokeHandler(TestingChannels.captureListEntries, async () => runtime.captureListEntries()),
  );
  ipc.handle(
    TestingChannels.interceptorStatus,
    wrapInvokeHandler(TestingChannels.interceptorStatus, async () => runtime.interceptorStatus()),
  );
  ipc.handle(
    TestingChannels.interceptorStart,
    wrapInvokeHandler(TestingChannels.interceptorStart, async () => runtime.interceptorStart()),
  );
  ipc.handle(
    TestingChannels.interceptorStop,
    wrapInvokeHandler(TestingChannels.interceptorStop, async () => runtime.interceptorStop()),
  );
  ipc.handle(
    TestingChannels.loadTestStatus,
    wrapInvokeHandler(TestingChannels.loadTestStatus, async () => runtime.loadTestStatus()),
  );
  ipc.handle(
    TestingChannels.loadTestStart,
    wrapInvokeHandler(TestingChannels.loadTestStart, async () => runtime.loadTestStart()),
  );
  ipc.handle(
    TestingChannels.loadTestCancel,
    wrapInvokeHandler(TestingChannels.loadTestCancel, async () => runtime.loadTestCancel()),
  );
  ipc.handle(
    TestingChannels.e2eExecuteFlow,
    wrapInvokeHandler(TestingChannels.e2eExecuteFlow, async (_e, flowId: unknown) => {
      if (typeof flowId !== 'string') {
        return { ok: false, message: 'Invalid flow id.' };
      }
      return runtime.e2eExecuteFlow(flowId);
    }),
  );
  ipc.handle(
    TestingChannels.e2eCancel,
    wrapInvokeHandler(TestingChannels.e2eCancel, async () => {
      runtime.e2eCancel();
      return undefined;
    }),
  );
}
