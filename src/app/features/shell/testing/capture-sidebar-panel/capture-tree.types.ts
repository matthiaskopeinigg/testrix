import type { TxTreeNode } from '@app/shared/components/tx-tree/tx-tree.types';

export type CaptureTreeKind = 'folder' | 'session';

export type CaptureTreeNodeMeta =
  | { readonly kind: 'folder'; readonly updatedAt?: string }
  | {
      readonly kind: 'session';
      readonly startUrl?: string;
      readonly updatedAt?: string;
    };

export type CaptureTreeNode = TxTreeNode<CaptureTreeNodeMeta>;
