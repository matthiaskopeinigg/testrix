import { z } from 'zod';

import type { CollectionsFile } from '../config/collections.schema';
import type { EnvironmentsFile } from '../config/environments.schema';
import type { SettingsFile } from '../config/settings.schema';
import type { CaptureFile } from '../testing/capture.schema';
import type { InterceptorFile } from '../testing/interceptor.schema';
import type { LoadTestsFile } from '../testing/load-tests.schema';
import type { MockServerFile } from '../testing/mock-server.schema';
import type { RegressionsFile } from '../testing/regressions.schema';
import type { TestSuitesFile } from '../testing/test-suites.schema';

/**
 * Schema identifier for native Testrix export bundles.
 * Bumped only when a non-backwards-compatible change is made to the bundle shape.
 */
export const TESTRIX_BUNDLE_SCHEMA_V1 = 'testrix/v1' as const;

export type TestrixBundleSchemaV1 = typeof TESTRIX_BUNDLE_SCHEMA_V1;

/**
 * Single-file native export. Each section is optional so users can export any subset
 * without dragging unrelated data along.
 */
export interface TestrixBundleV1 {
  schema: TestrixBundleSchemaV1;
  /** ISO 8601 timestamp written when the bundle was produced. */
  exportedAt: string;
  /** `package.json` version of the producing app, for debug context. */
  appVersion: string;

  collections?: CollectionsFile;
  environments?: EnvironmentsFile;
  testSuites?: TestSuitesFile;
  loadTests?: LoadTestsFile;
  regressions?: RegressionsFile;
  mockServer?: MockServerFile;
  capture?: CaptureFile;
  interceptor?: InterceptorFile;

  /** Partial settings: only the keys the user opted into are present. */
  settings?: Partial<SettingsFile>;

  /** Cookie jar dump (`tough-cookie` `CookieJar.toJSON()` shape). */
  cookieJar?: { cookies?: unknown[]; [k: string]: unknown };
}

/** Bundle keys that may carry user data; useful for tree group iteration. */
export const TESTRIX_BUNDLE_SECTION_KEYS = [
  'collections',
  'environments',
  'testSuites',
  'loadTests',
  'regressions',
  'mockServer',
  'capture',
  'interceptor',
  'settings',
  'cookieJar',
] as const satisfies ReadonlyArray<keyof TestrixBundleV1>;

export type TestrixBundleSectionKey = (typeof TESTRIX_BUNDLE_SECTION_KEYS)[number];

/** Setting sub-keys exposed in the export tree (one checkbox per top-level Settings property). */
export const SETTINGS_SECTION_KEYS = [
  'general',
  'appearance',
  'privacy',
  'updates',
  'ui',
  'logging',
  'dataConfig',
  'collections',
  'environments',
  'testSuite',
  'editor',
  'http',
  'databases',
] as const satisfies ReadonlyArray<keyof SettingsFile>;

export type SettingsSectionKey = (typeof SETTINGS_SECTION_KEYS)[number];

export const testrixBundleSchemaV1 = z.object({
  schema: z.literal(TESTRIX_BUNDLE_SCHEMA_V1),
  exportedAt: z.string(),
  appVersion: z.string(),
  collections: z.custom<CollectionsFile>().optional(),
  environments: z.custom<EnvironmentsFile>().optional(),
  testSuites: z.custom<TestSuitesFile>().optional(),
  loadTests: z.custom<LoadTestsFile>().optional(),
  regressions: z.custom<RegressionsFile>().optional(),
  mockServer: z.custom<MockServerFile>().optional(),
  capture: z.custom<CaptureFile>().optional(),
  interceptor: z.custom<InterceptorFile>().optional(),
  settings: z.custom<Partial<SettingsFile>>().optional(),
  cookieJar: z.record(z.string(), z.unknown()).optional(),
});

/** Creates an empty native bundle shell with metadata. */
export function createEmptyTestrixBundle(appVersion = ''): TestrixBundleV1 {
  return {
    schema: TESTRIX_BUNDLE_SCHEMA_V1,
    exportedAt: new Date().toISOString(),
    appVersion,
  };
}
