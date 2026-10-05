import { describe, expect, it } from 'vitest';

import type { CollectionNode, CollectionTree } from './collection-tree';
import type { ServiceTreeNode } from './service-tree';
import type { DatabaseConnectionTreeItem } from './database';
import type { EnvironmentsFile } from './environment';
import type { FlowGraphTemplate } from './flow-templates-file';
import {
  buildChecksumMaterial,
  buildPackPayload,
  collectCollectionDescendantIds,
  computePackChecksum,
  mergeCollectionTrees,
  pruneCollectionTree,
  pruneEnvironmentsFile,
  remintCollectionTree,
  selectionCheckState,
  toggleTreeSelection,
} from './workspace-pack';

function folder(id: string, name: string, children: CollectionTree): CollectionNode {
  return {
    kind: 'folder',
    id,
    name,
    modifiedAt: '2020-01-01T00:00:00.000Z',
    children,
  };
}

function http(id: string, name: string): CollectionNode {
  return {
    kind: 'http',
    id,
    name,
    modifiedAt: '2020-01-01T00:00:00.000Z',
    method: 'GET',
    status: null,
  };
}

describe('pruneCollectionTree', () => {
  it('keeps selected nodes and prunes partial folders', () => {
    const tree: CollectionTree = [
      folder('f1', 'API', [
        http('h1', 'One'),
        http('h2', 'Two'),
        folder('f2', 'Nested', [http('h3', 'Three')]),
      ]),
    ];
    const pruned = pruneCollectionTree(tree, new Set(['h2', 'h3']));
    expect(pruned).toHaveLength(1);
    expect(pruned[0]?.kind).toBe('folder');
    if (pruned[0]?.kind !== 'folder')
      return;
    expect(pruned[0].children.map((node) => node.id)).toEqual(['h2', 'f2']);
    const nested = pruned[0].children.find((node) => node.id === 'f2');
    expect(nested?.kind).toBe('folder');
    if (nested?.kind !== 'folder')
      return;
    expect(nested.children.map((node) => node.id)).toEqual(['h3']);
  });

  it('keeps the full subtree when a folder id is selected', () => {
    const tree: CollectionTree = [
      folder('f1', 'API', [http('h1', 'One'), http('h2', 'Two')]),
    ];
    const pruned = pruneCollectionTree(tree, new Set(['f1']));
    expect(pruned).toEqual(tree);
  });
});

describe('computePackChecksum', () => {
  it('is stable for sorted material', async () => {
    const entries = {
      'b.json': '{"b":2}',
      'a.json': '{"a":1}',
    };
    const first = await computePackChecksum(entries);
    const second = await computePackChecksum(entries);
    expect(first).toBe(second);
    expect(first).toHaveLength(64);
    const material = buildChecksumMaterial(entries);
    expect(material.byteLength).toBeGreaterThan(0);
  });
});

