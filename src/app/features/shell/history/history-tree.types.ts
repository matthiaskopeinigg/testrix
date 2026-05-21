import type { HistoryRequestCapture } from '@shared/config';
import type { HttpResponseSnapshot } from '@shared/http/outgoing-request.schema';

import type { TxTreeNode } from '@app/shared/components/tx-tree/tx-tree.types';

/** Metadata carried on history tree nodes. */
export interface HistoryTreeNodeMeta {
  readonly kind: 'history';
  readonly method: string;
  readonly url: string;
  readonly requestedAt: string;
  readonly requestId?: string;
  readonly snapshotId?: string;
  readonly statusCode?: number;
  readonly durationMs?: number;
  readonly snapshot?: HttpResponseSnapshot;
  readonly request?: HistoryRequestCapture;
}

export type HistoryTreeNode = TxTreeNode<HistoryTreeNodeMeta>;
