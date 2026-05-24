import { Injectable, inject } from '@angular/core';

import type { SettingsPatch } from '@shared/config';
import {
  type BundleApplyOptions,
  type BundleSelection,
  TESTRIX_BUNDLE_SCHEMA_V1,
  type TestrixBundleV1,
  filterBundle,
  mergeCollectionNodes,
  mergeEnvironmentDefinitions,
  mergeLoadTestItems,
  mergeMockServerItems,
  mergeRegressionItems,
  mergeTestSuiteRoots,
  parseFileToBundle,
  type ImportFormatKind,
} from '@shared/import-export';

import { CollectionsService } from '@app/core/collections/collections.service';
import { ConfigService } from '@app/core/config/config.service';
import { ElectronService } from '@app/core/electron/electron.service';
import { EnvironmentsService } from '@app/core/environments/environments.service';
import { CaptureWorkbenchStore } from '@app/core/testing/capture-workbench.store';
import { InterceptorWorkspaceStore } from '@app/core/testing/interceptor-workspace.store';
import { LoadTestService } from '@app/core/testing/load-test.service';
import { MockServerService } from '@app/core/testing/mock-server.service';
import { RegressionService } from '@app/core/testing/regression.service';
import { TestSuiteService } from '@app/core/testing/test-suite.service';

export interface ParseBundleResult {
  readonly bundle: TestrixBundleV1;
  readonly format: ImportFormatKind | 'legacy_envelope';
}

