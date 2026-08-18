import { describe, expect, it } from 'vitest';

import { createFlowFolder, createFlowStep } from './test-suites.schema';
import { getFlowRunBlockingReason, normalizeFlowStepNodes } from './test-suite-flow-order';
import type { TestSuiteFlow } from './test-suites.schema';

describe('normalizeFlowStepNodes', () => {
  it('hoists steps from nested folders to a flat root list', () => {
    const inner = createFlowStep('WAIT', 'Wait');
    inner.id = 'step-inner';
    const folder = {
      ...createFlowFolder('Group'),
      id: 'fld-1',
      children: [inner] as const,
    };
    const root = createFlowStep('REQUEST', 'Request');
    root.id = 'step-root';

    const normalized = normalizeFlowStepNodes([root, folder]);

    expect(normalized.map((s) => s.id)).toEqual(['step-root', 'step-inner']);
    expect(normalized.every((s) => s.parentId === null)).toBe(true);
  });
});

function flow(id: string, name: string, nodes: TestSuiteFlow['nodes']): TestSuiteFlow {
  return {
    id,
    name,
    description: '',
    tags: [],
    lastRunStatus: 'never',
    lastRunAt: null,
    nodes,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('getFlowRunBlockingReason', () => {
  it('blocks Wait for URL when this flow never navigated', () => {
    const waitUrl = createFlowStep('E2E', 'Wait overview');
    waitUrl.id = 'wait';
    waitUrl.config = { action: 'WAIT_FOR_URL', selector: '', value: 'magenta.at', timeout: 5000 };

    expect(getFlowRunBlockingReason(flow('shell', 'Shell', [waitUrl]))).toMatch(
      /Navigate to URL step above/,
    );
  });

  it('allows Wait for URL after TRIGGER of a flow that navigates', () => {
    const open = createFlowStep('E2E', 'Open Magenta');
    open.id = 'open';
    open.config = { action: 'NAVIGATE_TO', selector: '', value: 'magenta.at', timeout: 5000 };
    const login = flow('login', 'Login', [open]);

    const trigger = createFlowStep('TRIGGER', 'Run Login');
    trigger.id = 'trigger';
    trigger.config = { targetType: 'flow', targetId: 'login', reuseE2eSession: true };
    const waitUrl = createFlowStep('E2E', 'Wait overview');
    waitUrl.id = 'wait';
    waitUrl.config = { action: 'WAIT_FOR_URL', selector: '', value: 'magenta.at', timeout: 5000 };

    expect(getFlowRunBlockingReason(flow('shell', 'Shell', [trigger, waitUrl]), [login])).toBeNull();
  });
});
