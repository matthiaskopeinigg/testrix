import type { TestSuiteFlowStep, TestSuiteStepStatus, TestSuiteStepType } from '@shared/testing';
import type { ValidationStepConfig, CacheStepConfig } from '@shared/testing';

import type { TxTagVariant } from '@app/shared/components/tx-tag/tx-tag.component';

/** Short default title when a step has no custom name. */
export const FLOW_STEP_GUIDED_TITLES: Record<TestSuiteStepType, string> = {
  REQUEST: 'Send API request',
  VALIDATION: 'Check expected result',
  CACHE: 'Save values for later',
  DATABASE: 'Query saved database',
  E2E: 'Automate browser action',
  HTTP_LISTENER: 'Listen for network request',
  HTTP_INTERCEPTOR: 'Intercept outgoing request',
  WAIT: 'Pause for a moment',
  MANUAL: 'Ask for user input',
  TRIGGER: 'Execute linked flow/folder',
};

/** One-line hint for the add-step modal. */
export const FLOW_STEP_ADD_HINTS: Record<TestSuiteStepType, string> = {
  REQUEST: 'Call an API and store the response.',
  VALIDATION: 'Assert a prior response or value.',
  CACHE: 'Extract values from a prior step into flow variables.',
  DATABASE: 'Run a query and cache the result.',
  E2E: 'Drive the browser (navigate, click, type).',
  HTTP_LISTENER: 'Wait for a matching HTTP request.',
  HTTP_INTERCEPTOR: 'Capture and modify HTTP traffic.',
  WAIT: 'Delay before the next step.',
  MANUAL: 'Pause for human input.',
  TRIGGER: 'Run another flow or folder.',
};

/** Icon name for add-step tiles (matches tree icons). */
export const FLOW_STEP_ADD_ICONS: Record<
  TestSuiteStepType,
  import('@app/shared/icons/tx-icon.registry').TxIconName
> = {
  REQUEST: 'http',
  VALIDATION: 'checkCircle',
  CACHE: 'bookmark',
  DATABASE: 'database',
  E2E: 'globe',
  HTTP_LISTENER: 'filter',
  HTTP_INTERCEPTOR: 'interceptor',
  WAIT: 'clock',
  MANUAL: 'edit',
  TRIGGER: 'zap',
};

/**
 * Primary tree label: custom name when set; otherwise guided title or "Folder".
 */
export function flowStepPrimaryLabel(name: string, stepType?: TestSuiteStepType): string {
  const trimmed = name.trim();
  if (trimmed.length > 0) {
    return trimmed;
  }
  if (stepType) {
    return FLOW_STEP_GUIDED_TITLES[stepType] ?? 'Step';
  }
  return 'Folder';
}

/**
 * Secondary tree line: guided title when the primary line is a custom name.
 * For HTTP middleware steps, appends match pattern and interceptor action.
 */
export function flowStepSecondaryLabel(name: string, stepType: TestSuiteStepType): string | undefined {
  const trimmed = name.trim();
  const guided = FLOW_STEP_GUIDED_TITLES[stepType];
  if (trimmed.length === 0) {
    return undefined;
  }
  return guided;
}

