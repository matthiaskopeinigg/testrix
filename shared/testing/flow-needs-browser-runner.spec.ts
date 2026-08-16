import { describe, expect, it } from 'vitest';

import {
  flowNeedsBrowserRunnerDeep,
  flowRunWantsKeepE2eWindow,
  flowRunWantsVisibleE2eWindow,
} from './flow-needs-browser-runner';
import { flattenEnabledFlowSteps } from './test-suite-flow-order';
import { createDefaultTriggerStepConfig, triggerStepConfigSchema } from './test-suite-steps.schema';
import { createFlowStep, type TestSuiteFlow, type TestSuiteTreeItem } from './test-suites.schema';

function flow(
  id: string,
  name: string,
  nodes: TestSuiteFlow['nodes'] = [],
  options: { readonly e2eShowWindow?: boolean; readonly e2eKeepWindowOpen?: boolean } = {},
): TestSuiteFlow {
  return {
    id,
    name,
    description: '',
    tags: [],
    environmentId: null,
    lastRunStatus: 'never',
    lastRunAt: null,
    nodes,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...options,
  };
}

describe('triggerStepConfigSchema', () => {
  it('defaults reuseE2eSession to true', () => {
    expect(createDefaultTriggerStepConfig().reuseE2eSession).toBe(true);
    expect(triggerStepConfigSchema.parse({ targetType: 'flow', targetId: 'login' }).reuseE2eSession).toBe(
      true,
    );
  });

  it('persists reuseE2eSession false', () => {
    expect(
      triggerStepConfigSchema.parse({
        targetType: 'flow',
        targetId: 'login',
        reuseE2eSession: false,
      }).reuseE2eSession,
    ).toBe(false);
  });
});

describe('flowNeedsBrowserRunnerDeep', () => {
  it('returns false for a TRIGGER that targets a request-only flow', () => {
    const login = flow('login', 'Login', [createFlowStep('REQUEST', 'Get health')]);
    const parent = flow('parent', 'Parent', [
      { ...createFlowStep('TRIGGER', 'Run login'), config: { targetType: 'flow', targetId: 'login' } },
    ]);
    expect(flowNeedsBrowserRunnerDeep(flattenEnabledFlowSteps(parent.nodes), [login, parent])).toBe(
      false,
    );
  });

  it('returns true when a TRIGGER target has an E2E step', () => {
    const login = flow('login', 'Login', [createFlowStep('E2E', 'Open app')]);
    const parent = flow('parent', 'Parent', [
      { ...createFlowStep('TRIGGER', 'Run login'), config: { targetType: 'flow', targetId: 'login' } },
    ]);
    expect(flowNeedsBrowserRunnerDeep(flattenEnabledFlowSteps(parent.nodes), [login, parent])).toBe(
      true,
    );
  });

  it('returns true when a TRIGGER folder contains an E2E flow', () => {
    const login = flow('login', 'Login', [createFlowStep('E2E', 'Open app')]);
    const folder: TestSuiteTreeItem = {
      id: 'auth',
      name: 'Auth',
      description: '',
      tags: [],
      children: [login],
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const parent = flow('parent', 'Parent', [
      { ...createFlowStep('TRIGGER', 'Run auth'), config: { targetType: 'folder', targetId: 'auth' } },
    ]);
    expect(flowNeedsBrowserRunnerDeep(flattenEnabledFlowSteps(parent.nodes), [folder, parent])).toBe(
      true,
    );
  });
});

describe('flowRunWantsVisibleE2eWindow', () => {
  it('follows a TRIGGER target that has Show E2E enabled', () => {
    const login = flow('login', 'Login', [createFlowStep('E2E', 'Open app')], { e2eShowWindow: true });
    const parent = flow(
      'parent',
      'Parent',
      [{ ...createFlowStep('TRIGGER', 'Run login'), config: { targetType: 'flow', targetId: 'login' } }],
      { e2eShowWindow: false },
    );
    expect(flowRunWantsVisibleE2eWindow(parent, [login, parent])).toBe(true);
  });

  it('returns false when the parent and TRIGGER target hide the E2E window', () => {
    const login = flow('login', 'Login', [createFlowStep('E2E', 'Open app')], { e2eShowWindow: false });
    const parent = flow(
      'parent',
      'Parent',
      [{ ...createFlowStep('TRIGGER', 'Run login'), config: { targetType: 'flow', targetId: 'login' } }],
      { e2eShowWindow: false },
    );
    expect(flowRunWantsVisibleE2eWindow(parent, [login, parent])).toBe(false);
  });
});

describe('flowRunWantsKeepE2eWindow', () => {
  it('follows a TRIGGER target that has Keep E2E enabled', () => {
    const login = flow('login', 'Login', [createFlowStep('E2E', 'Open app')], {
      e2eKeepWindowOpen: true,
    });
    const parent = flow('parent', 'Parent', [
      { ...createFlowStep('TRIGGER', 'Run login'), config: { targetType: 'flow', targetId: 'login' } },
    ]);
    expect(flowRunWantsKeepE2eWindow(parent, [login, parent])).toBe(true);
  });
});
