import { describe, expect, it } from 'vitest';

import type { EnvironmentDefinition } from '@shared/config';

import { applyEnvironmentListView } from './environment-list.view';

const environments: EnvironmentDefinition[] = [
  {
    id: 'env-b',
    name: 'Beta',
    order: 20,
    nodes: [{ id: 'v1', kind: 'variable', key: 'API', value: '1' }],
  },
  {
    id: 'env-a',
    name: 'Alpha',
    order: 10,
    nodes: [],
  },
];

describe('applyEnvironmentListView', () => {
  it('sorts by custom order by default', () => {
    const items = applyEnvironmentListView(environments, {
      query: '',
      filter: 'all',
      sortBy: 'order',
    });
    expect(items.map((item) => item.id)).toEqual(['env-a', 'env-b']);
  });

  it('sorts by name when requested', () => {
    const items = applyEnvironmentListView(environments, {
      query: '',
      filter: 'all',
      sortBy: 'name',
    });
    expect(items.map((item) => item.name)).toEqual(['Alpha', 'Beta']);
  });

  it('filters empty environments', () => {
    const items = applyEnvironmentListView(environments, {
      query: '',
      filter: 'empty',
      sortBy: 'order',
    });
    expect(items.map((item) => item.id)).toEqual(['env-a']);
  });

  it('filters environments with variables', () => {
    const items = applyEnvironmentListView(environments, {
      query: '',
      filter: 'with-variables',
      sortBy: 'order',
    });
    expect(items.map((item) => item.id)).toEqual(['env-b']);
  });

  it('applies search after filter and sort', () => {
    const items = applyEnvironmentListView(environments, {
      query: 'bet',
      filter: 'all',
      sortBy: 'name',
    });
    expect(items.map((item) => item.name)).toEqual(['Beta']);
  });
});
