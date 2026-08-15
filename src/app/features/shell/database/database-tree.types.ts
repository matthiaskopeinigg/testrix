import type { TxTreeNode } from '@app/shared/components/data/tx-tree/tx-tree.types';

export type DatabaseTreeKind = 'folder' | 'query';

export type DatabaseTreeNodeMeta =
  | { readonly kind: 'folder'; readonly updatedAt?: string }
  | {
      readonly kind: 'query';
      readonly connectionId?: string;
      readonly query?: string;
      readonly updatedAt?: string;
    };

export type DatabaseTreeNode = TxTreeNode<DatabaseTreeNodeMeta>;
