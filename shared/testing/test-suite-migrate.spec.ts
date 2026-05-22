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
});
