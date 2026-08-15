import type { TxTreeDropContext, TxTreeDropRemap } from '@app/shared/components/data/tx-tree/tx-tree.types';

import { parseConnectionCatalogId } from './connection-catalog.ids';
import type { ConnectionTreeNodeMeta } from './connection-tree.types';

function persistableKind(kind: string | undefined): boolean {
  return kind === 'folder' || kind === 'connection';
}

function nodeKind(ctx: TxTreeDropContext<ConnectionTreeNodeMeta>, which: 'source' | 'target'): string {
  const node = which === 'source' ? ctx.source : ctx.target;
  return node.data?.kind ?? node.kind ?? '';
}

/**
 * Rewrites drops on live catalog rows (and `inside` a connection) onto the owning
 * persisted connection so reorder does not nest folders/connections under schemas.
 */
export function remapConnectionDropTarget(
  ctx: TxTreeDropContext<ConnectionTreeNodeMeta>,
): TxTreeDropRemap | null {
  const targetKind = nodeKind(ctx, 'target');
  if (targetKind === 'connection' && ctx.position === 'inside') {
    return { targetId: ctx.targetId, position: 'after' };
  }
  if (persistableKind(targetKind)) {
    return null;
  }
  const catalog = parseConnectionCatalogId(ctx.targetId);
  if (!catalog) {
    return null;
  }
  return { targetId: catalog.connectionId, position: 'after' };
}

/** Drop policy for the connections tree: persistable nodes only; folders stay at the root. */
export function connectionCanDrop(ctx: TxTreeDropContext<ConnectionTreeNodeMeta>): boolean {
  const sourceKind = nodeKind(ctx, 'source');
  const targetKind = nodeKind(ctx, 'target');
  if (!persistableKind(sourceKind)) {
    return false;
  }
  if (sourceKind === 'folder') {
    if (ctx.position === 'inside') {
      return false;
    }
    return persistableKind(targetKind) && ctx.targetParentId === null;
  }
  if (ctx.position === 'inside') {
    return targetKind === 'folder';
  }
  return persistableKind(targetKind);
}