/**
 * Builds, parses, filters, and applies workspace import/export bundles.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceBundleService {
  private readonly electron = inject(ElectronService);
  private readonly config = inject(ConfigService);
  private readonly collections = inject(CollectionsService);
  private readonly environments = inject(EnvironmentsService);
  private readonly testSuites = inject(TestSuiteService);
  private readonly loadTests = inject(LoadTestService);
  private readonly regressions = inject(RegressionService);
  private readonly mockServer = inject(MockServerService);
  private readonly capture = inject(CaptureWorkbenchStore);
  private readonly interceptor = inject(InterceptorWorkspaceStore);

  parseFileToBundle(raw: string, sourceLabel: string): ParseBundleResult {
    const bridge = this.electron.bridge();
    const appVersion = bridge?.versions.app ?? '';
    return parseFileToBundle(raw, sourceLabel, appVersion);
  }

  filterBundle(source: TestrixBundleV1, selection: BundleSelection): TestrixBundleV1 {
    return filterBundle(source, selection);
  }

  /** Snapshots the active workspace into a native bundle. */
  async buildFromAppState(): Promise<TestrixBundleV1> {
    const bridge = this.electron.bridge();
    if (!bridge) {
      throw new Error('Import/export requires the desktop app.');
    }

    const appVersion = bridge.versions.app ?? '';
    const [collections, environments, testSuites, loadTests, regressions, mockServer, capture, interceptor, cookies] =
      await Promise.all([
        bridge.config.getCollections(),
        bridge.config.getEnvironments(),
        bridge.testing.getTestSuites(),
        bridge.testing.getLoadTests(),
        bridge.testing.getRegressions(),
        bridge.testing.getMockServer(),
        bridge.testing.getCapture(),
        bridge.testing.getInterceptor(),
        bridge.cookies.getAll(),
      ]);

    const settings = this.config.settings();
    return {
      schema: TESTRIX_BUNDLE_SCHEMA_V1,
      exportedAt: new Date().toISOString(),
      appVersion,
      collections,
      environments,
      testSuites,
      loadTests,
      regressions,
      mockServer,
      capture,
      interceptor,
      settings: settings ?? undefined,
      cookieJar: { cookies: [...cookies] },
    };
  }

  /** Applies a filtered bundle to the workspace and rehydrates affected services. */
  async applyBundle(
    bundle: TestrixBundleV1,
    selection: BundleSelection,
    options: BundleApplyOptions,
  ): Promise<{ summary: string }> {
    const bridge = this.electron.bridge();
    if (!bridge) {
      throw new Error('Import/export requires the desktop app.');
    }

    const filtered = filterBundle(bundle, selection);
    const parts: string[] = [];

    if (filtered.collections) {
      const incoming = filtered.collections;
      const next =
        options.mode === 'replace'
          ? incoming
          : {
              ...incoming,
              nodes: mergeCollectionNodes(
                (await bridge.config.getCollections()).nodes,
                incoming.nodes,
              ),
              meta: {
                ...incoming.meta,
                updatedAt: new Date().toISOString(),
              },
            };
      await bridge.config.setCollections(next);
      await this.collections.hydrate();
      parts.push(`${incoming.nodes.length} collection node(s)`);
    }

    if (filtered.environments) {
      const incoming = filtered.environments;
      const current = await bridge.config.getEnvironments();
      const next =
        options.mode === 'replace'
          ? incoming
          : {
              ...incoming,
              environments: mergeEnvironmentDefinitions(current.environments, incoming.environments),
              meta: { ...incoming.meta, updatedAt: new Date().toISOString() },
            };
      await bridge.config.setEnvironments(next);
      await this.environments.hydrate();
      parts.push(`${incoming.environments.length} environment(s)`);
    }

    if (filtered.testSuites) {
      const incoming = filtered.testSuites;
      const current = await bridge.testing.getTestSuites();
      const next =
        options.mode === 'replace'
          ? incoming
          : { ...incoming, suites: mergeTestSuiteRoots(current.suites, incoming.suites) };
      await bridge.testing.setTestSuites(next);
      await this.testSuites.hydrate();
      parts.push(`${incoming.suites.length} test suite(s)`);
    }

    if (filtered.loadTests) {
      const incoming = filtered.loadTests;
      const current = await bridge.testing.getLoadTests();
      const next =
        options.mode === 'replace'
          ? incoming
          : { ...incoming, items: mergeLoadTestItems(current.items, incoming.items) };
      await bridge.testing.setLoadTests(next);
      await this.loadTests.hydrate();
      parts.push(`${incoming.items.length} load test item(s)`);
    }

    if (filtered.regressions) {
      const incoming = filtered.regressions;
      const current = await bridge.testing.getRegressions();
      const next =
        options.mode === 'replace'
          ? incoming
          : { ...incoming, items: mergeRegressionItems(current.items, incoming.items) };
      await bridge.testing.setRegressions(next);
      await this.regressions.hydrate();
      parts.push(`${incoming.items.length} regression item(s)`);
    }

    if (filtered.mockServer) {
      const incoming = filtered.mockServer;
      const current = await bridge.testing.getMockServer();
      const next =
        options.mode === 'replace'
          ? incoming
          : { ...incoming, items: mergeMockServerItems(current.items, incoming.items) };
      await bridge.testing.setMockServer(next);
      await this.mockServer.hydrate();
      parts.push(`${incoming.items.length} mock item(s)`);
    }

    if (filtered.capture) {
      await bridge.testing.setCapture(filtered.capture);
      await this.capture.hydrate();
      parts.push('capture config');
    }

    if (filtered.interceptor) {
      await bridge.testing.setInterceptor(filtered.interceptor);
      await this.interceptor.hydrate();
      parts.push('interceptor config');
    }

    if (filtered.settings) {
      const patch = filtered.settings as SettingsPatch;
      await bridge.config.setSettings(patch);
      await this.config.hydrate();
      parts.push('settings');
    }

    if (filtered.cookieJar && selection.cookies) {
      if (options.mode === 'replace') {
        await bridge.cookies.clearAll();
      }
      await bridge.cookies.replaceFromSerialized(filtered.cookieJar);
      parts.push('cookie jar');
    }

    const summary = parts.length > 0 ? `Imported ${parts.join(', ')}` : 'Nothing selected to import';
    return { summary };
  }
}
