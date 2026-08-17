import {
  GENERATED_CACHE_SOURCE,
  type CacheStepEntry,
  type ValidationRule,
  type TestSuiteStepType,
} from './test-suite-steps.schema';
import type { FlowStepRunCapture } from './flow-step-capture';
import {
  resolveValidationActualValue,
  validationSourcesForReferenceStepType,
} from './flow-step-validation';
import { extractFlowCachedValue, type FlowValueExtractInput } from './validation-value-extract';

export type CacheEntrySource = CacheStepEntry['source'];

/** Sources available when caching from HTTP request/listener/interceptor captures. */
export const HTTP_FLOW_CACHE_SOURCES = [
  'response_status',
  'response_body',
  'response_header',
] as const satisfies readonly CacheEntrySource[];

/**
 * Returns true when the cache source stores a generated template instead of a capture extract.
 */
export function isGeneratedCacheSource(
  source: CacheEntrySource,
): source is typeof GENERATED_CACHE_SOURCE {
  return source === GENERATED_CACHE_SOURCE;
}

/**
 * Returns true when the cache entry stores a generated template instead of a capture extract.
 */
export function isGeneratedCacheEntry(entry: CacheStepEntry): boolean {
  return isGeneratedCacheSource(entry.source);
}

/**
 * Template string for a generated cache entry (`$uuid`, `{{vars}}`).
 */
export function generatedCacheEntryTemplate(entry: CacheStepEntry): string {
  return String(entry.value ?? '');
}

function withGeneratedCacheSource(
  sources: readonly CacheEntrySource[],
): readonly CacheEntrySource[] {
  if (sources.includes(GENERATED_CACHE_SOURCE)) {
    return sources;
  }
  return [...sources, GENERATED_CACHE_SOURCE];
}

/** Maps reference step types to cacheable source fields. */
export function cacheSourcesForReferenceStepType(
  stepType: TestSuiteStepType | null | undefined,
): readonly CacheEntrySource[] {
  switch (stepType) {
    case 'REQUEST':
    case 'HTTP_LISTENER':
    case 'HTTP_INTERCEPTOR':
      return withGeneratedCacheSource(HTTP_FLOW_CACHE_SOURCES);
    case 'E2E':
      return withGeneratedCacheSource(validationSourcesForReferenceStepType(stepType));
    case 'DATABASE':
      return withGeneratedCacheSource(validationSourcesForReferenceStepType(stepType));
    default:
      return [GENERATED_CACHE_SOURCE];
  }
}

/** Maps legacy request-oriented cache sources to response capture fields. */
export function normalizeCacheEntryForReferenceStepType(
  stepType: TestSuiteStepType | null | undefined,
  entry: CacheStepEntry,
): CacheStepEntry {
  if (isGeneratedCacheEntry(entry)) {
    return entry;
  }
  if (
    stepType === 'REQUEST' ||
    stepType === 'HTTP_LISTENER' ||
    stepType === 'HTTP_INTERCEPTOR'
  ) {
    if (entry.source === 'request_body') {
      return { ...entry, source: 'response_body' };
    }
    if (entry.source === 'request_header') {
      return { ...entry, source: 'response_header' };
    }
    if (entry.source === 'request_param') {
      return { ...entry, source: 'response_body' };
    }
  }
  return entry;
}

export function cacheEntryExtractFailureMessage(
  entry: CacheStepEntry,
  variableName: string,
): string {
  const hasExtract = Boolean(String(entry.extract ?? '').trim() || entry.extractKind);
  if (hasExtract) {
    return `Could not extract a value for flow variable "{{${variableName}}}". Check the source is Response body and the extract path matches the JSON (e.g. $[0].id).`;
  }
  return `Could not cache a value for flow variable "{{${variableName}}}".`;
}

const DEFAULT_CACHE_CIPHER = { mode: 'none' as const, pem: '', keyPassword: '' };

/** Default generated-value cache entry (no reference step required). */
export function defaultGeneratedCacheEntry(): CacheStepEntry {
  return {
    variableName: '',
    source: GENERATED_CACHE_SOURCE,
    expression: '',
    value: '',
    extractKind: 'full',
    extract: '',
    cipher: { ...DEFAULT_CACHE_CIPHER },
  };
}

/**
 * Default cache entry for a reference step type, or a generated value when none is selected.
 */
export function defaultCacheEntryForReferenceStepType(
  stepType: TestSuiteStepType | null | undefined,
): CacheStepEntry {
  switch (stepType) {
    case 'REQUEST':
    case 'HTTP_LISTENER':
    case 'HTTP_INTERCEPTOR':
      return {
        variableName: '',
        source: 'response_body',
        expression: '',
        value: '',
        extractKind: 'jsonpath',
        extract: '',
        cipher: { ...DEFAULT_CACHE_CIPHER },
      };
    case 'DATABASE':
      return {
        variableName: '',
        source: 'cached_value',
        expression: '',
        value: '',
        extractKind: 'jsonpath',
        extract: '',
        cipher: { ...DEFAULT_CACHE_CIPHER },
      };
    case 'E2E':
      return {
        variableName: '',
        source: 'e2e_element_text',
        expression: '',
        value: '',
        extractKind: 'full',
        extract: '',
        cipher: { ...DEFAULT_CACHE_CIPHER },
      };
    default:
      return defaultGeneratedCacheEntry();
  }
}

/**
 * Drops cache entries whose source is not valid for the reference step, then falls back to a default.
 */
export function sanitizeCacheEntriesForReferenceStepType(
  stepType: TestSuiteStepType | null | undefined,
  entries: readonly CacheStepEntry[],
): CacheStepEntry[] {
  const allowed = new Set(cacheSourcesForReferenceStepType(stepType));
  const filtered = entries
    .map((entry) => normalizeCacheEntryForReferenceStepType(stepType, entry))
    .filter((entry) => allowed.has(entry.source));
  if (filtered.length > 0) {
    return [...filtered];
  }
  return [defaultCacheEntryForReferenceStepType(stepType)];
}

function cacheEntryAsValidationRule(entry: CacheStepEntry): ValidationRule {
  const source = entry.source;
  if (isGeneratedCacheSource(source)) {
    throw new Error('Generated cache entries do not read a prior step capture.');
  }
  return {
    source,
    expression: entry.expression ?? '',
    operator: 'equals',
    expected: '',
  };
}

function cacheEntryAsExtractInput(entry: CacheStepEntry): FlowValueExtractInput {
  return {
    source: entry.source,
    extractKind: entry.extractKind,
    extract: entry.extract,
  };
}

/** Reads a raw field value from a prior step capture for a cache entry. */
export function resolveCacheEntryRawValue(
  capture: FlowStepRunCapture,
  entry: CacheStepEntry,
): string {
  return resolveValidationActualValue(capture, cacheEntryAsValidationRule(entry));
}

/** Extracts and stringifies a cache entry value from a prior step capture. */
export function resolveCacheEntryValue(
  capture: FlowStepRunCapture,
  entry: CacheStepEntry,
): string | null {
  if (isGeneratedCacheEntry(entry)) {
    return generatedCacheEntryTemplate(entry);
  }
  const raw = resolveCacheEntryRawValue(capture, entry);
  return extractFlowCachedValue(raw, cacheEntryAsExtractInput(entry));
}
