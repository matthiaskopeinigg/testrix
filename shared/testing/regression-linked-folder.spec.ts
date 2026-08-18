import { describe, expect, it } from 'vitest';

import {
  regressionFlowIdsEqual,
  syncRegressionFlowIdsFromLinkedFolder,
} from './regression-linked-folder';
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
): TestSuiteTreeItem {
  return {
    id,
    name,
    description: '',
    tags: [],
    environmentId: null,
    children,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const tree: readonly TestSuiteTreeItem[] = [
  folder('auth', 'Auth', [flow('login', 'Login'), flow('logout', 'Logout')]),
  flow('extra', 'Extra'),
];

describe('syncRegressionFlowIdsFromLinkedFolder', () => {
  it('replaces flow ids with folder descendants in tree order', () => {
    const result = syncRegressionFlowIdsFromLinkedFolder(['logout'], 'auth', tree);
    expect(result.folderMissing).toBe(false);
    expect(result.flowIds).toEqual(['login', 'logout']);
  });

  it('keeps extra flows that are not in the folder', () => {
    const result = syncRegressionFlowIdsFromLinkedFolder(['extra', 'login'], 'auth', tree);
    expect(result.flowIds).toEqual(['login', 'logout', 'extra']);
  });

  it('drops extras that were deleted from the suite', () => {
    const result = syncRegressionFlowIdsFromLinkedFolder(['gone'], 'auth', tree);
    expect(result.flowIds).toEqual(['login', 'logout']);
  });

  it('leaves flow ids unchanged when the folder is missing', () => {
    const result = syncRegressionFlowIdsFromLinkedFolder(['login'], 'missing', tree);
    expect(result.folderMissing).toBe(true);
    expect(result.flowIds).toEqual(['login']);
  });
});

describe('regressionFlowIdsEqual', () => {
  it('compares ordered id lists', () => {
    expect(regressionFlowIdsEqual(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(regressionFlowIdsEqual(['a', 'b'], ['b', 'a'])).toBe(false);
  });
});
