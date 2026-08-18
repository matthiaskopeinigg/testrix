import { describe, expect, it } from 'vitest';

import { migrateTestSuitesFile } from './test-suite-migrate';
import { isFlowStepNode, isTestSuiteFlow } from './test-suites.schema';

describe('migrateTestSuitesFile', () => {
  it('migrates legacy http/delay/assert nodes to step types', () => {
    const file = migrateTestSuitesFile({
      schemaVersion: 1,
      suites: [
        {
          id: 'root-suite',
          name: 'Test Suite',
          updatedAt: '2026-01-01T00:00:00.000Z',
          flows: [
            {
              id: 'flw-1',
              name: 'Legacy',
              description: '',
              tags: [],
              updatedAt: '2026-01-01T00:00:00.000Z',
              nodes: [
                { id: 'n1', type: 'http', label: 'Get', requestId: 'req-1' },
                { id: 'n2', type: 'delay', label: 'Wait', delayMs: 500 },
                { id: 'n3', type: 'assert', label: 'Check', assertExpression: 'ok' },
              ],
            },
          ],
        },
      ],
    });

    const flow = file.suites[0]?.flows.find(isTestSuiteFlow);
    expect(flow).toBeDefined();
    if (!flow) {
      return;
    }
    const steps = flow.nodes.filter(isFlowStepNode);
    expect(steps).toHaveLength(3);
    expect(steps[0]?.stepType).toBe('REQUEST');
    expect(steps[1]?.stepType).toBe('WAIT');
    expect(steps[2]?.stepType).toBe('VALIDATION');
  });

  it('keeps RETRY body steps nested and strips hoisted root copies', () => {
    const wait = {
      id: 'wait-1',
      type: 'step' as const,
      name: 'Wait',
      parentId: 'body-1',
      stepType: 'WAIT' as const,
      config: { durationMs: 1000 },
      enabled: true,
      lastRunStatus: 'never' as const,
    };
    const retry = {
      id: 'retry-1',
      type: 'step' as const,
      name: 'Retry',
      parentId: null,
      stepType: 'RETRY' as const,
      config: { maxAttempts: 3, delayMs: 0 },
      enabled: true,
      lastRunStatus: 'never' as const,
      children: [
        {
          id: 'body-1',
          type: 'lane' as const,
          laneKind: 'body' as const,
          name: 'Body',
          parentId: 'retry-1',
          children: [wait],
        },
      ],
    };
    const file = migrateTestSuitesFile({
      schemaVersion: 1,
      suites: [
        {
          id: 'root-suite',
          name: 'Test Suite',
          updatedAt: '2026-01-01T00:00:00.000Z',
          flows: [
            {
              id: 'flw-1',
              name: 'Retry flow',
              description: '',
              tags: [],
              updatedAt: '2026-01-01T00:00:00.000Z',
              nodes: [retry, wait],
            },
          ],
        },
      ],
    });

    const flow = file.suites[0]?.flows.find(isTestSuiteFlow);
    expect(flow?.nodes.map((node) => node.id)).toEqual(['retry-1']);
    const retryNode = flow?.nodes[0];
    expect(retryNode && isFlowStepNode(retryNode) ? retryNode.stepType : null).toBe('RETRY');
    const body = retryNode && 'children' in retryNode ? retryNode.children?.[0] : undefined;
    expect(body && 'children' in body ? body.children?.map((node) => node.id) ?? [] : []).toEqual(['wait-1']);
  });
});
