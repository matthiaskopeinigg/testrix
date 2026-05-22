import type { EnvironmentDefinition } from '@shared/config';

import type { EnvironmentListItem } from './environment-profile.utils';
import type { EnvironmentListTreeNode } from './environment-list-tree.types';

/** Maps environment profile rows to flat tx-tree nodes for the sidebar list. */
export function environmentListItemsToTreeNodes(
  items: readonly EnvironmentListItem[],
  environments: readonly EnvironmentDefinition[],
): EnvironmentListTreeNode[] {
  const orderById = new Map(environments.map((environment) => [environment.id, environment.order]));

  return items.map((item) => {
    const description = item.description?.trim();
    return {
      id: item.id,
      label: item.name,
      subtitle: description || undefined,
      kind: 'leaf',
      icon: 'globe',
      order: orderById.get(item.id),
      data: { kind: 'profile' },
    };
  });
}
