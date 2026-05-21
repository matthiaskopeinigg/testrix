import type { CollectionFolderSettings, CollectionRequestSettings } from '@shared/config';
import type { TxTreeNode } from '@app/shared/components/tx-tree/tx-tree.types';

/** Node kinds shown in the Collections sidebar tree. */
export type CollectionTreeKind = 'folder' | 'request' | 'websocket';

/** Optional metadata carried on collection tree nodes. */
export interface CollectionTreeNodeMeta {
  readonly kind: CollectionTreeKind;
  readonly description?: string;
  readonly method?: string;
  readonly url?: string;
  readonly wsPath?: string;
  readonly settings?: CollectionFolderSettings;
  readonly requestSettings?: CollectionRequestSettings;
}

export type CollectionTreeNode = TxTreeNode<CollectionTreeNodeMeta>;
