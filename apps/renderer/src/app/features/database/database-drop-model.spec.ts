import { describe, expect, it } from 'vitest';

import type { DatabaseNavNode } from './database-nav';
import {
  buildSlotTable,
  DATABASE_ROOT_ID,
  flattenTree,
  resolveSlot,
  TREE_GUTTER_PX,
  TREE_INDENT_PX,
  type DropSlotTable,
  type MeasuredRow,
  type TreeNodeInfo,
} from './database-drop-model';

const ROW_HEIGHT = 30;
const ROW_PITCH = 32;
const CONTENT_BOTTOM = 400;

function folder(id: string, children: readonly DatabaseNavNode[]): DatabaseNavNode {
  return { id, kind: 'folder', name: id, section: 'connections', children };
}

function connection(id: string): DatabaseNavNode {
  return { id, kind: 'connection', name: id, section: 'connections', connectionId: id };
}

/**
 * folder-a       depth 0
 *   pm           depth 1
 */
function nestedOnly(): DatabaseNavNode[] {
  return [folder('folder-a', [connection('pm')])];
}

/**
 * folder-a       depth 0
 *   pm           depth 1
 * other          depth 0
 */
function nestedThenSibling(): DatabaseNavNode[] {
  return [folder('folder-a', [connection('pm')]), connection('other')];
}

function layout(infos: readonly TreeNodeInfo[]): MeasuredRow[] {
  return infos.map((info, position) => ({
    ...info,
    top: position * ROW_PITCH,
    height: ROW_HEIGHT,
  }));
}

function tableFor(
  draggedId: string,
  nodes: readonly DatabaseNavNode[] = nestedOnly(),
  expanded: readonly string[] = ['folder-a'],
): DropSlotTable {
  const rows = layout(flattenTree(nodes, (id) => expanded.includes(id)));
  const dragged = rows.find((row) => row.id === draggedId);
  return buildSlotTable(rows, {
    draggedId,
    draggedIsFolder: dragged?.kind === 'folder',
    contentTop: 0,
    contentBottom: CONTENT_BOTTOM,
  });
}

function xForDepth(depth: number): number {
  return TREE_GUTTER_PX + depth * TREE_INDENT_PX;
}

describe('database drop out of folder', () => {
  it('moves a nested connection to root in the empty space below', () => {
    const table = tableFor('pm');
    const slot = resolveSlot(table, xForDepth(1), 320, null);
    expect(slot).toMatchObject({
      parentId: DATABASE_ROOT_ID,
      index: 1,
      denied: false,
    });
  });

  it('outdents when dropping a child onto its own folder row', () => {
    const table = tableFor('pm');
    const slot = resolveSlot(table, xForDepth(0), 15, null);
    expect(slot).toMatchObject({
      parentId: DATABASE_ROOT_ID,
      index: 1,
      denied: false,
      mode: 'between',
    });
  });

  it('picks root at the shallow indent when closing a folder', () => {
    const table = tableFor('pm', nestedThenSibling());
    const y = ROW_PITCH + ROW_HEIGHT / 2 + 8;
    expect(resolveSlot(table, xForDepth(0), y, null)).toMatchObject({
      parentId: DATABASE_ROOT_ID,
      index: 1,
      denied: false,
    });
    expect(resolveSlot(table, xForDepth(1), y, null)?.parentId).toBe('folder-a');
  });
});
