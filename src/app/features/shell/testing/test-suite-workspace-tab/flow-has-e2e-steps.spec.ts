import { describe, expect, it } from 'vitest';

import {
  createDefaultTriggerStepConfig,
  createFlowStep,
  flattenEnabledFlowSteps,
  flowNeedsBrowserRunnerDeep,
  flowRunWantsKeepE2eWindow,
  flowRunWantsVisibleE2eWindow,
  triggerStepConfigSchema,
} from '@shared/testing';
import type { TestSuiteFlow, TestSuiteTreeItem } from '@shared/testing';

import { flowHasE2eSteps } from './flow-has-e2e-steps';

function suiteFlow(
  id: string,
  name: string,
  nodes: TestSuiteFlow['nodes'],
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

describe('flowHasE2eSteps', () => {
  it('returns false when no E2E steps exist', () => {
    expect(flowHasE2eSteps([createFlowStep('REQUEST', 'Get health')])).toBe(false);
  });

  it('returns true when an E2E step exists', () => {
    expect(flowHasE2eSteps([createFlowStep('E2E', 'Open app')])).toBe(true);
  });

  it('returns true when an HTTP interceptor step exists', () => {
    expect(flowHasE2eSteps([createFlowStep('HTTP_INTERCEPTOR', 'Rewrite login')])).toBe(true);
  });

  it('returns true when a TRIGGER target has an E2E step', () => {
    const login = suiteFlow('login', 'Login', [createFlowStep('E2E', 'Open app')]);
    const trigger = {
      ...createFlowStep('TRIGGER', 'Run login'),
      config: { targetType: 'flow', targetId: 'login' },
    };
    expect(flowHasE2eSteps([trigger], [login])).toBe(true);
  });
});

describe('triggerStepConfigSchema', () => {
  it('defaults reuseE2eSession to true', () => {
    expect(createDefaultTriggerStepConfig().reuseE2eSession).toBe(true);
    expect(
      triggerStepConfigSchema.parse({ targetType: 'flow', targetId: 'login' }).reuseE2eSession,
    ).toBe(true);
  });
});

describe('flowNeedsBrowserRunnerDeep', () => {
  it('returns true when a TRIGGER folder contains an E2E flow', () => {
    const login = suiteFlow('login', 'Login', [createFlowStep('E2E', 'Open app')]);
    const folder: TestSuiteTreeItem = {
      id: 'auth',
      name: 'Auth',
      description: '',
      tags: [],
      children: [login],
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const parent = suiteFlow('parent', 'Parent', [
      {
        ...createFlowStep('TRIGGER', 'Run auth'),
        config: { targetType: 'folder', targetId: 'auth' },
      },
    ]);
    expect(
      flowNeedsBrowserRunnerDeep(flattenEnabledFlowSteps(parent.nodes), [folder, parent]),
    ).toBe(true);
  });
});

describe('flowRunWantsVisibleE2eWindow', () => {
  it('uses the root flow setting and ignores TRIGGER children', () => {
    const login = suiteFlow('login', 'Login', [createFlowStep('E2E', 'Open app')], {
      e2eShowWindow: true,
    });
    const parent = suiteFlow(
      'parent',
      'Parent',
      [
        {
          ...createFlowStep('TRIGGER', 'Run login'),
          config: { targetType: 'flow', targetId: 'login' },
        },
      ],
      { e2eShowWindow: false },
    );
    expect(flowRunWantsVisibleE2eWindow(parent, [login, parent])).toBe(false);
  });
});

describe('flowRunWantsKeepE2eWindow', () => {
  it('uses the root flow setting and ignores TRIGGER children', () => {
    const login = suiteFlow('login', 'Login', [createFlowStep('E2E', 'Open app')], {
      e2eKeepWindowOpen: true,
    });
    const parent = suiteFlow('parent', 'Parent', [
      {
        ...createFlowStep('TRIGGER', 'Run login'),
        config: { targetType: 'flow', targetId: 'login' },
      },
    ]);
    expect(flowRunWantsKeepE2eWindow(parent, [login, parent])).toBe(false);
  });
});
