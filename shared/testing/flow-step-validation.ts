import type { ValidationRule } from './test-suite-steps.schema';
import type { TestSuiteStepType } from './test-suite-steps.schema';
import type {
  FlowStepE2eElementCapture,
  FlowStepHttpResponseCapture,
  FlowStepDatabaseCapture,
  FlowStepRunCapture,
} from './flow-step-capture';
import { isFlowValidationReferenceStepType } from './flow-step-capture';

export type ValidationRuleSource = ValidationRule['source'];

/** Response-oriented validation sources (REQUEST, HTTP listener/interceptor). */
export const HTTP_RESPONSE_VALIDATION_SOURCES = [
  'response_status',
  'response_body',
  'response_header',
  'request_body',
  'request_header',
] as const satisfies readonly ValidationRuleSource[];

/** Element-oriented validation sources (E2E steps). */
export const E2E_ELEMENT_VALIDATION_SOURCES = [
  'e2e_element_text',
  'e2e_element_html',
  'e2e_selector_exists',
  'e2e_page_url',
] as const satisfies readonly ValidationRuleSource[];

/** Cached query result validation (DATABASE steps). */
export const DATABASE_VALIDATION_SOURCES = ['cached_value'] as const satisfies readonly ValidationRuleSource[];

export function validationSourcesForReferenceStepType(
  stepType: TestSuiteStepType | null | undefined,
): readonly ValidationRuleSource[] {
  switch (stepType) {
    case 'E2E':
      return E2E_ELEMENT_VALIDATION_SOURCES;
    case 'REQUEST':
    case 'HTTP_LISTENER':
    case 'HTTP_INTERCEPTOR':
      return HTTP_RESPONSE_VALIDATION_SOURCES;
    case 'DATABASE':
      return DATABASE_VALIDATION_SOURCES;
    default:
      return [];
  }
}

export function defaultValidationRuleForReferenceStepType(
  stepType: TestSuiteStepType | null | undefined,
): ValidationRule | null {
  switch (stepType) {
    case 'E2E':
      return {
        source: 'e2e_element_text',
        expression: '',
        operator: 'is_not_empty',
        expected: '',
      };
    case 'REQUEST':
    case 'HTTP_LISTENER':
    case 'HTTP_INTERCEPTOR':
      return {
        source: 'response_status',
        expression: '',
        operator: 'equals',
        expected: '200',
      };
    case 'DATABASE':
      return {
        source: 'cached_value',
        expression: '',
        operator: 'is_not_empty',
        expected: '',
      };
    default:
      return null;
  }
}

export function isValidationSourceAllowedForReferenceStepType(
  stepType: TestSuiteStepType | null | undefined,
  source: ValidationRuleSource,
): boolean {
  return validationSourcesForReferenceStepType(stepType).includes(source);
}

export function sanitizeValidationRulesForReferenceStepType(
  stepType: TestSuiteStepType | null | undefined,
  rules: readonly ValidationRule[],
): ValidationRule[] {
  const allowed = new Set(validationSourcesForReferenceStepType(stepType));
  const filtered = rules.filter((rule) => allowed.has(rule.source));
  if (filtered.length > 0) {
    return [...filtered];
  }
  const fallback = defaultValidationRuleForReferenceStepType(stepType);
  return fallback ? [fallback] : [];
}

/** Resolves the actual value for a validation rule from a step capture. */
export function resolveValidationActualValue(
  capture: FlowStepRunCapture,
  rule: ValidationRule,
): string {
  if (capture.kind === 'http_response') {
    return resolveHttpValidationActual(capture, rule);
  }
  if (capture.kind === 'database_result') {
    return resolveDatabaseValidationActual(capture, rule);
  }
  return resolveE2eValidationActual(capture, rule);
}

function resolveDatabaseValidationActual(
  capture: FlowStepDatabaseCapture,
  rule: ValidationRule,
): string {
  if (rule.source === 'cached_value') {
    return capture.dbText;
  }
  return '';
}

function resolveHttpValidationActual(
  capture: FlowStepHttpResponseCapture,
  rule: ValidationRule,
): string {
  switch (rule.source) {
    case 'response_status':
      return String(capture.statusCode);
    case 'response_body':
      return capture.bodyText;
    case 'response_header': {
      const key = rule.expression.trim();
      if (!key) {
        return '';
      }
      const match = Object.entries(capture.headers).find(
        ([headerKey]) => headerKey.toLowerCase() === key.toLowerCase(),
      );
      return match?.[1] ?? '';
    }
    case 'request_body':
    case 'request_header':
      return '';
    default:
      return '';
  }
}

