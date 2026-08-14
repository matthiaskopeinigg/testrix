import type { TxTreeNode } from '@app/shared/components/data/tx-tree/tx-tree.types';

export type EnvironmentListTreeKind = 'profile';

export interface EnvironmentListTreeNodeMeta {
  readonly kind: EnvironmentListTreeKind;
}

export type EnvironmentListTreeNode = TxTreeNode<EnvironmentListTreeNodeMeta>;
