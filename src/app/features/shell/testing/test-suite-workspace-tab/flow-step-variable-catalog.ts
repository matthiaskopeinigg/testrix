import {
  catalogForEnvironment,
  DEFAULT_ENVIRONMENT_VARIABLE_KEY_OPTIONS,
  type EnvironmentDefinition,
  type EnvironmentVariableKeyOptions,
} from '@shared/config';
import { DYNAMIC_VARIABLES, type DynamicVariableCatalogItem } from '@shared/dynamic-variables';
import {
  collectFlowsInTree,
  flattenEnabledFlowSteps,
  resolveTriggerTargetFlows,
  type TestSuiteFlow,
  type TestSuiteFlowLocation,
  type TestSuiteFlowStep,
  type TestSuiteTreeItem,
} from '@shared/testing';
import type { CacheStepConfig } from '@shared/testing/test-suite-steps.schema';

import { FLOW_STEP_GUIDED_TITLES } from './flow-step-labels';

/**
 * Builds a variable catalog from dynamic variables, the flow environment, and prior step placeholders.
 *
 * TRIGGER steps inherit CACHE / MANUAL / DATABASE / listener placeholders from the target flow
 * (and nested TRIGGERs), matching runtime variable sharing. Callers that TRIGGER this flow
 * after earlier targets (or earlier folder siblings) contribute those placeholders too, so a
 * child flow can use `{{email}}` cached by a sibling the parent ran first.
 */
export function collectPriorFlowPlaceholderKeys(
  flow: TestSuiteFlow,
  currentStepId: string,
  environment?: EnvironmentDefinition | null,
  keyOptions: EnvironmentVariableKeyOptions = DEFAULT_ENVIRONMENT_VARIABLE_KEY_OPTIONS,
  suiteItems: readonly TestSuiteTreeItem[] = [],
): readonly DynamicVariableCatalogItem[] {
  const extras: DynamicVariableCatalogItem[] = [];
  appendInboundTriggerPlaceholders(extras, flow.id, suiteItems, new Set());
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
  const locations = resolveStepTriggerLocations(step, options.suiteItems);
  if (!locations) {
    return;
  }
  for (const location of locations) {
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

/**
 * Adds placeholders produced before `targetFlowId` runs on a caller path
 * (prior steps, earlier folder siblings, and callers of those callers).
 */
function appendInboundTriggerPlaceholders(
  extras: DynamicVariableCatalogItem[],
  targetFlowId: string,
  suiteItems: readonly TestSuiteTreeItem[],
  inboundVisited: Set<string>,
): void {
  if (suiteItems.length === 0 || inboundVisited.has(targetFlowId)) {
    return;
  }
  inboundVisited.add(targetFlowId);

  for (const caller of collectFlowsInTree(suiteItems)) {
    if (inboundVisited.has(caller.id)) {
      continue;
    }
    const steps = flattenEnabledFlowSteps(caller.nodes);
    let matched = false;
    for (const step of steps) {
      if (step.stepType !== 'TRIGGER') {
        continue;
      }
      const locations = resolveStepTriggerLocations(step, suiteItems);
      if (!locations) {
        continue;
      }
      const targetIndex = locations.findIndex((location) => location.flow.id === targetFlowId);
      if (targetIndex < 0) {
        continue;
      }

      const expansionVisited = new Set<string>([targetFlowId, caller.id]);
      appendProducedPlaceholders(extras, caller, steps, {
        stopAtStepId: step.id,
        suiteItems,
        visitedFlowIds: expansionVisited,
      });
      for (let index = 0; index < targetIndex; index += 1) {
        const sibling = locations[index]!;
        if (expansionVisited.has(sibling.flow.id)) {
          continue;
        }
        expansionVisited.add(sibling.flow.id);
        appendProducedPlaceholders(extras, sibling.flow, flattenEnabledFlowSteps(sibling.flow.nodes), {
          suiteItems,
          visitedFlowIds: expansionVisited,
        });
      }
      matched = true;
      break;
    }
    if (matched) {
      appendInboundTriggerPlaceholders(extras, caller.id, suiteItems, inboundVisited);
    }
  }
}

/** Resolves a TRIGGER step to its fail-fast target locations, or `null`. */
function resolveStepTriggerLocations(
  step: TestSuiteFlowStep,
  suiteItems: readonly TestSuiteTreeItem[],
): readonly TestSuiteFlowLocation[] | null {
  if (suiteItems.length === 0) {
    return null;
  }
  const cfg = step.config as { targetType?: string; targetId?: string };
  const resolved = resolveTriggerTargetFlows(suiteItems, {
    targetType: cfg.targetType === 'folder' ? 'folder' : 'flow',
    targetId: cfg.targetId ?? '',
  });
  if (!resolved.ok) {
    return null;
  }
  return resolved.locations;
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