function resolveE2eValidationActual(
  capture: FlowStepE2eElementCapture,
  rule: ValidationRule,
): string {
  switch (rule.source) {
    case 'e2e_element_text':
      return capture.elementText;
    case 'e2e_element_html':
      return capture.elementHtml;
    case 'e2e_selector_exists':
      return capture.elementExists ? 'true' : 'false';
    case 'e2e_page_url':
      return capture.pageUrl;
    default:
      return '';
  }
}

/**
 * Normalizes a page URL for loose comparison: strips scheme, optional `www.`,
 * default ports, query/hash, and trailing slashes.
 */
export function normalizePageUrlForValidation(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withScheme);
    let host = parsed.hostname.toLowerCase();
    if (host.startsWith('www.')) {
      host = host.slice(4);
    }
    const path = parsed.pathname.replace(/\/+$/, '');
    return `${host}${path}`;
  } catch {
    let url = trimmed.toLowerCase();
    url = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
    url = url.replace(/^www\./i, '');
    url = url.split(/[?#]/, 1)[0] ?? url;
    url = url.replace(/\/+$/, '');
    return url;
  }
}

function evaluatePageUrlValidationRule(
  operator: ValidationRule['operator'],
  actual: string,
  expected: string,
): boolean | null {
  switch (operator) {
    case 'equals':
      return normalizePageUrlForValidation(actual) === normalizePageUrlForValidation(expected);
    case 'not_equals':
      return normalizePageUrlForValidation(actual) !== normalizePageUrlForValidation(expected);
    case 'contains':
      return normalizePageUrlForValidation(actual).includes(normalizePageUrlForValidation(expected));
    default:
      return null;
  }
}

/** Returns whether a validation rule passes for the given actual value. */
export function evaluateValidationRule(rule: ValidationRule, actual: string): boolean {
  const expected = rule.expected ?? '';
  if (rule.source === 'e2e_page_url') {
    const pageUrlResult = evaluatePageUrlValidationRule(rule.operator, actual, expected);
    if (pageUrlResult !== null) {
      return pageUrlResult;
    }
  }
  switch (rule.operator) {
    case 'equals':
      return actual === expected;
    case 'not_equals':
      return actual !== expected;
    case 'contains':
      return actual.includes(expected);
    case 'matches_regex':
      try {
        return new RegExp(expected).test(actual);
      } catch {
        return false;
      }
    case 'greater_than':
      return Number.parseFloat(actual) > Number.parseFloat(expected);
    case 'less_than':
      return Number.parseFloat(actual) < Number.parseFloat(expected);
    case 'exists':
      return actual.length > 0 && actual !== 'false';
    case 'not_exists':
      return actual.length === 0 || actual === 'false';
    case 'is_empty':
      return actual.trim().length === 0;
    case 'is_not_empty':
      return actual.trim().length > 0;
    default:
      return false;
  }
}

export function validationFailureMessage(rule: ValidationRule, actual: string): string {
  if (
    rule.source === 'e2e_page_url' &&
    (rule.operator === 'equals' || rule.operator === 'not_equals' || rule.operator === 'contains')
  ) {
    const normalizedActual = normalizePageUrlForValidation(actual);
    const normalizedExpected = normalizePageUrlForValidation(rule.expected ?? '');
    return (
      `Validation failed (${rule.source} ${rule.operator} "${rule.expected}"): ` +
      `got "${truncateForMessage(actual)}" ` +
      `(compared as "${normalizedExpected}" vs "${normalizedActual}")`
    );
  }
  return `Validation failed (${rule.source} ${rule.operator} "${rule.expected}"): got "${truncateForMessage(actual)}"`;
}

function truncateForMessage(value: string, max = 120): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max)}…`;
}

export function assertReferenceStepCanValidate(stepType: TestSuiteStepType | undefined): void {
  if (!isFlowValidationReferenceStepType(stepType)) {
    throw new Error('Reference step must be a request, E2E, HTTP listener, or HTTP interceptor step.');
  }
}
