import { describe, expect, it } from 'vitest';

import {
  collectFlowsUnderFolder,
  findTestSuiteFolderInTree,
  resolveTriggerTargetFlows,
  triggerFlowCycleMessage,
} from './collect-trigger-targets';
import type { TestSuiteTreeItem } from './test-suites.schema';

function flow(id: string, name: string): TestSuiteTreeItem {
  return {
    id,
    name,
    description: '',
    tags: [],
    environmentId: null,
    lastRunStatus: 'never',
    lastRunAt: null,
    nodes: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function folder(
  id: string,
  name: string,
  children: readonly TestSuiteTreeItem[],
  environmentId: string | null = null,
): TestSuiteTreeItem {
  return {
    id,
    name,
    description: '',
    tags: [],
    environmentId,
    children,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const tree: readonly TestSuiteTreeItem[] = [
  folder('auth', 'Auth', [flow('login', 'Login'), flow('logout', 'Logout')], 'env-auth'),
  folder(
    'checkout',
    'Checkout',
    [
      folder('payments', 'Payments', [flow('card', 'Card'), flow('wallet', 'Wallet')], 'env-pay'),
      flow('confirm', 'Confirm'),
    ],
    'env-checkout',
  ),
  flow('orphan', 'Orphan'),
  folder('empty', 'Empty', []),
];

describe('findTestSuiteFolderInTree', () => {
  it('finds a nested folder', () => {
    expect(findTestSuiteFolderInTree(tree, 'payments')?.name).toBe('Payments');
  });

  it('returns null when the folder is missing', () => {
    expect(findTestSuiteFolderInTree(tree, 'missing')).toBeNull();
  });
});

describe('collectFlowsUnderFolder', () => {
  it('returns descendant flows in preorder including nested folders', () => {
    const locations = collectFlowsUnderFolder(tree, 'checkout');
    expect(locations?.map((item) => item.flow.id)).toEqual(['card', 'wallet', 'confirm']);
    expect(locations?.[0]?.ancestorFolders.map((folderRef) => folderRef.id)).toEqual([
      'checkout',
      'payments',
    ]);
    expect(locations?.[0]?.ancestorFolders[1]?.environmentId).toBe('env-pay');
    expect(locations?.[2]?.ancestorFolders.map((folderRef) => folderRef.id)).toEqual(['checkout']);
  });

  it('returns an empty list for a folder with no flows', () => {
    expect(collectFlowsUnderFolder(tree, 'empty')).toEqual([]);
  });

  it('returns null when the folder id is missing', () => {
    expect(collectFlowsUnderFolder(tree, 'missing')).toBeNull();
  });
});

describe('resolveTriggerTargetFlows', () => {
  it('resolves a single flow', () => {
    const result = resolveTriggerTargetFlows(tree, { targetType: 'flow', targetId: 'login' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.locations.map((item) => item.flow.id)).toEqual(['login']);
    }
  });

  it('resolves a folder to all descendant flows', () => {
    const result = resolveTriggerTargetFlows(tree, { targetType: 'folder', targetId: 'checkout' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.locations.map((item) => item.flow.id)).toEqual(['card', 'wallet', 'confirm']);
    }
  });

  it('fails when no target is selected', () => {
    const result = resolveTriggerTargetFlows(tree, { targetType: 'flow', targetId: '  ' });
    expect(result).toEqual({ ok: false, message: 'TRIGGER step has no target selected.' });
  });

  it('fails when the flow is missing', () => {
    const result = resolveTriggerTargetFlows(tree, { targetType: 'flow', targetId: 'missing' });
    expect(result).toEqual({ ok: false, message: 'TRIGGER target flow was not found.' });
  });

  it('fails when the folder is missing', () => {
    const result = resolveTriggerTargetFlows(tree, { targetType: 'folder', targetId: 'missing' });
    expect(result).toEqual({ ok: false, message: 'TRIGGER target folder was not found.' });
  });

  it('fails when the folder has no descendant flows', () => {
    const result = resolveTriggerTargetFlows(tree, { targetType: 'folder', targetId: 'empty' });
    expect(result).toEqual({
      ok: false,
      message: 'Folder "Empty" has no flows to run.',
    });
  });
});

describe('triggerFlowCycleMessage', () => {
  it('detects a cycle when the target is already on the stack', () => {
    expect(triggerFlowCycleMessage(['root', 'login'], 'login', 'Login')).toBe(
      'TRIGGER would re-enter flow "Login".',
    );
  });

  it('allows a new flow under the depth cap', () => {
    expect(triggerFlowCycleMessage(['root'], 'login', 'Login')).toBeNull();
  });

  it('rejects nesting at the depth cap', () => {
    const stack = Array.from({ length: 16 }, (_, index) => `flow-${index}`);
    expect(triggerFlowCycleMessage(stack, 'next', 'Next', 16)).toBe(
      'TRIGGER nesting exceeds 16 flows.',
    );
  });
});
