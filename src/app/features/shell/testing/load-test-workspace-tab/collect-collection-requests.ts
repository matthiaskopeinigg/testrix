import type { CollectionTreeNode } from '@app/features/shell/collections/collection-tree.types';
import type { TxDropdownOption } from '@app/shared/components/tx-dropdown/tx-dropdown.types';

/** Collects collection HTTP requests as dropdown options. */
export function collectCollectionRequestOptions(
  nodes: readonly CollectionTreeNode[],
  emptyLabel = 'No target request',
): readonly TxDropdownOption[] {
  const options: TxDropdownOption[] = [{ value: '', label: emptyLabel }];
  const walk = (list: readonly CollectionTreeNode[], prefix = ''): void => {
    for (const node of list) {
      const kind = node.data?.kind ?? node.kind;
      const labelPrefix = prefix ? `${prefix} / ` : '';
      if (kind === 'request') {
        const method = node.data?.method ?? 'GET';
        const url = node.data?.url?.trim() ?? '';
        const urlSnippet = url.length > 40 ? `${url.slice(0, 37)}…` : url;
        const label = urlSnippet
          ? `${labelPrefix}${method} ${node.label} (${urlSnippet})`
          : `${labelPrefix}${method} ${node.label}`;
        options.push({ value: node.id, label });
      }
      if (kind === 'folder' && node.children?.length) {
        walk(node.children, `${labelPrefix}${node.label}`);
      }
    }
  };
  walk(nodes);
  return options;
}

/** Finds a collection request label by id for display in chrome. */
export function collectionRequestLabel(
  nodes: readonly CollectionTreeNode[],
  requestId: string | undefined,
): string {
  if (!requestId) {
    return 'No target';
  }
  const find = (list: readonly CollectionTreeNode[]): string | null => {
    for (const node of list) {
      const kind = node.data?.kind ?? node.kind;
      if (kind === 'request' && node.id === requestId) {
        const method = node.data?.method ?? 'GET';
        return `${method} ${node.label}`;
      }
      if (node.children?.length) {
        const found = find(node.children);
        if (found) {
          return found;
        }
      }
    }
    return null;
  };
  return find(nodes) ?? 'Missing request';
}
