import {
  CAPTURE_FILE_NAME,
  COLLECTIONS_FILE_NAME,
  ENVIRONMENTS_FILE_NAME,
  LOAD_TESTS_FILE_NAME,
  MOCK_SERVER_FILE_NAME,
  REGRESSIONS_FILE_NAME,
  SETTINGS_FILE_NAME,
  TEST_SUITES_FILE_NAME,
} from '../config/constants';
import { collectionsFileSchema } from '../config/collections.schema';
import { environmentsFileSchema } from '../config/environments.schema';
import { settingsFileSchema } from '../config/settings.schema';
import { captureFileSchema } from '../testing/capture.schema';
import { interceptorFileSchema } from '../testing/interceptor.schema';
import { loadTestsFileSchema } from '../testing/load-tests.schema';
import { mockServerFileSchema } from '../testing/mock-server.schema';
import { regressionsFileSchema } from '../testing/regressions.schema';
import { testSuitesFileSchema } from '../testing/test-suites.schema';
import { createEmptyTestrixBundle, TESTRIX_BUNDLE_SCHEMA_V1, type TestrixBundleV1 } from './testrix-bundle.schema';

const RAW_CONFIG_MAP: ReadonlyArray<{
  readonly fileName: string;
  readonly apply: (parsed: unknown, bundle: TestrixBundleV1) => void;
}> = [
  {
    fileName: COLLECTIONS_FILE_NAME,
    apply: (parsed, bundle) => {
      const result = collectionsFileSchema.safeParse(parsed);
      if (result.success) {
        bundle.collections = result.data;
      }
    },
  },
  {
    fileName: ENVIRONMENTS_FILE_NAME,
    apply: (parsed, bundle) => {
      const result = environmentsFileSchema.safeParse(parsed);
      if (result.success) {
        bundle.environments = result.data;
      }
    },
  },
  {
    fileName: TEST_SUITES_FILE_NAME,
    apply: (parsed, bundle) => {
      const result = testSuitesFileSchema.safeParse(parsed);
      if (result.success) {
        bundle.testSuites = result.data;
      }
    },
  },
  {
    fileName: LOAD_TESTS_FILE_NAME,
    apply: (parsed, bundle) => {
      const result = loadTestsFileSchema.safeParse(parsed);
      if (result.success) {
        bundle.loadTests = result.data;
      }
    },
  },
  {
    fileName: REGRESSIONS_FILE_NAME,
    apply: (parsed, bundle) => {
      const result = regressionsFileSchema.safeParse(parsed);
      if (result.success) {
        bundle.regressions = result.data;
      }
    },
  },
  {
    fileName: MOCK_SERVER_FILE_NAME,
    apply: (parsed, bundle) => {
      const result = mockServerFileSchema.safeParse(parsed);
      if (result.success) {
        bundle.mockServer = result.data;
      }
    },
  },
  {
    fileName: SETTINGS_FILE_NAME,
    apply: (parsed, bundle) => {
      const result = settingsFileSchema.safeParse(parsed);
      if (result.success) {
        bundle.settings = result.data;
      }
    },
  },
  {
    fileName: CAPTURE_FILE_NAME,
    apply: (parsed, bundle) => {
      const result = captureFileSchema.safeParse(parsed);
      if (result.success) {
        bundle.capture = result.data;
      }
    },
  },
];

/** Attempts to map a raw Testrix config file (by name + JSON shape) into a bundle section. */
export function applyRawConfigFile(
  fileName: string,
  parsed: unknown,
  bundle: TestrixBundleV1,
): boolean {
  const lower = fileName.toLowerCase();
  for (const entry of RAW_CONFIG_MAP) {
    if (lower === entry.fileName || lower.endsWith(`/${entry.fileName}`)) {
      entry.apply(parsed, bundle);
      return bundleHasSectionData(bundle);
    }
  }

  if (lower === 'interceptor.json' || lower.endsWith('/interceptor.json')) {
    const result = interceptorFileSchema.safeParse(parsed);
    if (result.success) {
      bundle.interceptor = result.data;
      return true;
    }
  }

  return false;
}

function bundleHasSectionData(bundle: TestrixBundleV1): boolean {
  return (
    bundle.collections != null ||
    bundle.environments != null ||
    bundle.testSuites != null ||
    bundle.loadTests != null ||
    bundle.regressions != null ||
    bundle.mockServer != null ||
    bundle.capture != null ||
    bundle.interceptor != null ||
    bundle.settings != null
  );
}

/** Coerces a parsed object into a validated Testrix bundle. */
export function coerceTestrixBundle(parsed: unknown, appVersion = ''): TestrixBundleV1 {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid bundle: not an object.');
  }
  const o = parsed as Record<string, unknown>;
  if (o['schema'] !== TESTRIX_BUNDLE_SCHEMA_V1) {
    throw new Error('Invalid bundle schema.');
  }
  return {
    schema: TESTRIX_BUNDLE_SCHEMA_V1,
    exportedAt: String(o['exportedAt'] ?? new Date().toISOString()),
    appVersion: String(o['appVersion'] ?? appVersion),
    collections: o['collections'] as TestrixBundleV1['collections'],
    environments: o['environments'] as TestrixBundleV1['environments'],
    testSuites: o['testSuites'] as TestrixBundleV1['testSuites'],
    loadTests: o['loadTests'] as TestrixBundleV1['loadTests'],
    regressions: o['regressions'] as TestrixBundleV1['regressions'],
    mockServer: o['mockServer'] as TestrixBundleV1['mockServer'],
    capture: o['capture'] as TestrixBundleV1['capture'],
    interceptor: o['interceptor'] as TestrixBundleV1['interceptor'],
    settings: o['settings'] as TestrixBundleV1['settings'],
    cookieJar: o['cookieJar'] as TestrixBundleV1['cookieJar'],
  };
}

/** Returns true when the bundle contains at least one exportable section. */
export function bundleHasContent(bundle: TestrixBundleV1): boolean {
  return (
    bundleHasSectionData(bundle) ||
    bundle.cookieJar != null
  );
}

/** Creates an empty bundle with only metadata (for failed/partial parses). */
export { createEmptyTestrixBundle };
