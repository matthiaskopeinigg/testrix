import { Injectable, inject } from '@angular/core';

import { normalizeDatabaseSettings, type SettingsPatch } from '@shared/config';
import {
  type BundleApplyOptions,
  type BundleSelection,
  TESTRIX_BUNDLE_SCHEMA_V1,
  type TestrixBundleV1,
  databaseSettingsHasContent,
  filterBundle,
  mergeCollectionNodes,
  mergeDatabaseConnectionItems,
  mergeEnvironmentDefinitions,
  mergeLoadTestItems,
  mergeMockServerItems,
  mergeRegressionItems,
  mergeSavedQueryItems,
  mergeTestSuiteRoots,
  omitSettingsDatabases,
  parseFileToBundle,
  type ImportFormatKind,
} from '@shared/import-export';

import { ConfigService } from '@app/core/config/config.service';
import { DatabaseQueriesService } from '@app/core/database/database-queries.service';
import { ElectronService } from '@app/core/electron/electron.service';
import { ProfileService } from '@app/core/profile/profile.service';

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
  private readonly profiles = inject(ProfileService);
  private readonly databaseQueries = inject(DatabaseQueriesService);

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
    const [
      collections,
      environments,
      testSuites,
      loadTests,
      regressions,
      mockServer,
      capture,
      interceptor,
      cookies,
      queries,
    ] = await Promise.all([
      bridge.config.getCollections(),
      bridge.config.getEnvironments(),
      bridge.testing.getTestSuites(),
      bridge.testing.getLoadTests(),
      bridge.testing.getRegressions(),
      bridge.testing.getMockServer(),
      bridge.testing.getCapture(),
      bridge.testing.getInterceptor(),
      bridge.cookies.getAll(),
      bridge.database.getQueries(),
    ]);

    const settings = this.config.settings();
    const connections = settings?.databases;
    const hasConnections = databaseSettingsHasContent(connections);
    const hasQueries = (queries?.nodes?.length ?? 0) > 0;

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
      databases:
        hasConnections || hasQueries
          ? {
              ...(hasConnections ? { connections } : {}),
              ...(hasQueries ? { queries } : {}),
            }
          : undefined,
      settings: omitSettingsDatabases(settings ?? undefined),
      cookieJar: { cookies: [...cookies] },
    };
  }

  /** Writes a filtered bundle to disk, then reloads the workspace UI from those files. */
  async applyBundle(
    bundle: TestrixBundleV1,
    selection: BundleSelection,
    options: BundleApplyOptions,
  ): Promise<{ summary: string }> {
    const bridge = this.electron.bridge();
    if (!bridge) {
      throw new Error('Import/export requires the desktop app.');
    }

    await this.profiles.flushPendingWorkspaceWrites();

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
      parts.push(`${incoming.items.length} mock item(s)`);
    }

    if (filtered.capture) {
      await bridge.testing.setCapture(filtered.capture);
      parts.push('capture config');
    }

    if (filtered.interceptor) {
      await bridge.testing.setInterceptor(filtered.interceptor);
      parts.push('interceptor config');
    }

    if (filtered.databases?.connections) {
      const incoming = normalizeDatabaseSettings(filtered.databases.connections);
      const current = normalizeDatabaseSettings(
        (await bridge.config.getSettings()).databases ?? {
          connections: [],
          nodes: [],
          idleDisconnectMinutes: 0,
        },
      );
      const next =
        options.mode === 'replace'
          ? incoming
          : normalizeDatabaseSettings({
              nodes: mergeDatabaseConnectionItems(current.nodes, incoming.nodes),
            });
      await bridge.config.setSettings({
        databases: {
          connections: [...next.connections],
          nodes: [...next.nodes],
        },
      });
      parts.push(`${next.connections.length} database connection(s)`);
    }

    if (filtered.databases?.queries) {
      const incoming = filtered.databases.queries;
      const current = await bridge.database.getQueries();
      const next =
        options.mode === 'replace'
          ? incoming
          : {
              schemaVersion: 2 as const,
              nodes: mergeSavedQueryItems(current.nodes, incoming.nodes),
            };
      await this.databaseQueries.replaceFile(next);
      parts.push(`${incoming.nodes.length} database query item(s)`);
    }

    if (filtered.settings) {
      const patch = filtered.settings as SettingsPatch;
      await bridge.config.setSettings(patch);
      parts.push('settings');
    }

    if (filtered.cookieJar && selection.cookies) {
      if (options.mode === 'replace') {
        await bridge.cookies.clearAll();
      }
      await bridge.cookies.replaceFromSerialized(filtered.cookieJar);
      parts.push('cookie jar');
    }

    if (parts.length > 0) {
      await this.profiles.rehydrateAfterExternalWrite();
    }

    const summary = parts.length > 0 ? `Imported ${parts.join(', ')}` : 'Nothing selected to import';
    return { summary };
  }
}
