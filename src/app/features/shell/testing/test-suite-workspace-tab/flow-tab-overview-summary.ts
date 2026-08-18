import type { TestSuiteFlowSectionId } from '@shared/config';
import {
  flattenAllEnabledFlowSteps,
  type TestSuiteFlow,
  type TestSuiteFlowNode,
  type TestSuiteStepType,
} from '@shared/testing';

import type { TxIconName } from '@app/shared/icons/tx-icon.registry';

export interface FlowOverviewConfigCard {
  readonly section: TestSuiteFlowSectionId;
  readonly label: string;
  readonly value: string;
  readonly icon: TxIconName;
}

const STEP_TYPE_SHORT_LABEL: Record<TestSuiteStepType, string> = {
  REQUEST: 'HTTP',
  VALIDATION: 'validation',
  CACHE: 'cache',
  DATABASE: 'database',
  E2E: 'E2E',
  HTTP_LISTENER: 'listener',
  HTTP_INTERCEPTOR: 'interceptor',
  WAIT: 'wait',
  MANUAL: 'manual',
  TRIGGER: 'trigger',
  IF: 'IF',
  FOR_EACH: 'for-each',
  WHILE: 'while',
  PARALLEL: 'parallel',
  RETRY: 'retry',
};

/** Counts enabled steps and summarizes the most common types. */
export function formatFlowStepMix(nodes: readonly TestSuiteFlowNode[]): string {
  const steps = flattenAllEnabledFlowSteps(nodes);
  if (steps.length === 0) {
    return 'No enabled steps';
  }
  const counts = new Map<TestSuiteStepType, number>();
  for (const step of steps) {
    counts.set(step.stepType, (counts.get(step.stepType) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const mix = ranked
    .slice(0, 3)
    .map(([type, count]) => `${count} ${STEP_TYPE_SHORT_LABEL[type]}`)
    .join(' · ');
  const noun = steps.length === 1 ? 'step' : 'steps';
  return `${steps.length} ${noun} · ${mix}`;
}

/** Labels a flow-level dataset for overview cards. */
export function formatFlowDatasetSummary(dataset: TestSuiteFlow['dataset']): string {
  const rows = dataset?.rows?.length ?? 0;
  if (dataset?.enabled !== true || rows === 0) {
    return dataset?.enabled === true ? 'Enabled · no rows' : 'Off';
  }
  const noun = rows === 1 ? 'row' : 'rows';
  return `${rows} ${noun}`;
}

/** Labels E2E window behavior for overview cards. */
export function formatFlowE2eSummary(flow: Pick<TestSuiteFlow, 'e2eShowWindow' | 'e2eKeepWindowOpen'>, hasE2eSteps: boolean): string {
  if (!hasE2eSteps) {
    return 'No E2E steps';
  }
  const show = flow.e2eShowWindow !== false;
  const keep = flow.e2eKeepWindowOpen === true;
  if (!show) {
    return 'Hidden browser';
  }
  return keep ? 'Show window · keep open' : 'Show window · close after run';
}

/** Builds jump cards for the flow Overview configuration grid. */
export function buildFlowOverviewConfigCards(
  flow: TestSuiteFlow,
  hasE2eSteps: boolean,
): readonly FlowOverviewConfigCard[] {
  const optionsParts: string[] = [];
  optionsParts.push(flow.isCritical === true ? 'Critical' : 'Not critical');
  if (hasE2eSteps) {
    optionsParts.push(flow.e2eShowWindow === false ? 'E2E hidden' : 'E2E visible');
  }
  const tagsValue = flow.tags.length > 0 ? flow.tags.join(', ') : 'No tags';

  return [
    { section: 'steps', label: 'Steps', value: formatFlowStepMix(flow.nodes), icon: 'list' },
    { section: 'settings', label: 'Options', value: optionsParts.join(' · '), icon: 'sliders' },
    { section: 'settings', label: 'Dataset', value: formatFlowDatasetSummary(flow.dataset), icon: 'layers' },
    { section: 'settings', label: 'E2E', value: formatFlowE2eSummary(flow, hasE2eSteps), icon: 'play' },
    { section: 'settings', label: 'Tags', value: tagsValue, icon: 'tag' },
  ];
}
