import type { ValidationRule, ValidationStepConfig, TestSuiteStepStatus } from './test-suite-steps.schema';
import type { TestSuiteFlow, TestSuiteFlowStep } from './test-suites.schema';
import { findFlowStepById } from './test-suite-flow-order';
import type { FlowStepRunCapture } from './flow-step-capture';
import {
  evaluateValidationRule,
  resolveValidationActualValue,
  sanitizeValidationRulesForReferenceStepType,
} from './flow-step-validation';

const VALIDATION_SOURCE_LABELS: Record<ValidationRule['source'], string> = {
  response_status: 'Response status',
  response_body: 'Response body',
  response_header: 'Response header',
  request_body: 'Request body',
  request_header: 'Request header',
  request_param: 'Request param',
  cached_value: 'Cached value',
  e2e_element_text: 'Element text',
  e2e_element_html: 'Element HTML',
  e2e_selector_exists: 'Element exists',
  e2e_page_url: 'Page URL / redirect',
};

const VALIDATION_OPERATOR_LABELS: Record<ValidationRule['operator'], string> = {
  equals: 'equals',
  not_equals: 'not equals',
  contains: 'contains',
  matches_regex: 'matches regex',
  matches_json_schema: 'matches JSON schema',
  greater_than: 'greater than',
  less_than: 'less than',
  is_null: 'is null',
  is_not_null: 'is not null',
  exists: 'exists',
  not_exists: 'not exists',
  is_empty: 'is empty',
  is_not_empty: 'is not empty',
};

/** Formats a duration in milliseconds for run log display. */
export function formatFlowRunDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return '—';
  }
  if (ms < 1000) {
    return `${Math.round(ms)} ms`;
  }
  if (ms < 60_000) {
    const seconds = ms / 1000;
    return seconds >= 10 ? `${Math.round(seconds)} s` : `${seconds.toFixed(1)} s`;
  }
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

/** Formats an ISO run timestamp for the run log header. */
export function formatFlowRunTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

const INLINE_ERROR_MAX_CHARS = 120;

/** Returns the first failed step id in run order, if any. */
export function findFirstFailedFlowStepId(
  steps: readonly { readonly id: string }[],
  statuses: Readonly<Record<string, TestSuiteStepStatus>>,
): string | null {
  for (const step of steps) {
    if (statuses[step.id] === 'failed') {
      return step.id;
    }
  }
  return null;
}

/** Strips a leading `"Step name: "` prefix from a flow run failure message. */
export function parseFlowRunStepError(
  runMessage: string | null | undefined,
  step: TestSuiteFlowStep,
): string | null {
  const message = runMessage?.trim();
  if (!message) {
    return null;
  }
  const stepName = step.name.trim();
  if (!stepName) {
    return message;
  }
  const prefix = `${stepName}: `;
  if (message.startsWith(prefix)) {
    const trimmed = message.slice(prefix.length).trim();
    return trimmed.length > 0 ? trimmed : message;
  }
  return message;
}

/** Resolves the error text for a step after or during a run. */
export function resolveFlowStepRunError(
  step: TestSuiteFlowStep,
  status: TestSuiteStepStatus,
  options: {
    readonly liveError?: string | null;
    readonly runMessage?: string | null;
  } = {},
): string | null {
  if (status !== 'failed') {
    return null;
  }
  const live = options.liveError?.trim();
  if (live) {
    return live;
  }
  const persisted = step.error?.trim();
  if (persisted) {
    return persisted;
  }
  return parseFlowRunStepError(options.runMessage, step);
}

/** Truncates an error for inline timeline display. */
export function truncateFlowRunErrorInline(error: string, max = INLINE_ERROR_MAX_CHARS): string {
  if (error.length <= max) {
    return error;
  }
  return `${error.slice(0, max)}…`;
}

export interface FlowValidationCheckResult {
  readonly label: string;
  readonly operatorLabel: string;
  readonly expected: string;
  readonly actual: string;
  readonly passed: boolean;
}

/** Builds validation check rows (expected vs actual) for a validation step. */
export function buildFlowValidationCheckResults(
  rules: readonly ValidationRule[],
  capture: FlowStepRunCapture,
): readonly FlowValidationCheckResult[] {
  return rules.map((rule) => {
    const actual = resolveValidationActualValue(capture, rule);
    const expression = rule.expression.trim();
    const labelBase = VALIDATION_SOURCE_LABELS[rule.source] ?? rule.source;
    const label = expression.length > 0 ? `${labelBase} (${expression})` : labelBase;
    return {
      label,
      operatorLabel: VALIDATION_OPERATOR_LABELS[rule.operator] ?? rule.operator,
      expected: rule.expected ?? '',
      actual,
      passed: evaluateValidationRule(rule, actual),
    };
  });
}

export interface FlowStepCaptureSummaryLine {
  readonly label: string;
  readonly value: string;
}

export interface FlowStepCapturePreview {
  readonly title: string;
  readonly language: 'plaintext' | 'json' | 'html';
  readonly content: string;
}

