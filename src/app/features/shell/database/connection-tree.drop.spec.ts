import { describe, expect, it } from 'vitest';

import type { TxTreeDropContext } from '@app/shared/components/data/tx-tree/tx-tree.types';

import { connectionCatalogId } from './connection-catalog.ids';
import { connectionCanDrop, remapConnectionDropTarget } from './connection-tree.drop';
import type { ConnectionTreeNode, ConnectionTreeNodeMeta } from './connection-tree.types';

function dropContext(
  source: ConnectionTreeNode,
  target: ConnectionTreeNode,
  position: TxTreeDropContext<ConnectionTreeNodeMeta>['position'],
  targetParentId: string | null = null,
): TxTreeDropContext<ConnectionTreeNodeMeta> {
  return {
    sourceId: source.id,
    source,
    targetId: target.id,
    target,
    position,
    sourceParentId: null,
    targetParentId,
  };
}

const connectionA: ConnectionTreeNode = {
  id: 'c-a',
  label: 'Alpha',
  kind: 'connection',
  data: { kind: 'connection' },
};

const connectionB: ConnectionTreeNode = {
  id: 'c-b',
  label: 'Beta',
  kind: 'connection',
  data: { kind: 'connection' },
};

const folder: ConnectionTreeNode = {
  id: 'f1',
  label: 'Prod',
  kind: 'folder',
  data: { kind: 'folder' },
};

const schema: ConnectionTreeNode = {
  id: connectionCatalogId('c-b', 'schema', { schema: 'public' }),
  label: 'public',
  kind: 'schema',
  data: { kind: 'schema' },
};

describe('connection-tree.drop', () => {
  it('remaps inside a connection to before that connection so a later row can move up', () => {
    expect(remapConnectionDropTarget(dropContext(connectionA, connectionB, 'inside'))).toEqual({
      targetId: 'c-b',
      position: 'before',
    });
  });

  it('remaps catalog rows onto the owning connection', () => {
    expect(remapConnectionDropTarget(dropContext(connectionA, schema, 'before'))).toEqual({
      targetId: 'c-b',
      position: 'after',
    });
  });

  it('remaps before the schemas action row to before the connection', () => {
    const schemas: ConnectionTreeNode = {
      id: connectionCatalogId('c-b', 'schemas', { name: 'schemas' }),
      label: '1 Schemas selected',
      kind: 'schemas',
      data: { kind: 'schemas', connectionId: 'c-b' },
    };
    expect(remapConnectionDropTarget(dropContext(connectionA, schemas, 'before'))).toEqual({
      targetId: 'c-b',
      position: 'before',
    });
    expect(remapConnectionDropTarget(dropContext(connectionA, schemas, 'after'))).toEqual({
      targetId: 'c-b',
      position: 'after',
    });
  });

  it('does not remap before/after persistable rows', () => {
    expect(remapConnectionDropTarget(dropContext(connectionA, connectionB, 'after'))).toBeNull();
    expect(remapConnectionDropTarget(dropContext(connectionA, folder, 'inside'))).toBeNull();
  });

  it('allows reorder and connections inside folders, but not nested folders', () => {
    expect(connectionCanDrop(dropContext(connectionA, connectionB, 'after'))).toBe(true);
    expect(connectionCanDrop(dropContext(connectionA, folder, 'inside'))).toBe(true);
    expect(connectionCanDrop(dropContext(connectionA, connectionB, 'inside'))).toBe(false);
    expect(connectionCanDrop(dropContext(connectionA, schema, 'after'))).toBe(false);
    expect(connectionCanDrop(dropContext(folder, folder, 'inside'))).toBe(false);
    expect(connectionCanDrop(dropContext(folder, connectionA, 'after', 'f1'))).toBe(false);
    expect(connectionCanDrop(dropContext(folder, connectionA, 'after'))).toBe(true);
  });
});
