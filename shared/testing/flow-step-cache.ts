import type { CacheStepEntry } from './test-suite-steps.schema';
import type { ValidationRule } from './test-suite-steps.schema';
import type { TestSuiteStepType } from './test-suite-steps.schema';
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

/** Maps reference step types to cacheable source fields. */
export function cacheSourcesForReferenceStepType(
  stepType: TestSuiteStepType | null | undefined,
): readonly CacheEntrySource[] {
  switch (stepType) {
    case 'REQUEST':
    case 'HTTP_LISTENER':
    case 'HTTP_INTERCEPTOR':
      return HTTP_FLOW_CACHE_SOURCES;
    case 'E2E':
      return validationSourcesForReferenceStepType(stepType);
    case 'DATABASE':
      return validationSourcesForReferenceStepType(stepType);
    default:
      return [];
  }
}

/** Maps legacy request-oriented cache sources to response capture fields. */
export function normalizeCacheEntryForReferenceStepType(
  stepType: TestSuiteStepType | null | undefined,
  entry: CacheStepEntry,
): CacheStepEntry {
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

export function defaultCacheEntryForReferenceStepType(
  stepType: TestSuiteStepType | null | undefined,
): CacheStepEntry | null {
  switch (stepType) {
    case 'REQUEST':
    case 'HTTP_LISTENER':
    case 'HTTP_INTERCEPTOR':
      return {
        variableName: '',
        source: 'response_body',
        expression: '',
        extractKind: 'jsonpath',
        extract: '',
      };
    case 'DATABASE':
      return {
        variableName: '',
        source: 'cached_value',
        expression: '',
        extractKind: 'jsonpath',
        extract: '',
      };
    case 'E2E':
      return {
        variableName: '',
        source: 'e2e_element_text',
        expression: '',
        extractKind: 'full',
        extract: '',
      };
    default:
      return null;
  }
}

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
  const fallback = defaultCacheEntryForReferenceStepType(stepType);
  return fallback ? [fallback] : [];
}

function cacheEntryAsValidationRule(entry: CacheStepEntry): ValidationRule {
  return {
    source: entry.source,
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
  const raw = resolveCacheEntryRawValue(capture, entry);
  return extractFlowCachedValue(raw, cacheEntryAsExtractInput(entry));
}
