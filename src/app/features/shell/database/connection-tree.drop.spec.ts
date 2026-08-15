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
  it('remaps inside a connection to after that connection', () => {
    expect(remapConnectionDropTarget(dropContext(connectionA, connectionB, 'inside'))).toEqual({
      targetId: 'c-b',
      position: 'after',
    });
  });

  it('remaps catalog rows onto the owning connection', () => {
    expect(remapConnectionDropTarget(dropContext(connectionA, schema, 'before'))).toEqual({
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
