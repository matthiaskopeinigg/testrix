import { describe, expect, it } from 'vitest';

import { toTreeNodes } from './environment-tree.adapter';
import { ENVIRONMENT_SCOPE_FIXTURE } from './environment-tree.fixture';
import { filterEnvironmentTreeByKind } from './environment-tree.filter-kind';

describe('filterEnvironmentTreeByKind', () => {
  const tree = toTreeNodes(ENVIRONMENT_SCOPE_FIXTURE);

  it('returns all nodes when filter is all', () => {
    expect(filterEnvironmentTreeByKind(tree, 'all')).toHaveLength(tree.length);
  });

  it('returns only folders when filter is folders', () => {
    const folders = filterEnvironmentTreeByKind(tree, 'folders');
    expect(folders.length).toBeGreaterThan(0);
    expect(folders.every((node) => node.kind === 'folder')).toBe(true);
    expect(folders.every((node) => !node.children?.length)).toBe(true);
  });

  it('returns a flat variable list when filter is variables', () => {
    const variables = filterEnvironmentTreeByKind(tree, 'variables');
    expect(variables.length).toBeGreaterThan(0);
    expect(variables.every((node) => node.data?.kind === 'variable')).toBe(true);
    expect(variables.some((node) => node.label === 'baseUrl')).toBe(true);
    expect(variables.some((node) => node.label === 'apiToken')).toBe(true);
  });
});
