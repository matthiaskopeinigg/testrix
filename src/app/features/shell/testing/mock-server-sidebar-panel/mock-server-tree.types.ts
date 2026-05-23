import type { TxTreeNode } from '@app/shared/components/tx-tree/tx-tree.types';

export type MockServerTreeKind = 'folder' | 'endpoint';

export interface MockServerTreeNodeMeta {
  readonly kind: MockServerTreeKind;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly updatedAt?: string;
  readonly enabled?: boolean;
}

export type MockServerTreeNode = TxTreeNode<MockServerTreeNodeMeta>;
