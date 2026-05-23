import {
  catalogForEnvironment,
  DEFAULT_ENVIRONMENT_VARIABLE_KEY_OPTIONS,
  type EnvironmentDefinition,
  type EnvironmentVariableKeyOptions,
} from '@shared/config';
import { DYNAMIC_VARIABLES, type DynamicVariableCatalogItem } from '@shared/dynamic-variables';
import { flattenEnabledFlowSteps, type TestSuiteFlow } from '@shared/testing';

import { FLOW_STEP_GUIDED_TITLES } from './flow-step-labels';

/**
 * Builds a variable catalog from dynamic variables, the flow environment, and prior step placeholders.
 */
export function collectPriorFlowPlaceholderKeys(
  flow: TestSuiteFlow,
  currentStepId: string,
  environment?: EnvironmentDefinition | null,
  keyOptions: EnvironmentVariableKeyOptions = DEFAULT_ENVIRONMENT_VARIABLE_KEY_OPTIONS,
): readonly DynamicVariableCatalogItem[] {
  const extras: DynamicVariableCatalogItem[] = [];
  const steps = flattenEnabledFlowSteps(flow.nodes);

  for (const step of steps) {
    if (step.id === currentStepId) {
      break;
    }

    if (step.stepType === 'MANUAL') {
      const cfg = step.config as { variableName?: string };
      const key = cfg.variableName?.trim();
      if (key) {
        extras.push({
          id: `manual-${step.id}`,
          label: `{{${key}}}`,
          insert: `{{${key}}}`,
          detail: `Value from manual step "${step.name || FLOW_STEP_GUIDED_TITLES.MANUAL}".`,
        });
      }
    }

    if (step.stepType === 'DATABASE') {
      const cfg = step.config as { cacheAs?: string };
      const key = cfg.cacheAs?.trim();
      if (key) {
        extras.push({
          id: `database-${step.id}`,
          label: `{{${key}}}`,
          insert: `{{${key}}}`,
          detail: `Cached query result from database step "${step.name || FLOW_STEP_GUIDED_TITLES.DATABASE}".`,
        });
      }
    }
  }

  const envCatalog = catalogForEnvironment(environment ?? null, keyOptions);
  return [...DYNAMIC_VARIABLES, ...envCatalog, ...extras];
}
