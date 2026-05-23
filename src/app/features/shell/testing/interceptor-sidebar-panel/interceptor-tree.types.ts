import type { TxTreeNode } from '@app/shared/components/tx-tree/tx-tree.types';

export type InterceptorTreeKind = 'folder' | 'rule';

export type InterceptorTreeNodeMeta =
  | { readonly kind: 'folder'; readonly updatedAt?: string }
  | {
      readonly kind: 'rule';
      readonly matchUrl?: string;
      readonly enabled?: boolean;
      readonly updatedAt?: string;
    };

export type InterceptorTreeNode = TxTreeNode<InterceptorTreeNodeMeta>;
