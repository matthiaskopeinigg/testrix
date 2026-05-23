import type { HttpMethodDisplayId } from '@shared/config';
import { httpMethodShowsInTree } from '@shared/config';
import { treeRowLabelWithHttpMethod } from '@shared/http';

import type { TxTreeNode } from './tx-tree.types';

type NodeWithMethod = { readonly method?: string; readonly kind?: string };

function resolveRequestMethod<TMeta extends NodeWithMethod>(
  node: TxTreeNode<TMeta>,
): string | undefined {
  const kind = node.data?.kind ?? node.kind;
  if (kind !== 'request') {
    return undefined;
  }
  const method = node.data?.method?.trim();
  return method || undefined;
}

/**
 * Sets {@link TxTreeNode.httpMethod} for request rows when the display mode includes the tree.
 */
export function applyTreeHttpMethodVisibility<TMeta extends NodeWithMethod>(
  nodes: readonly TxTreeNode<TMeta>[],
  mode: HttpMethodDisplayId,
): TxTreeNode<TMeta>[] {
  const show = httpMethodShowsInTree(mode);

  return nodes.map((node) => {
    const httpMethod = show ? resolveRequestMethod(node) : undefined;
    return {
      ...node,
      httpMethod,
      label: httpMethod ? treeRowLabelWithHttpMethod(httpMethod, node.label) : node.label,
      children: node.children?.length
        ? applyTreeHttpMethodVisibility(node.children, mode)
        : node.children,
    };
  });
}
