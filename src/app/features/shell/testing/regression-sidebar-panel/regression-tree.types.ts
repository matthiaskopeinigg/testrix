import type { TxIconName } from '@app/shared/icons/tx-icon.registry';

export type RegressionTreeKind = 'folder' | 'artifact';

export interface RegressionTreeNodeMeta {
  readonly kind: RegressionTreeKind;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly archivedAt?: string | null;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly flowCount?: number;
  readonly lastRunStatus?: 'passed' | 'failed' | 'cancelled' | 'running' | null;
}

export interface RegressionTreeNode {
  readonly id: string;
  readonly label: string;
  readonly subtitle?: string;
  readonly kind?: RegressionTreeKind;
  readonly icon?: TxIconName;
  readonly tags?: readonly string[];
  readonly data?: RegressionTreeNodeMeta;
  readonly children?: readonly RegressionTreeNode[];
}
