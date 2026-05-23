import { applyTreeDescriptionVisibility } from '@app/shared/components/tx-tree/tx-tree-description-visibility';
import { applyTreeHttpMethodVisibility } from '@app/shared/components/tx-tree/tx-tree-http-method-visibility';
import { applyTreeTagsVisibility } from '@app/shared/components/tx-tree/tx-tree-tags-visibility';
import type {
  CollectionListSidebarFilter,
  CollectionListSidebarSortBy,
  HttpMethodDisplayId,
  HttpMethodId,
} from '@shared/config';

import { filterCollectionTree } from './collection-tree.filter';
import { filterCollectionTreeByMethod } from './collection-tree.filter-method';
import {
  filterCollectionTreeByKind,
  filterCollectionTreeFavourites,
} from './collection-tree.filter-kind';
import { filterCollectionTreeByTags } from './collection-tree.tags';
import { sortCollectionTreeByName } from './collection-tree.sort';
import type { CollectionTreeNode } from './collection-tree.types';

export interface CollectionTreeViewOptions {
  readonly query: string;
  readonly filter: CollectionListSidebarFilter;
  readonly sortBy: CollectionListSidebarSortBy;
  readonly tagFilter: readonly string[];
  readonly methodFilter: readonly HttpMethodId[];
  readonly showDescriptions: boolean;
  readonly showTags: boolean;
  readonly displayHttpMethod: HttpMethodDisplayId;
}

/** Applies sort, kind filter, favourites, search, and tree presentation flags. */
export function applyCollectionTreeView(
  nodes: readonly CollectionTreeNode[],
  options: CollectionTreeViewOptions,
): CollectionTreeNode[] {
  let next = [...nodes];

  if (options.sortBy === 'name') {
    next = sortCollectionTreeByName(next);
  }

  switch (options.filter) {
    case 'favourites':
      next = filterCollectionTreeFavourites(next);
      break;
    case 'folders':
      next = filterCollectionTreeByKind(next, 'folder');
      break;
    case 'requests':
      next = filterCollectionTreeByKind(next, 'request');
      break;
    case 'websockets':
      next = filterCollectionTreeByKind(next, 'websocket');
      break;
    default:
      break;
  }

  next = filterCollectionTreeByTags(next, options.tagFilter);

  if (options.filter === 'requests' && options.methodFilter.length > 0) {
    next = filterCollectionTreeByMethod(next, options.methodFilter);
  }

  next = filterCollectionTree(next, options.query);
  const withDescriptions = applyTreeDescriptionVisibility(next, options.showDescriptions);
  const withTags = applyTreeTagsVisibility(withDescriptions, options.showTags);
  return applyTreeHttpMethodVisibility(withTags, options.displayHttpMethod);
}
