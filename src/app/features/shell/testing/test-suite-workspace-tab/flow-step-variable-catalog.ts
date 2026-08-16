import {
  catalogForEnvironment,
  DEFAULT_ENVIRONMENT_VARIABLE_KEY_OPTIONS,
  type EnvironmentDefinition,
  type EnvironmentVariableKeyOptions,
} from '@shared/config';
import { DYNAMIC_VARIABLES, type DynamicVariableCatalogItem } from '@shared/dynamic-variables';
import {
  flattenEnabledFlowSteps,
  resolveTriggerTargetFlows,
  type TestSuiteFlow,
  type TestSuiteFlowStep,
  type TestSuiteTreeItem,
} from '@shared/testing';
import type { CacheStepConfig } from '@shared/testing/test-suite-steps.schema';

import { FLOW_STEP_GUIDED_TITLES } from './flow-step-labels';

/**
 * Builds a variable catalog from dynamic variables, the flow environment, and prior step placeholders.
 *
 * TRIGGER steps inherit CACHE / MANUAL / DATABASE / listener placeholders from the target flow
 * (and nested TRIGGERs), matching runtime variable sharing.
 */
export function collectPriorFlowPlaceholderKeys(
  flow: TestSuiteFlow,
  currentStepId: string,
  environment?: EnvironmentDefinition | null,
  keyOptions: EnvironmentVariableKeyOptions = DEFAULT_ENVIRONMENT_VARIABLE_KEY_OPTIONS,
  suiteItems: readonly TestSuiteTreeItem[] = [],
): readonly DynamicVariableCatalogItem[] {
  const extras: DynamicVariableCatalogItem[] = [];
  appendProducedPlaceholders(extras, flow, flattenEnabledFlowSteps(flow.nodes), {
    stopAtStepId: currentStepId,
    suiteItems,
    visitedFlowIds: new Set([flow.id]),
  });

  const envCatalog = catalogForEnvironment(environment ?? null, keyOptions);
  const byInsert = new Map<string, DynamicVariableCatalogItem>();
  for (const item of [...envCatalog, ...extras]) {
    byInsert.set(item.insert, item);
  }
  return [...DYNAMIC_VARIABLES, ...byInsert.values()];
}

/**
 * Returns the CACHE / MANUAL / … step that produced `{{key}}`, if the catalog recorded a source.
 */
export function findCatalogPlaceholderSource(
  catalog: readonly DynamicVariableCatalogItem[],
  key: string,
): { readonly flowId: string; readonly stepId: string } | null {
  const insert = `{{${key}}}`;
  let found: { readonly flowId: string; readonly stepId: string } | null = null;
  for (const item of catalog) {
    if (item.insert !== insert || !item.sourceFlowId || !item.sourceStepId) {
      continue;
    }
    found = { flowId: item.sourceFlowId, stepId: item.sourceStepId };
  }
  return found;
}

function appendProducedPlaceholders(
  extras: DynamicVariableCatalogItem[],
  flow: TestSuiteFlow,
  steps: readonly TestSuiteFlowStep[],
  options: {
    readonly stopAtStepId?: string;
    readonly suiteItems: readonly TestSuiteTreeItem[];
    readonly visitedFlowIds: Set<string>;
  },
): void {
  for (const step of steps) {
    if (options.stopAtStepId && step.id === options.stopAtStepId) {
      break;
    }

    if (step.stepType === 'MANUAL') {
      const cfg = step.config as { variableName?: string };
      pushNamedPlaceholder(extras, flow, step, cfg.variableName, 'manual', 'Value from manual step');
    }

    if (step.stepType === 'DATABASE') {
      const cfg = step.config as { cacheAs?: string };
      pushNamedPlaceholder(
        extras,
        flow,
        step,
        cfg.cacheAs,
        'database',
        'Cached query result from database step',
      );
    }

    if (step.stepType === 'HTTP_LISTENER' || step.stepType === 'HTTP_INTERCEPTOR') {
      const cfg = step.config as { variableName?: string };
      pushNamedPlaceholder(
        extras,
        flow,
        step,
        cfg.variableName,
        'listener',
        'Captured value from listener step',
      );
    }

    if (step.stepType === 'CACHE') {
      const cfg = step.config as CacheStepConfig;
      for (const entry of cfg.entries ?? []) {
        pushNamedPlaceholder(
          extras,
          flow,
          step,
          entry.variableName,
          `cache-${entry.variableName ?? ''}`,
          'Cached value from cache step',
        );
      }
    }

    if (step.stepType === 'TRIGGER') {
      appendTriggerTargetPlaceholders(extras, step, options);
    }
  }
}

function appendTriggerTargetPlaceholders(
  extras: DynamicVariableCatalogItem[],
  step: TestSuiteFlowStep,
  options: {
    readonly suiteItems: readonly TestSuiteTreeItem[];
    readonly visitedFlowIds: Set<string>;
  },
): void {
  if (options.suiteItems.length === 0) {
    return;
  }
  const cfg = step.config as { targetType?: string; targetId?: string };
  const resolved = resolveTriggerTargetFlows(options.suiteItems, {
    targetType: cfg.targetType === 'folder' ? 'folder' : 'flow',
    targetId: cfg.targetId ?? '',
  });
  if (!resolved.ok) {
    return;
  }
  for (const location of resolved.locations) {
    if (options.visitedFlowIds.has(location.flow.id)) {
      continue;
    }
    options.visitedFlowIds.add(location.flow.id);
    appendProducedPlaceholders(extras, location.flow, flattenEnabledFlowSteps(location.flow.nodes), {
      suiteItems: options.suiteItems,
      visitedFlowIds: options.visitedFlowIds,
    });
  }
}

function pushNamedPlaceholder(
  extras: DynamicVariableCatalogItem[],
  flow: TestSuiteFlow,
  step: TestSuiteFlowStep,
  rawName: string | undefined,
  idSuffix: string,
  detailVerb: string,
): void {
  const key = rawName?.trim();
  if (!key) {
    return;
  }
  const stepLabel = step.name || FLOW_STEP_GUIDED_TITLES[step.stepType];
  extras.push({
    id: `${idSuffix}-${flow.id}-${step.id}-${key}`,
    label: `{{${key}}}`,
    insert: `{{${key}}}`,
    detail: `${detailVerb} "${stepLabel}" in flow "${flow.name}".`,
    sourceFlowId: flow.id,
    sourceStepId: step.id,
  });
}
