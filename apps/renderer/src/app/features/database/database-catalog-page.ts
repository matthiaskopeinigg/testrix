import type { DatabaseNavNode } from './database-nav';

export const DATABASE_CATALOG_PAGE_SIZE = 50;

export const DATABASE_CATALOG_FILTER_MIN = 16;

export function isPagedCatalogNode(node: DatabaseNavNode): boolean {
  return node.kind === 'group' || node.kind === 'connection';
}

export function catalogNameMatches(name: string, needle: string): boolean {
  const query = needle.trim().toLowerCase();
  if (!query)
    return true;
  return name.toLowerCase().includes(query);
}

export function filterCatalogChildren(
  children: readonly DatabaseNavNode[],
  needle: string,
): readonly DatabaseNavNode[] {
  const query = needle.trim().toLowerCase();
  if (!query)
    return children;
  return children.filter((child) => catalogNameMatches(child.name, query) || catalogNameMatches(child.detail ?? '', query));
}

export interface CatalogPage {
  readonly visible: readonly DatabaseNavNode[];
  readonly total: number;
  readonly remaining: number;
}

export function pageCatalogChildren(
  children: readonly DatabaseNavNode[],
  limit: number,
): CatalogPage {
  const size = Math.max(1, Math.floor(limit));
  const visible = children.slice(0, size);
  return {
    visible,
    total: children.length,
    remaining: Math.max(0, children.length - visible.length),
  };
}

export function filterCatalogSearch(
  nodes: readonly DatabaseNavNode[],
  needle: string,
): DatabaseNavNode[] {
  const query = needle.trim().toLowerCase();
  if (!query)
    return [...nodes];
  const out: DatabaseNavNode[] = [];
  for (const node of nodes) {
    const self = catalogNameMatches(node.name, query) || catalogNameMatches(node.detail ?? '', query);
    if (node.kind === 'folder') {
      const children = filterCatalogSearch(node.children ?? [], needle);
      if (self)
        out.push({ ...node, children: node.children ?? [] });
      else if (children.length > 0)
        out.push({ ...node, children });
      continue;
    }
    if (node.kind === 'connection') {
      const children = filterCatalogSearch(node.children ?? [], needle);
      if (self)
        out.push(node);
      else if (children.length > 0)
        out.push({ ...node, children });
      continue;
    }
    if (
      node.kind === 'schema' ||
      node.kind === 'group' ||
      node.kind === 'table' ||
      node.kind === 'view'
    ) {
      const children = filterCatalogSearch(node.children ?? [], needle);
      if (self)
        out.push(node);
      else if (children.length > 0)
        out.push({ ...node, children });
      continue;
    }
    if (self)
      out.push(node);
  }
  return out;
}

export function catalogSearchReveals(node: DatabaseNavNode, needle: string): boolean {
  const query = needle.trim().toLowerCase();
  if (!query)
    return false;
  if (catalogNameMatches(node.name, query) || catalogNameMatches(node.detail ?? '', query))
    return false;
  return (node.children?.length ?? 0) > 0;
}
