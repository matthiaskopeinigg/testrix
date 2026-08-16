import type { DatabaseType } from '@shared/config';

import type { TxTreeNode } from '@app/shared/components/data/tx-tree/tx-tree.types';

export type ConnectionTreeKind =
  | 'folder'
  | 'connection'
  | 'schemas'
  | 'schema'
  | 'group'
  | 'table'
  | 'view'
  | 'column'
  | 'index'
  | 'foreignKey'
  | 'status'
  | 'keys';

export type ConnectionTreeNodeMeta =
  | { readonly kind: 'folder'; readonly updatedAt?: string }
  | {
      readonly kind: 'connection';
      readonly type?: DatabaseType;
      readonly host?: string;
      readonly port?: number;
      readonly filePath?: string;
    }
  | {
      readonly kind: Exclude<ConnectionTreeKind, 'folder' | 'connection'>;
      readonly connectionId?: string;
      readonly schema?: string;
      readonly table?: string;
      readonly name?: string;
      readonly group?: 'tables' | 'views' | 'columns' | 'indexes' | 'foreignKeys';
    };

export type ConnectionTreeNode = TxTreeNode<ConnectionTreeNodeMeta>;
