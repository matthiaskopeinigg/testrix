import type { SavedQueryTreeItem } from '@shared/database';
import { isSavedDatabaseQuery, isSavedQueryFolder } from '@shared/database';
import type { FlowDatabaseStepQuerySource } from '@shared/testing';

export type { FlowDatabaseStepQuerySource };

export const FLOW_DATABASE_QUERY_SOURCE_OPTIONS: readonly {
  readonly value: FlowDatabaseStepQuerySource;
  readonly label: string;
}[] = [
  { value: 'manual', label: 'Write query' },
  { value: 'saved', label: 'Saved query' },
];

/** Dropdown options for saved Database sidebar queries, with folder prefixes. */
export function savedQueryDropdownOptions(
  nodes: readonly SavedQueryTreeItem[],
): readonly { readonly value: string; readonly label: string }[] {
  const options: { readonly value: string; readonly label: string }[] = [];
  const walk = (list: readonly SavedQueryTreeItem[], prefix: string): void => {
    for (const item of list) {
      if (isSavedDatabaseQuery(item)) {
        options.push({
          value: item.id,
          label: prefix ? `${prefix} / ${item.name}` : item.name,
        });
        continue;
      }
      if (isSavedQueryFolder(item)) {
        walk(item.children, prefix ? `${prefix} / ${item.name}` : item.name);
      }
    }
  };
  walk(nodes, '');
  return options;
}
