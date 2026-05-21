import type {
  EnvironmentDefinition,
  EnvironmentListSidebarFilter,
  EnvironmentListSidebarSortBy,
} from '@shared/config';

import { environmentHasVariables } from './environment-list.has-variables';
import type { EnvironmentListItem } from './environment-profile.utils';
import { listEnvironmentDefinitions } from './environment-profile.utils';

export interface EnvironmentListViewOptions {
  readonly query: string;
  readonly filter: EnvironmentListSidebarFilter;
  readonly sortBy: EnvironmentListSidebarSortBy;
}

/**
 * Applies presentation sort, list filter, then search to environment profile rows.
 */
export function applyEnvironmentListView(
  environments: readonly EnvironmentDefinition[],
  options: EnvironmentListViewOptions,
): EnvironmentListItem[] {
  let items = listEnvironmentDefinitions(environments);

  if (options.filter === 'empty') {
    items = items.filter((item) => {
      const environment = environments.find((entry) => entry.id === item.id);
      return environment !== undefined && !environmentHasVariables(environment);
    });
  } else if (options.filter === 'with-variables') {
    items = items.filter((item) => {
      const environment = environments.find((entry) => entry.id === item.id);
      return environment !== undefined && environmentHasVariables(environment);
    });
  }

  if (options.sortBy === 'name') {
    items = [...items].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );
  } else {
    items = sortEnvironmentListByOrder(environments, items);
  }

  const query = options.query.trim().toLowerCase();
  if (!query) {
    return items;
  }

  return items.filter((item) => item.name.toLowerCase().includes(query));
}

function sortEnvironmentListByOrder(
  environments: readonly EnvironmentDefinition[],
  items: readonly EnvironmentListItem[],
): EnvironmentListItem[] {
  const orderById = new Map(
    environments.map((environment, index) => [
      environment.id,
      environment.order ?? index * 10,
    ]),
  );
  return [...items].sort((a, b) => {
    const orderA = orderById.get(a.id) ?? 0;
    const orderB = orderById.get(b.id) ?? 0;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}