export interface FlowStepRunLogDetails {
  readonly stepId: string;
  readonly status: TestSuiteStepStatus;
  readonly durationLabel: string | null;
  readonly error: string | null;
  readonly validationChecks: readonly FlowValidationCheckResult[];
  readonly captureLines: readonly FlowStepCaptureSummaryLine[];
  readonly capturePreview: FlowStepCapturePreview | null;
  readonly hasContent: boolean;
}

const PREVIEW_MAX_CHARS = 2_000;

function truncatePreview(value: string, max = PREVIEW_MAX_CHARS): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max)}\n… (${value.length - max} more characters)`;
}

function buildCaptureSummaryLines(capture: FlowStepRunCapture): FlowStepCaptureSummaryLine[] {
  if (capture.kind === 'http_response') {
    const lines: FlowStepCaptureSummaryLine[] = [];
    if (capture.requestMethod || capture.requestUrl) {
      lines.push({
        label: 'Request',
        value: [capture.requestMethod, capture.requestUrl].filter(Boolean).join(' '),
      });
    }
    lines.push({
      label: 'Status',
      value: `${capture.statusCode}${capture.statusText ? ` ${capture.statusText}` : ''}`,
    });
    const headerCount = Object.keys(capture.headers).length;
    if (headerCount > 0) {
      lines.push({ label: 'Headers', value: `${headerCount} header${headerCount === 1 ? '' : 's'}` });
    }
    if (capture.bodyText.trim()) {
      lines.push({ label: 'Body size', value: `${capture.bodyText.length} characters` });
    }
    return lines;
  }

  const lines: FlowStepCaptureSummaryLine[] = [];
  if (capture.action) {
    lines.push({ label: 'Action', value: capture.action });
  }
  if (capture.pageUrl) {
    lines.push({ label: 'Page URL', value: capture.pageUrl });
  }
  if (capture.selector) {
    lines.push({ label: 'Selector', value: capture.selector });
  }
  lines.push({
    label: 'Element exists',
    value: capture.elementExists ? 'yes' : 'no',
  });
  if (capture.elementText.trim()) {
    lines.push({ label: 'Text length', value: `${capture.elementText.length} characters` });
  }
  return lines;
}

function buildCapturePreview(
  capture: FlowStepRunCapture,
  stepType: TestSuiteFlowStep['stepType'],
): FlowStepCapturePreview | null {
  if (capture.kind === 'http_response') {
    const body = capture.bodyText.trim();
    if (!body) {
      return null;
    }
    const language = body.startsWith('{') || body.startsWith('[') ? 'json' : 'plaintext';
    return {
      title: 'Response body',
      language,
      content: truncatePreview(body),
    };
  }

  if (stepType === 'E2E') {
    const html = capture.elementHtml.trim();
    if (html) {
      return {
        title: 'Element HTML',
        language: 'html',
        content: truncatePreview(html),
      };
    }
    const text = capture.elementText.trim();
    if (text) {
      return {
        title: 'Element text',
        language: 'plaintext',
        content: truncatePreview(text),
      };
    }
  }

  return null;
}

/** Builds detail content for a selected step in the run log. */
export function buildFlowStepRunLogDetails(
  step: TestSuiteFlowStep,
  flow: TestSuiteFlow,
  status: TestSuiteStepStatus,
  durationMs: number | null | undefined,
  options: {
    readonly liveError?: string | null;
    readonly runMessage?: string | null;
  } = {},
): FlowStepRunLogDetails {
  const capture = step.lastRunCapture ?? null;
  let validationChecks: readonly FlowValidationCheckResult[] = [];

  if (step.stepType === 'VALIDATION') {
    const cfg = step.config as ValidationStepConfig;
    const refStep = cfg.refStepId ? findFlowStepById(flow.nodes, cfg.refStepId) : null;
    const refCapture = refStep?.lastRunCapture ?? null;
    if (refStep && refCapture) {
      const rules = sanitizeValidationRulesForReferenceStepType(refStep.stepType, cfg.rules ?? []);
      validationChecks = buildFlowValidationCheckResults(rules, refCapture);
    }
  }

  const captureLines =
    step.stepType !== 'VALIDATION' && capture ? buildCaptureSummaryLines(capture) : [];
  const capturePreview =
    step.stepType !== 'VALIDATION' && capture
      ? buildCapturePreview(capture, step.stepType)
      : null;

  const durationLabel =
    durationMs != null && durationMs >= 0 ? formatFlowRunDuration(durationMs) : null;
  const error = resolveFlowStepRunError(step, status, options);

  const hasContent =
    status === 'failed' ||
    Boolean(error) ||
    validationChecks.length > 0 ||
    captureLines.length > 0 ||
    capturePreview != null ||
    durationLabel != null;

  return {
    stepId: step.id,
    status,
    durationLabel,
    error,
    validationChecks,
    captureLines,
    capturePreview,
    hasContent,
  };
}