describe('mergeCollectionTrees', () => {
  it('remints ids on incoming nodes', () => {
    const existing: CollectionTree = [http('keep', 'Keep')];
    const incoming: CollectionTree = [http('old', 'Old')];
    const merged = mergeCollectionTrees(existing, incoming, { remintIds: true });
    expect(merged).toHaveLength(2);
    expect(merged[0]?.id).toBe('keep');
    expect(merged[1]?.id).not.toBe('old');
    expect(merged[1]?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const reminted = remintCollectionTree(incoming);
    expect(reminted[0]?.id).not.toBe('old');
  });
});

describe('selectionCheckState', () => {
  it('returns indeterminate for partial subtree selection', () => {
    const tree: CollectionTree = [folder('f1', 'Root', [http('h1', 'A'), http('h2', 'B')])];
    const root = tree[0];
    if (!root)
      return;
    const descendants = collectCollectionDescendantIds(root);
    const selected = new Set(['h1']);
    const getDescendantIds = (id: string): readonly string[] =>
      id === 'f1' ? descendants : [id];
    expect(selectionCheckState('f1', selected, getDescendantIds)).toBe('indeterminate');
    expect(selectionCheckState('f1', new Set(descendants), getDescendantIds)).toBe('checked');
    expect(selectionCheckState('f1', new Set(), getDescendantIds)).toBe('unchecked');
  });
});

describe('toggleTreeSelection', () => {
  it('selects and clears all descendants', () => {
    const ids = ['f1', 'h1', 'h2'];
    const selected = toggleTreeSelection(new Set<string>(), 'f1', ids);
    expect([...selected].sort()).toEqual(['f1', 'h1', 'h2']);
    const cleared = toggleTreeSelection(selected, 'f1', ids);
    expect(cleared.size).toBe(0);
  });
});

describe('pruneEnvironmentsFile', () => {
  it('filters items and fixes activeId and orderIds', () => {
    const file: EnvironmentsFile = {
      schemaVersion: 1,
      activeId: 'env-b',
      orderIds: ['env-a', 'env-b', 'env-c'],
      items: [
        {
          id: 'env-a',
          name: 'A',
          modifiedAt: '2020-01-01T00:00:00.000Z',
          variables: [],
        },
        {
          id: 'env-b',
          name: 'B',
          modifiedAt: '2020-01-01T00:00:00.000Z',
          variables: [],
        },
        {
          id: 'env-c',
          name: 'C',
          modifiedAt: '2020-01-01T00:00:00.000Z',
          variables: [],
        },
      ],
    };
    const pruned = pruneEnvironmentsFile(file, new Set(['env-a', 'env-c']));
    expect(pruned.items.map((item) => item.id)).toEqual(['env-a', 'env-c']);
    expect(pruned.orderIds).toEqual(['env-a', 'env-c']);
    expect(pruned.activeId).toBe('env-a');
  });
});

describe('buildPackPayload', () => {
  it('prunes database nodes and load service trees when ids are set', () => {
    const dbNodes: DatabaseConnectionTreeItem[] = [
      {
        kind: 'folder',
        id: 'df1',
        name: 'Group',
        children: [
          {
            id: 'db-1',
            name: 'One',
            type: 'postgresql',
            host: 'localhost',
            port: 5432,
            user: 'u',
            password: '',
            database: 'd',
          },
          {
            id: 'db-2',
            name: 'Two',
            type: 'postgresql',
            host: 'localhost',
            port: 5432,
            user: 'u',
            password: '',
            database: 'd',
          },
        ],
      },
    ];
    const templates: FlowGraphTemplate[] = [
      {
        id: 'tpl-1',
        name: 'Keep',
        hint: '',
        tags: [],
        steps: [],
        links: [],
      },
      {
        id: 'tpl-2',
        name: 'Drop',
        hint: '',
        tags: [],
        steps: [],
        links: [],
      },
    ];
    const payload = buildPackPayload(
      {
        'database.json': { schemaVersion: 1, nodes: dbNodes },
        'load.json': {
          schemaVersion: 1,
          items: [
            {
              kind: 'artifact',
              id: 'load-1',
              name: 'Load',
              updatedAt: '2020-01-01T00:00:00.000Z',
              tags: [],
            },
            {
              kind: 'artifact',
              id: 'load-2',
              name: 'Other',
              updatedAt: '2020-01-01T00:00:00.000Z',
              tags: [],
            },
          ],
        },
        'flow-templates.json': {
          schemaVersion: 1,
          templates,
          hiddenBuiltinIds: [],
          groups: [],
        },
      },
      {
        categories: ['database', 'load', 'flow-templates'],
        databaseIds: ['db-1'],
        loadIds: ['load-1'],
        flowTemplateIds: ['tpl-1'],
      },
    );
    const database = payload['database.json'] as { nodes: DatabaseConnectionTreeItem[] };
    expect(database.nodes).toHaveLength(1);
    expect(database.nodes[0]?.kind).toBe('folder');
    if (database.nodes[0]?.kind !== 'folder')
      return;
    expect(database.nodes[0].children.map((node) => node.id)).toEqual(['db-1']);
    const load = payload['load.json'] as { items: { id: string }[] };
    expect(load.items.map((item) => item.id)).toEqual(['load-1']);
    const flowTemplates = payload['flow-templates.json'] as { templates: FlowGraphTemplate[] };
    expect(flowTemplates.templates.map((item) => item.id)).toEqual(['tpl-1']);
  });

  it('keeps all collections when collectionIds is empty or omitted', () => {
    const tree: CollectionTree = [folder('f1', 'API', [http('h1', 'One'), http('h2', 'Two')])];
    const files = {
      'collections.json': { schemaVersion: 1, collections: tree },
    };
    for (const collectionIds of [undefined, [] as string[]]) {
      const payload = buildPackPayload(files, {
        categories: ['collections'],
        collectionIds,
      });
      const collections = payload['collections.json'] as { collections: CollectionTree };
      expect(collections.collections).toEqual(tree);
    }
  });
});

describe('pruneServiceTree integration', () => {
  it('is exported via prune helper usage on flows-shaped trees', async () => {
    const { pruneServiceTree } = await import('./workspace-pack');
    const tree: ServiceTreeNode<{ readonly tags: readonly string[] }>[] = [
      {
        kind: 'folder',
        id: 'sf1',
        name: 'Flows',
        updatedAt: '2020-01-01T00:00:00.000Z',
        children: [
          {
            kind: 'artifact',
            id: 'flow1',
            name: 'Flow',
            updatedAt: '2020-01-01T00:00:00.000Z',
            tags: [],
          },
        ],
      },
    ];
    const pruned = pruneServiceTree(tree, new Set(['flow1']));
    expect(pruned).toHaveLength(1);
    if (pruned[0]?.kind !== 'folder')
      return;
    expect(pruned[0].children).toHaveLength(1);
  });
});
