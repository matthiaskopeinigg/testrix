import type { TxTreeNode } from '@app/shared/components/tx-tree/tx-tree.types';

/** Node kinds shown in the Environments sidebar tree. */
export type EnvironmentTreeKind = 'folder' | 'variable';

/** Metadata carried on environment tree nodes. */
export interface EnvironmentTreeNodeMeta {
  readonly kind: EnvironmentTreeKind;
  readonly key?: string;
  readonly value?: string;
  readonly description?: string;
}

export type EnvironmentTreeNode = TxTreeNode<EnvironmentTreeNodeMeta>;
