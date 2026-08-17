import { describe, expect, it } from 'vitest';

import type { FlowRunChildLog } from '@shared/testing';
import {
  findFlowRunChildByLogId,
  firstFailedFlowRunChildLogId,
  flowRunChildLogId,
  rollupFlowRunChildStatus,
} from '@shared/testing';

import { flattenVisibleFlowRunChildren, isFlowRunLogNodeExpanded } from './flow-run-timeline';

const failedStep = (id: string, name: string): FlowRunChildLog => ({
  kind: 'step',
  id,
  flowId: 'flow-2',
  flowName: 'Flow-2',
  name,
  stepType: 'E2E',
  status: 'failed',
  error: `${name} failed`,
});

describe('flow-run-child-log helpers', () => {
  it('finds a nested failed leaf by log id', () => {
    const children: FlowRunChildLog[] = [
      {
        kind: 'step',
        id: 'cache-1',
        flowId: 'flow-1',
        flowName: 'Flow-1',
        name: 'Cache email',
        stepType: 'CACHE',
        status: 'passed',
      },
      failedStep('e2e-1', 'Set password'),
    ];

    const failedId = firstFailedFlowRunChildLogId(children, 'trigger-2');
    expect(failedId).toBe(flowRunChildLogId('trigger-2', 'e2e-1'));
    expect(findFlowRunChildByLogId(children, failedId!, 'trigger-2')?.name).toBe('Set password');
  });

  it('rolls up a failed child to the parent flow group', () => {
    expect(
      rollupFlowRunChildStatus([
        { ...failedStep('a', 'A'), status: 'passed' },
        failedStep('b', 'B'),
      ]),
    ).toBe('failed');
  });
});

describe('flattenVisibleFlowRunChildren', () => {
  it('auto-expands failed parents and keeps passed parents collapsed', () => {
    const children: FlowRunChildLog[] = [
      {
        kind: 'flow',
        id: 'flow:flow-1',
        flowId: 'flow-1',
        flowName: 'Flow-1',
        name: 'Flow-1',
        status: 'passed',
        children: [
          {
            kind: 'step',
            id: 'cache-1',
            flowId: 'flow-1',
            flowName: 'Flow-1',
            name: 'Cache email',
            stepType: 'CACHE',
            status: 'passed',
          },
        ],
      },
      {
        kind: 'flow',
        id: 'flow:flow-2',
        flowId: 'flow-2',
        flowName: 'Flow-2',
        name: 'Flow-2',
        status: 'failed',
        children: [failedStep('e2e-1', 'Set password')],
      },
    ];

    const rows = flattenVisibleFlowRunChildren(children, 'trigger-folder', 1, new Set(), new Set());
    expect(rows.map((row) => row.log.name)).toEqual(['Flow-1', 'Flow-2', 'Set password']);
  });

  it('honors a user collapse of a failed node', () => {
    const child: FlowRunChildLog = {
      kind: 'step',
      id: 'trigger-inner',
      flowId: 'flow-2',
      flowName: 'Flow-2',
      name: 'Run nested',
      stepType: 'TRIGGER',
      status: 'failed',
      children: [failedStep('e2e-1', 'Set password')],
    };
    const logId = flowRunChildLogId('trigger-2', child.id);
    expect(isFlowRunLogNodeExpanded(logId, true, new Set(), new Set([logId]))).toBe(false);

    const rows = flattenVisibleFlowRunChildren([child], 'trigger-2', 1, new Set(), new Set([logId]));
    expect(rows.map((row) => row.log.name)).toEqual(['Run nested']);
  });
});
