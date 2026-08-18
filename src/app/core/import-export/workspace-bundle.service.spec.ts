import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { TESTRIX_BUNDLE_SCHEMA_V1, type BundleSelection, type TestrixBundleV1 } from '@shared/import-export';
import { TEST_SUITE_ROOT_ID, createDefaultTestSuitesFile } from '@shared/testing';

import { ConfigService } from '@app/core/config/config.service';
import { DatabaseQueriesService } from '@app/core/database/database-queries.service';
import { ElectronService } from '@app/core/electron/electron.service';
import { ProfileService } from '@app/core/profile/profile.service';

import { WorkspaceBundleService } from './workspace-bundle.service';

describe('WorkspaceBundleService.applyBundle', () => {
  it('reloads the workspace after writing imported files without flushing stale memory over them', async () => {
    const callOrder: string[] = [];
    const flushPendingWorkspaceWrites = vi.fn(async () => {
      callOrder.push('flush');
    });
    const rehydrateAfterExternalWrite = vi.fn(async () => {
      callOrder.push('rehydrate');
    });
    const setTestSuites = vi.fn(async (file: unknown) => {
      callOrder.push('write');
      return file;
    });
    const getTestSuites = vi.fn().mockResolvedValue(createDefaultTestSuitesFile());

    TestBed.configureTestingModule({
      providers: [
        WorkspaceBundleService,
        { provide: ConfigService, useValue: { settings: () => null } },
        { provide: DatabaseQueriesService, useValue: { replaceFile: vi.fn() } },
        {
          provide: ProfileService,
          useValue: { flushPendingWorkspaceWrites, rehydrateAfterExternalWrite },
        },
        {
          provide: ElectronService,
          useValue: {
            bridge: () => ({
              testing: { getTestSuites, setTestSuites },
            }),
          },
        },
      ],
    });

    const service = TestBed.inject(WorkspaceBundleService);
    const testSuites = createDefaultTestSuitesFile();
    const bundle: TestrixBundleV1 = {
      schema: TESTRIX_BUNDLE_SCHEMA_V1,
      exportedAt: new Date().toISOString(),
      appVersion: '1.1.2-beta.4',
      testSuites,
    };
    const selection: BundleSelection = {
      sections: new Set(['testSuites']),
      testSuites: new Set([TEST_SUITE_ROOT_ID]),
    };

    const result = await service.applyBundle(bundle, selection, { mode: 'merge' });

    expect(result.summary).toContain('test suite');
    expect(setTestSuites).toHaveBeenCalled();
    expect(callOrder).toEqual(['flush', 'write', 'rehydrate']);
  });
});
