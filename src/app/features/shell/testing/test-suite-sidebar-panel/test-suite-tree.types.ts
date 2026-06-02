import type { TxTreeNode } from '@app/shared/components/tx-tree/tx-tree.types';

export type TestSuiteTreeKind = 'folder' | 'flow';

export interface TestSuiteTreeNodeMeta {
  readonly kind: TestSuiteTreeKind;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly environmentId?: string | null;
  readonly updatedAt?: string;
  readonly isCritical?: boolean;
}

export type TestSuiteTreeNode = TxTreeNode<TestSuiteTreeNodeMeta>;