/** Rich subtitle for flow step tree rows (match pattern, action, validation ref, etc.). */
export function flowStepTreeSubtitle(
  step: TestSuiteFlowStep,
  stepById?: ReadonlyMap<string, TestSuiteFlowStep>,
): string | undefined {
  const trimmed = step.name.trim();
  const guided = FLOW_STEP_GUIDED_TITLES[step.stepType];
  const prefix = trimmed.length > 0 ? guided : undefined;

  if (step.stepType === 'VALIDATION' || step.stepType === 'CACHE') {
    const refId = String(
      (step.config as ValidationStepConfig | CacheStepConfig).refStepId ?? '',
    ).trim();
    if (!refId) {
      return prefix;
    }
    const refStep = stepById?.get(refId);
    const refLabel = refStep
      ? flowStepPrimaryLabel(refStep.name, refStep.stepType)
      : 'Missing step';
    const detail =
      step.stepType === 'CACHE' ? `Caches from → ${refLabel}` : `Validates → ${refLabel}`;
    return prefix ? `${prefix} · ${detail}` : detail;
  }

  if (step.stepType === 'HTTP_INTERCEPTOR' || step.stepType === 'HTTP_LISTENER') {
    const cfg = step.config as {
      urlPattern?: string;
      method?: string;
      interceptAction?: 'modify' | 'block';
      matchPhase?: 'request' | 'response';
    };
    const pattern = cfg.urlPattern?.trim();
    const method = cfg.method?.trim();
    const matchParts: string[] = [];
    if (method) {
      matchParts.push(method);
    }
    if (pattern) {
      matchParts.push(pattern);
    }
    const matchLabel = matchParts.length > 0 ? matchParts.join(' ') : undefined;

    if (step.stepType === 'HTTP_INTERCEPTOR') {
      const action = cfg.interceptAction === 'block' ? 'Block' : 'Modify';
      const detail = [action, matchLabel].filter(Boolean).join(' · ');
      return prefix ? `${prefix} · ${detail}` : detail || guided;
    }

    const phase = cfg.matchPhase === 'request' ? 'Request' : 'Response';
    const detail = matchLabel ? `${phase} · ${matchLabel}` : phase;
    return prefix ? `${prefix} · ${detail}` : detail;
  }

  return prefix;
}

/** Maps step run status to tag variant for the tree row. */
export function flowStepStatusTagVariant(status: TestSuiteStepStatus | undefined): TxTagVariant {
  switch (status) {
    case 'passed':
      return 'success';
    case 'failed':
      return 'error';
    case 'running':
    case 'waiting':
      return 'info';
    case 'skipped':
      return 'warning';
    default:
      return 'default';
  }
}

/** Human-readable status for tooltips. */
export function flowStepStatusLabel(status: TestSuiteStepStatus | undefined): string {
  switch (status) {
    case 'running':
      return 'Running';
    case 'waiting':
      return 'Waiting';
    case 'passed':
      return 'Passed';
    case 'failed':
      return 'Failed';
    case 'skipped':
      return 'Skipped';
    default:
      return 'Not run';
  }
}

/** Tag presentation for a step run status. */
export function flowStepStatusTag(
  status: TestSuiteStepStatus | undefined,
): { readonly variant: TxTagVariant; readonly label: string } | null {
  if (!status || status === 'never') {
    return null;
  }
  return {
    variant: flowStepStatusTagVariant(status),
    label: flowStepStatusLabel(status),
  };
}

/** Whether the step name is a custom label (not empty). */
export function flowStepHasCustomName(step: TestSuiteFlowStep): boolean {
  return step.name.trim().length > 0;
}

/** CSS modifier class for tree/run row status tinting. */
export function flowStepStatusRowClass(
  status: TestSuiteStepStatus | undefined,
): string | null {
  if (!status || status === 'never') {
    return null;
  }
  return `is-status-${status}`;
}

/** Accent token mix for step type chips (returns CSS custom property name). */
export function flowStepTypeAccentToken(stepType: TestSuiteStepType): string {
  switch (stepType) {
    case 'VALIDATION':
      return 'var(--tx-success)';
    case 'CACHE':
      return 'var(--tx-link)';
    case 'DATABASE':
      return 'var(--tx-accent)';
    case 'E2E':
      return 'var(--tx-link)';
    case 'WAIT':
      return 'var(--tx-warning)';
    case 'MANUAL':
      return 'var(--tx-text-1)';
    case 'TRIGGER':
      return 'var(--tx-secondary)';
    case 'HTTP_INTERCEPTOR':
      return 'var(--tx-warning)';
    case 'HTTP_LISTENER':
      return 'var(--tx-link)';
    default:
      return 'var(--tx-accent)';
  }
}
