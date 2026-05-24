import { importGraylog } from './converters/graylog';
import { importHar } from './converters/har';
import { importInsomniaExport } from './converters/insomnia';
import { importOpenApi } from './converters/openapi';
import { importPostmanCollection, importPostmanEnvironment } from './converters/postman';
import { detectImportFormat, type ImportFormatKind } from './detect-import-format';
import { parseLegacyEnvelope } from './parse-legacy-envelope';
import { applyRawConfigFile, bundleHasContent, coerceTestrixBundle, createEmptyTestrixBundle } from './raw-config-detect';
import { TESTRIX_BUNDLE_SCHEMA_V1, type TestrixBundleV1 } from './testrix-bundle.schema';

export interface ParseFileToBundleResult {
  readonly bundle: TestrixBundleV1;
  readonly format: ImportFormatKind | 'legacy_envelope';
}

/**
 * Parses raw file text into a normalized Testrix bundle for preview/import.
 */
export function parseFileToBundle(
  raw: string,
  sourceLabel: string,
  appVersion = '',
): ParseFileToBundleResult {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const format = detectImportFormat(sourceLabel, raw);
    if (format === 'openapi') {
      const collections = importOpenApi(raw);
      return {
        bundle: {
          ...createEmptyTestrixBundle(appVersion),
          collections,
        },
        format: 'openapi',
      };
    }
    if (format === 'graylog') {
      const collections = importGraylog(raw);
      return {
        bundle: {
          ...createEmptyTestrixBundle(appVersion),
          collections,
        },
        format: 'graylog',
      };
    }
    throw new Error(`File ${sourceLabel} is not valid JSON.`);
  }

  if (
    parsed &&
    typeof parsed === 'object' &&
    (parsed as { schema?: unknown }).schema === TESTRIX_BUNDLE_SCHEMA_V1
  ) {
    return { bundle: coerceTestrixBundle(parsed, appVersion), format: 'testrix' };
  }

  const legacy = parseLegacyEnvelope(parsed, appVersion);
  if (legacy) {
    return { bundle: legacy, format: 'legacy_envelope' };
  }

  const format = detectImportFormat(sourceLabel, raw, parsed);

  if (format === 'raw_config') {
    const bundle = createEmptyTestrixBundle(appVersion);
    const applied = applyRawConfigFile(sourceLabel, parsed, bundle);
    if (!applied) {
      throw new Error(`Unrecognized Testrix config file: ${sourceLabel}`);
    }
    return { bundle, format: 'raw_config' };
  }

  switch (format) {
    case 'postman_environment': {
      const environments = importPostmanEnvironment(raw);
      return {
        bundle: { ...createEmptyTestrixBundle(appVersion), environments },
        format,
      };
    }
    case 'postman': {
      const collections = importPostmanCollection(raw);
      return {
        bundle: { ...createEmptyTestrixBundle(appVersion), collections },
        format,
      };
    }
    case 'openapi': {
      const collections = importOpenApi(raw);
      return {
        bundle: { ...createEmptyTestrixBundle(appVersion), collections },
        format,
      };
    }
    case 'har': {
      const collections = importHar(parsed as object);
      return {
        bundle: { ...createEmptyTestrixBundle(appVersion), collections },
        format,
      };
    }
    case 'insomnia': {
      const collections = importInsomniaExport(parsed as object);
      return {
        bundle: { ...createEmptyTestrixBundle(appVersion), collections },
        format,
      };
    }
    case 'graylog': {
      const collections = importGraylog(raw);
      return {
        bundle: { ...createEmptyTestrixBundle(appVersion), collections },
        format,
      };
    }
    default:
      throw new Error(
        'Unrecognized file format. Expected Testrix bundle, Postman, OpenAPI, HAR, Insomnia, Graylog, or a native config file.',
      );
  }
}

export { detectImportFormat, formatImportKindLabel } from './detect-import-format';
export type { ImportFormatKind } from './detect-import-format';