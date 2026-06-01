import type { EnvironmentDefinition } from '@shared/config';

import type { CollectionTreeKind, CollectionTreeNode } from '@app/features/shell/collections/collection-tree.types';
import type { CaptureTreeNode } from '@app/features/shell/testing/capture-sidebar-panel/capture-tree.types';
import type { HistoryTreeNode } from '@app/features/shell/history/history-tree.types';
import type { InterceptorTreeNode } from '@app/features/shell/testing/interceptor-sidebar-panel/interceptor-tree.types';
import type { LoadTestTreeNode } from '@app/features/shell/testing/load-test-sidebar-panel/load-test-tree.types';
import type { MockServerTreeNode } from '@app/features/shell/testing/mock-server-sidebar-panel/mock-server-tree.types';
import type { RegressionTreeNode } from '@app/features/shell/testing/regression-sidebar-panel/regression-tree.types';
import type { TestSuiteTreeKind, TestSuiteTreeNode } from '@app/features/shell/testing/test-suite-sidebar-panel/test-suite-tree.types';
import type { TxTreeNode } from '@app/shared/components/tx-tree/tx-tree.types';

function trimOrEmpty(value: string | undefined | null): string {
  return value?.trim() ?? '';
}

function kindPathLabel(kind: string, path: string): string {
  const capitalized = kind.charAt(0).toUpperCase() + kind.slice(1);
  return `${capitalized} · ${path}`;
}

/** Hint for collection request / folder / websocket quick-open rows. */
export function collectionPaletteHint(node: CollectionTreeNode, path: string): string {
  const kind = node.data?.kind;
  if (kind === 'request') {
    const method = trimOrEmpty(node.data?.method);
    const url = trimOrEmpty(node.data?.url);
    if (method && url) {
      return `${method} ${url}`;
    }
    if (url) {
      return url;
    }
    return `Request · ${path}`;
  }
  if (kind === 'websocket') {
    const wsPath = trimOrEmpty(node.data?.wsPath);
    if (wsPath) {
      return `WS ${wsPath}`;
    }
    return `WebSocket · ${path}`;
  }
  if (kind === 'folder') {
    const description = trimOrEmpty(node.data?.description);
    if (description) {
      return description;
    }
    return `Folder · ${path}`;
  }
  return path;
}

/** Hint for environment quick-open rows. */
export function environmentPaletteHint(environment: EnvironmentDefinition): string {
  const description = trimOrEmpty(environment.description);
  if (description) {
    return description;
  }
  return `Environment · ${environment.name}`;
}

/** Hint for history quick-open rows. */
export function historyPaletteHint(node: HistoryTreeNode): string {
  const method = trimOrEmpty(node.data?.method ?? node.httpMethod);
  const url = trimOrEmpty(node.data?.url ?? node.subtitle);
  if (method && url) {
    return `${method} ${url}`;
  }
  if (url) {
    return url;
  }
  return trimOrEmpty(node.label);
}

/** Hint for test suite folder / flow quick-open rows. */
export function testSuitePaletteHint(
  node: TestSuiteTreeNode,
  path: string,
  kind: TestSuiteTreeKind,
): string {
  const subtitle = trimOrEmpty(node.subtitle);
  if (subtitle) {
    return subtitle;
  }
  const description = trimOrEmpty(node.data?.description);
  if (description) {
    return description;
  }
  return kindPathLabel(kind, path);
}

/** Hint for load test artifact quick-open rows. */
export function loadTestPaletteHint(node: LoadTestTreeNode, path: string): string {
  const subtitle = trimOrEmpty(node.subtitle);
  if (subtitle) {
    return subtitle;
  }
  const description = trimOrEmpty(node.data?.description);
  if (description) {
    return description;
  }
  return 'Open in workspace';
}

/** Hint for regression artifact quick-open rows. */
export function regressionPaletteHint(node: RegressionTreeNode, path: string): string {
  const subtitle = trimOrEmpty(node.subtitle);
  if (subtitle) {
    return subtitle;
  }
  const description = trimOrEmpty(node.data?.description);
  if (description) {
    return description;
  }
  return 'Open in workspace';
}

/** Hint for mock server endpoint quick-open rows. */
export function mockServerPaletteHint(node: MockServerTreeNode, path: string): string {
  const subtitle = trimOrEmpty(node.subtitle);
  if (subtitle) {
    return subtitle;
  }
  const description = trimOrEmpty(node.data?.description);
  if (description) {
    return description;
  }
  return 'Open in workspace';
}

/** Hint for capture session quick-open rows. */
export function capturePaletteHint(node: CaptureTreeNode, path: string): string {
  if (node.data?.kind === 'session') {
    const startUrl = trimOrEmpty(node.data.startUrl ?? node.subtitle);
    if (startUrl) {
      return `Start URL · ${startUrl}`;
    }
  }
  const subtitle = trimOrEmpty(node.subtitle);
  if (subtitle) {
    return subtitle;
  }
  return kindPathLabel('session', path);
}

/** Hint for interceptor rule quick-open rows. */
export function interceptorPaletteHint(node: InterceptorTreeNode, path: string): string {
  if (node.data?.kind === 'rule') {
    const matchUrl = trimOrEmpty(node.data.matchUrl);
    if (matchUrl) {
      return `Match · ${matchUrl}`;
    }
  }
  const subtitle = trimOrEmpty(node.subtitle);
  if (subtitle) {
    return subtitle;
  }
  return kindPathLabel('rule', path);
}

/** Generic artifact hint using subtitle / description / fallback. */
export function artifactPaletteHint(
  node: TxTreeNode<unknown>,
  path: string,
  fallback = 'Open in workspace',
): string {
  const subtitle = trimOrEmpty(node.subtitle);
  if (subtitle) {
    return subtitle;
  }
  const data = node.data as { description?: string } | undefined;
  const description = trimOrEmpty(data?.description);
  if (description) {
    return description;
  }
  return fallback;
}
