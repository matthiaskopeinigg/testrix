import type { EnvironmentDefinition, WorkspaceTab, WorkspaceTabKind } from '@shared/config';
import {
  MOCK_SERVER_HUB_TAB_ID,
  parseTestSuiteTabResourceId,
  shouldStripWorkspaceTabOnRestore,
} from '@shared/testing';

import { findCollectionNode } from '@app/features/shell/collections/collection-tree.mutations';
import type { CollectionTreeNode } from '@app/features/shell/collections/collection-tree.types';
import { findDesignSystemSection } from '@app/core/design-system/design-system.registry';
import { findDevelopmentTool } from '@app/core/development-tools/development-tool.registry';
import { getEnvironmentDefinition } from '@app/features/shell/environments/environment-profile.utils';
import { findEnvironmentNode } from '@app/features/shell/environments/environment-tree.mutations';
import { toTreeNodes } from '@app/features/shell/environments/environment-tree.adapter';
import { findHistoryNode } from '@app/features/shell/history/history-tree.mutations';
import type { HistoryTreeNode } from '@app/features/shell/history/history-tree.types';
import type { CaptureWorkbenchStore } from '@app/core/testing/capture-workbench.store';
import type { InterceptorWorkspaceStore } from '@app/core/testing/interceptor-workspace.store';
import type { LoadTestService } from '@app/core/testing/load-test.service';
import type { MockServerService } from '@app/core/testing/mock-server.service';
import type { RegressionService } from '@app/core/testing/regression.service';
import type { TestSuiteService } from '@app/core/testing/test-suite.service';
import type { CollectionsService } from '@app/core/collections/collections.service';
import type { EnvironmentsService } from '@app/core/environments/environments.service';
import type { HistoryService } from '@app/core/history/history.service';

export interface WorkspaceTabResourceLookupContext {
  readonly collections: CollectionsService;
  readonly environments: EnvironmentsService;
  readonly history: HistoryService;
  readonly testSuite: TestSuiteService;
  readonly loadTest: LoadTestService;
  readonly regression: RegressionService;
  readonly mockServer: MockServerService;
  readonly capture: CaptureWorkbenchStore;
  readonly interceptor: InterceptorWorkspaceStore;
}

function collectionKind(node: CollectionTreeNode): string | undefined {
  return node.data?.kind ?? node.kind;
}

function collectionResourceExists(
  nodes: readonly CollectionTreeNode[],
  resourceId: string,
  kind: WorkspaceTabKind,
): boolean {
  const loc = findCollectionNode(nodes, resourceId);
  if (!loc) {
    return false;
  }
  const nodeKind = collectionKind(loc.node);
  if (kind === 'request') {
    return nodeKind === 'request';
  }
  if (kind === 'folder') {
    return nodeKind === 'folder';
  }
  if (kind === 'websocket') {
    return nodeKind === 'websocket';
  }
  return false;
}

function historyResourceExists(nodes: readonly HistoryTreeNode[], resourceId: string): boolean {
  return findHistoryNode(nodes, resourceId) !== null;
}

function environmentResourceExists(
  environments: readonly EnvironmentDefinition[],
  resourceId: string,
): boolean {
  if (getEnvironmentDefinition(environments, resourceId)) {
    return true;
  }
  for (const env of environments) {
    const scope = toTreeNodes(env.nodes);
    if (findEnvironmentNode(scope, resourceId)) {
      return true;
    }
  }
  return false;
}

/**
 * Returns whether a workspace tab resource exists in the active profile data sets.
 */
export function workspaceTabResourceExists(
  ctx: WorkspaceTabResourceLookupContext,
  tab: Pick<WorkspaceTab, 'resourceId' | 'kind'>,
): boolean {
  const { resourceId, kind } = tab;
  if (shouldStripWorkspaceTabOnRestore(kind, resourceId)) {
    return false;
  }

  switch (kind) {
    case 'request':
    case 'folder':
    case 'websocket':
      return collectionResourceExists(ctx.collections.nodes(), resourceId, kind);
    case 'history':
      return historyResourceExists(ctx.history.nodes(), resourceId);
    case 'environment':
      return environmentResourceExists(ctx.environments.environments(), resourceId);
    case 'design-system':
      return findDesignSystemSection(resourceId) !== null;
    case 'dev-tool':
      return findDevelopmentTool(resourceId) !== null;
    case 'test-suite': {
      const parsed = parseTestSuiteTabResourceId(resourceId);
      if (!parsed) {
        return false;
      }
      return parsed.kind === 'flow'
        ? ctx.testSuite.findFlow(parsed.id) !== null
        : ctx.testSuite.findFolder(parsed.id) !== null;
    }
    case 'load-test':
      return resourceId.startsWith('lt:') && ctx.loadTest.findArtifact(resourceId.slice(3)) !== null;
    case 'regression':
      return resourceId.startsWith('rg:') && ctx.regression.findArtifact(resourceId.slice(3)) !== null;
    case 'mock-server':
      if (resourceId === MOCK_SERVER_HUB_TAB_ID) {
        return false;
      }
      if (resourceId.startsWith('ms-mismatch:')) {
        return ctx.mockServer.findMismatch(resourceId.slice('ms-mismatch:'.length)) !== null;
      }
      return resourceId.startsWith('ms:') && ctx.mockServer.findEndpoint(resourceId.slice(3)) !== null;
    case 'capture':
      return resourceId.startsWith('cap:') && ctx.capture.find(resourceId.slice(4)) !== null;
    case 'interceptor-rule':
      return (
        resourceId.startsWith('int-rule:') &&
        ctx.interceptor.findRule(resourceId.slice('int-rule:'.length)) !== null
      );
    default:
      return false;
  }
}
