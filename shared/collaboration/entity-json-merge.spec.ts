import { describe, expect, it } from 'vitest';

import { mergeCollectionsJson, mergeEnvironmentsJson } from './entity-json-merge';

describe('mergeCollectionsJson', () => {
  it('keeps remote edits when local is unchanged vs base', () => {
    const base = { schemaVersion: 1, meta: { createdAt: 'a', updatedAt: 'a' }, nodes: [{ id: 'r1', kind: 'request', label: 'Get', method: 'GET', url: '/a' }] };
    const ours = structuredClone(base);
    const theirs = {
      ...base,
      nodes: [{ id: 'r1', kind: 'request', label: 'Get users', method: 'GET', url: '/users' }],
    };
    const result = mergeCollectionsJson(base, ours, theirs);
    expect(result.conflictedIds).toEqual([]);
    expect((result.merged as { nodes: { url: string }[] }).nodes[0]?.url).toBe('/users');
  });

  it('keeps both added requests', () => {
    const base = { schemaVersion: 1, meta: { createdAt: 'a', updatedAt: 'a' }, nodes: [] };
    const ours = { ...base, nodes: [{ id: 'local', kind: 'request', label: 'Local', method: 'GET', url: '/l' }] };
    const theirs = { ...base, nodes: [{ id: 'remote', kind: 'request', label: 'Remote', method: 'GET', url: '/r' }] };
    const result = mergeCollectionsJson(base, ours, theirs);
    expect(result.conflictedIds).toEqual([]);
    const ids = (result.merged as { nodes: { id: string }[] }).nodes.map((n) => n.id);
    expect(ids).toEqual(['local', 'remote']);
  });

  it('reports conflict when both sides edit the same request', () => {
    const base = { schemaVersion: 1, meta: { createdAt: 'a', updatedAt: 'a' }, nodes: [{ id: 'r1', kind: 'request', label: 'Get', method: 'GET', url: '/a' }] };
    const ours = { ...base, nodes: [{ id: 'r1', kind: 'request', label: 'Ours', method: 'GET', url: '/o' }] };
    const theirs = { ...base, nodes: [{ id: 'r1', kind: 'request', label: 'Theirs', method: 'GET', url: '/t' }] };
    const result = mergeCollectionsJson(base, ours, theirs);
    expect(result.conflictedIds).toContain('r1');
    expect((result.merged as { nodes: { url: string }[] }).nodes[0]?.url).toBe('/o');
  });
});

describe('mergeEnvironmentsJson', () => {
  it('merges variables added on opposite sides', () => {
    const env = { id: 'e1', name: 'Dev', nodes: [] as unknown[] };
    const base = { schemaVersion: 1, meta: { createdAt: 'a', updatedAt: 'a' }, environments: [env] };
    const ours = {
      ...base,
      environments: [{ ...env, nodes: [{ id: 'v1', kind: 'variable', key: 'A', value: '1' }] }],
    };
    const theirs = {
      ...base,
      environments: [{ ...env, nodes: [{ id: 'v2', kind: 'variable', key: 'B', value: '2' }] }],
    };
    const result = mergeEnvironmentsJson(base, ours, theirs);
    expect(result.conflictedIds).toEqual([]);
    const keys = (result.merged as { environments: { nodes: { key: string }[] }[] }).environments[0]?.nodes.map(
      (n) => n.key,
    );
    expect(keys).toEqual(['A', 'B']);
  });
});
