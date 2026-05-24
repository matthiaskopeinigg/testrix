import type { TestrixBundleV1 } from './testrix-bundle.schema';
import {
  mergeCollectionNodes,
  mergeEnvironmentDefinitions,
  mergeLoadTestItems,
  mergeMockServerItems,
  mergeRegressionItems,
  mergeTestSuiteRoots,
} from './merge-helpers';
import { TESTRIX_BUNDLE_SCHEMA_V1 } from './testrix-bundle.schema';

/** Combines multiple bundles into one preview/import bundle (merge semantics). */
export function mergeBundles(bundles: readonly TestrixBundleV1[]): TestrixBundleV1 {
  if (bundles.length === 0) {
    return {
      schema: TESTRIX_BUNDLE_SCHEMA_V1,
      exportedAt: new Date().toISOString(),
      appVersion: '',
    };
  }
  const first = bundles[0]!;
  let out: TestrixBundleV1 = {
    schema: TESTRIX_BUNDLE_SCHEMA_V1,
    exportedAt: first.exportedAt,
    appVersion: first.appVersion,
  };

  for (const bundle of bundles) {
    if (bundle.collections) {
      out = {
        ...out,
        collections: out.collections
          ? {
              ...bundle.collections,
              nodes: mergeCollectionNodes(out.collections.nodes, bundle.collections.nodes),
            }
          : bundle.collections,
      };
    }
    if (bundle.environments) {
      out = {
        ...out,
        environments: out.environments
          ? {
              ...bundle.environments,
              environments: mergeEnvironmentDefinitions(
                out.environments.environments,
                bundle.environments.environments,
              ),
            }
          : bundle.environments,
      };
    }
    if (bundle.testSuites) {
      out = {
        ...out,
        testSuites: out.testSuites
          ? { ...bundle.testSuites, suites: mergeTestSuiteRoots(out.testSuites.suites, bundle.testSuites.suites) }
          : bundle.testSuites,
      };
    }
    if (bundle.loadTests) {
      out = {
        ...out,
        loadTests: out.loadTests
          ? { ...bundle.loadTests, items: mergeLoadTestItems(out.loadTests.items, bundle.loadTests.items) }
          : bundle.loadTests,
      };
    }
    if (bundle.regressions) {
      out = {
        ...out,
        regressions: out.regressions
          ? {
              ...bundle.regressions,
              items: mergeRegressionItems(out.regressions.items, bundle.regressions.items),
            }
          : bundle.regressions,
      };
    }
    if (bundle.mockServer) {
      out = {
        ...out,
        mockServer: out.mockServer
          ? { ...bundle.mockServer, items: mergeMockServerItems(out.mockServer.items, bundle.mockServer.items) }
          : bundle.mockServer,
      };
    }
    if (bundle.settings) {
      out = { ...out, settings: { ...out.settings, ...bundle.settings } };
    }
  }

  return out;
}
