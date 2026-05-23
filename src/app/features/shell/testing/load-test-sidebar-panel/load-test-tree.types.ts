import type { TxTreeNode } from '@app/shared/components/tx-tree/tx-tree.types';

export type LoadTestTreeKind = 'folder' | 'artifact';

export interface LoadTestTreeNodeMeta {
  readonly kind: LoadTestTreeKind;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly updatedAt?: string;
}

export type LoadTestTreeNode = TxTreeNode<LoadTestTreeNodeMeta>;
