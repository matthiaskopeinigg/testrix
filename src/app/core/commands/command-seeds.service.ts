import { Injectable, effect, inject, untracked } from '@angular/core';

import type { EnvironmentDefinition } from '@shared/config';
import type { WorkspaceTabKind } from '@shared/config/workspace-editor.schema';
import {
  mockServerTabResourceId,
  testSuiteTabResourceId,
} from '@shared/testing';

import { CollectionsService } from '@app/core/collections/collections.service';
import { TeamsPanelService } from '@app/core/collaboration/teams-panel.service';
import { DEVELOPMENT_TOOLS } from '@app/core/development-tools/development-tool.registry';
import { EnvironmentsService } from '@app/core/environments/environments.service';
import { HistoryService } from '@app/core/history/history.service';
import { CaptureWorkbenchStore } from '@app/core/testing/capture-workbench.store';
import { InterceptorWorkspaceStore } from '@app/core/testing/interceptor-workspace.store';
import { LoadTestService } from '@app/core/testing/load-test.service';
import { MockServerService } from '@app/core/testing/mock-server.service';
import { RegressionService } from '@app/core/testing/regression.service';
import { TestSuiteService } from '@app/core/testing/test-suite.service';
import { CommandPaletteService } from '@app/core/ui/command-palette.service';
import { HelpPopupService } from '@app/core/ui/help-popup.service';
import { SettingsPopupService } from '@app/core/ui/settings-popup.service';
import {
  WorkspaceSidebarSessionService,
  type WorkspaceSidebarPanelId,
} from '@app/core/workspace/workspace-sidebar-session.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import type { CollectionTreeKind, CollectionTreeNode } from '@app/features/shell/collections/collection-tree.types';
import { isCaptureSessionNode } from '@app/features/shell/testing/capture-sidebar-panel/capture-tree.mutations';
import type { CaptureTreeNode } from '@app/features/shell/testing/capture-sidebar-panel/capture-tree.types';
import { isInterceptorRuleNode } from '@app/features/shell/testing/interceptor-sidebar-panel/interceptor-tree.mutations';
import type { InterceptorTreeNode } from '@app/features/shell/testing/interceptor-sidebar-panel/interceptor-tree.types';
import { isLoadTestArtifactNode } from '@app/features/shell/testing/load-test-sidebar-panel/load-test-tree.mutations';
import type { LoadTestTreeNode } from '@app/features/shell/testing/load-test-sidebar-panel/load-test-tree.types';
import { isMockServerEndpointNode } from '@app/features/shell/testing/mock-server-sidebar-panel/mock-server-tree.mutations';
import type { MockServerTreeNode } from '@app/features/shell/testing/mock-server-sidebar-panel/mock-server-tree.types';
import { isRegressionArtifactNode } from '@app/features/shell/testing/regression-sidebar-panel/regression-tree.mutations';
import type { RegressionTreeNode } from '@app/features/shell/testing/regression-sidebar-panel/regression-tree.types';
import type { TestSuiteTreeKind, TestSuiteTreeNode } from '@app/features/shell/testing/test-suite-sidebar-panel/test-suite-tree.types';
import type { HistoryTreeNode } from '@app/features/shell/history/history-tree.types';
import type { TxTreeNode } from '@app/shared/components/tx-tree/tx-tree.types';

import { type Command, CommandRegistryService } from './command-registry.service';
import {
  capturePaletteHint,
  collectionPaletteHint,
  environmentPaletteHint,
  historyPaletteHint,
  interceptorPaletteHint,
  loadTestPaletteHint,
  mockServerPaletteHint,
  regressionPaletteHint,
  testSuitePaletteHint,
} from './command-palette-hints';

/**
 * Seeds the command palette with static shell actions and dynamic workspace
 * quick-open entries synced from domain services.
 */
@Injectable({ providedIn: 'root' })
export class CommandSeedsService {
  private readonly registry = inject(CommandRegistryService);
  private readonly workspaceEditor = inject(WorkspaceEditorService);
  private readonly collections = inject(CollectionsService);
  private readonly environments = inject(EnvironmentsService);
  private readonly history = inject(HistoryService);
  private readonly testSuite = inject(TestSuiteService);
  private readonly loadTest = inject(LoadTestService);
  private readonly regression = inject(RegressionService);
  private readonly mockServer = inject(MockServerService);
  private readonly capture = inject(CaptureWorkbenchStore);
  private readonly interceptor = inject(InterceptorWorkspaceStore);
  private readonly sidebarSession = inject(WorkspaceSidebarSessionService);
  private readonly settingsPopup = inject(SettingsPopupService);
  private readonly helpPopup = inject(HelpPopupService);
  private readonly teamsPanel = inject(TeamsPanelService);
  private readonly commandPalette = inject(CommandPaletteService);

  private registered = false;

  constructor() {
    this.registerDynamicSyncEffects();
  }

  /** Idempotent; safe to call on every boot path. */
  register(): void {
    if (this.registered) {
      return;
    }
    this.registered = true;

    this.registerStaticCommands();
  }

  private registerStaticCommands(): void {
    this.registry.registerAll([
      {
        id: 'shell.openSettings',
        label: 'Open Settings',
        category: 'Shell',
        hint: 'Application preferences and profile options',
        shortcut: 'Ctrl+,',
        run: () => this.settingsPopup.show(),
      },
      {
        id: 'shell.openHelp',
        label: 'Open Help',
        category: 'Help',
        hint: 'Feature guide and reference',
        run: () => this.helpPopup.show(),
      },
      {
        id: 'shell.openTeams',
        label: 'Open Teams',
        category: 'Shell',
        hint: 'Collaboration and sync',
        shortcut: 'Ctrl+Shift+T',
        run: () => this.teamsPanel.show(),
      },
      {
        id: 'shell.toggleCommandPalette',
        label: 'Toggle command palette',
        category: 'Shell',
        hint: 'Search commands and quick-open workspace items',
        shortcut: 'Ctrl+K',
        run: () => this.commandPalette.toggle(),
      },
      {
        id: 'workspace.newRootFolder',
        label: 'New collection folder',
        category: 'Workspace',
        hint: 'Create a folder at the collections root',
        run: () => {
          this.collections.createFolder(null, 'New folder');
          this.openSidebarPanel('collections');
        },
      },
      ...(['collections', 'environments', 'testing', 'development', 'history'] as const).map(
        (panelId) => ({
          id: `sidebar.${panelId}`,
          label: `Open ${sidebarPanelLabel(panelId)} sidebar`,
          category: 'Sidebar',
          hint: `Show ${sidebarPanelLabel(panelId)} in the workspace panel`,
          keywords: [panelId, sidebarPanelLabel(panelId)],
          run: () => this.openSidebarPanel(panelId),
        }),
      ),
      ...DEVELOPMENT_TOOLS.map((tool) => ({
        id: `devTool.open.${tool.id}`,
        label: tool.label,
        category: 'Development',
        hint: tool.description,
        keywords: [tool.id, tool.label],
        run: () => this.workspaceEditor.openResource({ resourceId: tool.id, kind: 'dev-tool' }),
      })),
    ]);
  }

  private registerDynamicSyncEffects(): void {
    effect(() => {
      const nodes = this.collections.nodes();
      untracked(() => this.syncCollectionCommands(nodes));
    });

    effect(() => {
      const environments = this.environments.environments();
      untracked(() => this.syncEnvironmentCommands(environments));
    });

    effect(() => {
      const nodes = this.history.nodes();
      untracked(() => this.syncHistoryCommands(nodes));
    });

    effect(() => {
      const nodes = this.testSuite.nodes();
      untracked(() => this.syncTestSuiteCommands(nodes));
    });

    effect(() => {
      const nodes = this.loadTest.nodes();
      untracked(() => this.syncLoadTestCommands(nodes));
    });

    effect(() => {
      const nodes = this.regression.nodes();
      untracked(() => this.syncRegressionCommands(nodes));
    });

    effect(() => {
      const nodes = this.mockServer.nodes();
      untracked(() => this.syncMockServerCommands(nodes));
    });

    effect(() => {
      const nodes = this.capture.nodes();
      untracked(() => this.syncCaptureCommands(nodes));
    });

    effect(() => {
      const nodes = this.interceptor.nodes();
      untracked(() => this.syncInterceptorCommands(nodes));
    });
  }

  private syncCollectionCommands(nodes: readonly CollectionTreeNode[]): void {
    this.registry.unregisterPrefix('collection.open.');
    const commands: Command[] = [];

    walkCollectionNodes(nodes, '', (node, path) => {
      const kind = node.data?.kind;
      if (!kind) {
        return;
      }

      const tabKind = collectionTabKind(kind);
      if (!tabKind) {
        return;
      }

      const keywords = buildCollectionKeywords(node, path);
      commands.push({
        id: `collection.open.${node.id}`,
        label: node.label,
        category: node.favourite ? 'Starred' : collectionCategory(kind),
        hint: collectionPaletteHint(node, path),
        keywords,
        weight: node.favourite ? 10 : 0,
        run: () => this.workspaceEditor.openResource({ resourceId: node.id, kind: tabKind }),
      });
    });

    if (commands.length > 0) {
      this.registry.registerAll(commands);
    }
  }

  private syncEnvironmentCommands(environments: readonly EnvironmentDefinition[]): void {
    this.registry.unregisterPrefix('environment.open.');
    if (environments.length === 0) {
      return;
    }

    this.registry.registerAll(
      environments.map((environment) => ({
        id: `environment.open.${environment.id}`,
        label: environment.name,
        category: 'Environments',
        hint: environmentPaletteHint(environment),
        keywords: [environment.name, environment.description ?? ''].filter(Boolean),
        run: () =>
          this.workspaceEditor.openResource({ resourceId: environment.id, kind: 'environment' }),
      })),
    );
  }

  private syncHistoryCommands(nodes: readonly HistoryTreeNode[]): void {
    this.registry.unregisterPrefix('history.open.');
    const commands: Command[] = [];

    walkTxTree(nodes, '', () => true, (node, path) => {
      const method = node.data?.method ?? node.httpMethod ?? '';
      const url = node.data?.url ?? node.subtitle ?? '';
      commands.push({
        id: `history.open.${node.id}`,
        label: node.label,
        category: 'History',
        hint: historyPaletteHint(node),
        run: () => this.workspaceEditor.openResource({ resourceId: node.id, kind: 'history' }),
      });
    });

    if (commands.length > 0) {
      this.registry.registerAll(commands);
    }
  }

  private syncTestSuiteCommands(nodes: readonly TestSuiteTreeNode[]): void {
    this.registry.unregisterPrefix('testSuite.open.');
    const commands: Command[] = [];

    walkTxTree(
      nodes,
      '',
      (node) => {
        const kind = (node.data?.kind ?? node.kind) as TestSuiteTreeKind | undefined;
        return kind === 'flow' || kind === 'folder';
      },
      (node, path) => {
        const kind = (node.data?.kind ?? node.kind) as TestSuiteTreeKind;
        commands.push({
          id: `testSuite.open.${node.id}`,
          label: node.label,
          category: kind === 'folder' ? 'Test folders' : 'Test flows',
          hint: testSuitePaletteHint(node, path, kind),
          run: () =>
            this.workspaceEditor.openResource({
              resourceId: testSuiteTabResourceId(kind, node.id),
              kind: 'test-suite',
            }),
        });
      },
    );

    if (commands.length > 0) {
      this.registry.registerAll(commands);
    }
  }

  private syncLoadTestCommands(nodes: readonly LoadTestTreeNode[]): void {
    this.syncTreeArtifactCommands({
      prefix: 'loadTest.open.',
      nodes,
      category: 'Load tests',
      tabKind: 'load-test',
      shouldIndex: (node) => isLoadTestArtifactNode(node as LoadTestTreeNode),
      resourceId: (id) => this.loadTest.tabResourceId(id),
      buildHint: (node, path) => loadTestPaletteHint(node as LoadTestTreeNode, path),
    });
  }

  private syncRegressionCommands(nodes: readonly RegressionTreeNode[]): void {
    this.syncTreeArtifactCommands({
      prefix: 'regression.open.',
      nodes,
      category: 'Regression',
      tabKind: 'regression',
      shouldIndex: (node) => isRegressionArtifactNode(node as RegressionTreeNode),
      resourceId: (id) => this.regression.tabResourceId(id),
      buildHint: (node, path) => regressionPaletteHint(node as RegressionTreeNode, path),
    });
  }

  private syncMockServerCommands(nodes: readonly MockServerTreeNode[]): void {
    this.syncTreeArtifactCommands({
      prefix: 'mockServer.open.',
      nodes,
      category: 'Mock server',
      tabKind: 'mock-server',
      shouldIndex: (node) => isMockServerEndpointNode(node as MockServerTreeNode),
      resourceId: (id) => mockServerTabResourceId(id),
      buildHint: (node, path) => mockServerPaletteHint(node as MockServerTreeNode, path),
    });
  }

  private syncCaptureCommands(nodes: readonly CaptureTreeNode[]): void {
    this.syncTreeArtifactCommands({
      prefix: 'capture.open.',
      nodes,
      category: 'Capture',
      tabKind: 'capture',
      shouldIndex: (node) => isCaptureSessionNode(node as CaptureTreeNode),
      resourceId: (id) => this.capture.tabResourceId(id),
      buildHint: (node, path) => capturePaletteHint(node as CaptureTreeNode, path),
    });
  }

  private syncInterceptorCommands(nodes: readonly InterceptorTreeNode[]): void {
    this.syncTreeArtifactCommands({
      prefix: 'interceptor.open.',
      nodes,
      category: 'Interceptor',
      tabKind: 'interceptor-rule',
      shouldIndex: (node) => isInterceptorRuleNode(node as InterceptorTreeNode),
      resourceId: (id) => this.interceptor.tabResourceId(id),
      buildHint: (node, path) => interceptorPaletteHint(node as InterceptorTreeNode, path),
    });
  }

  private syncTreeArtifactCommands<TMeta>(options: {
    readonly prefix: string;
    readonly nodes: readonly TxTreeNode<TMeta>[];
    readonly category: string;
    readonly tabKind: WorkspaceTabKind;
    readonly shouldIndex: (node: TxTreeNode<TMeta>) => boolean;
    readonly resourceId: (id: string) => string;
    readonly buildHint?: (node: TxTreeNode<TMeta>, path: string) => string;
  }): void {
    this.registry.unregisterPrefix(options.prefix);
    const commands: Command[] = [];

    walkTxTree(options.nodes, '', options.shouldIndex, (node, path) => {
      commands.push({
        id: `${options.prefix}${node.id}`,
        label: node.label,
        category: options.category,
        hint: options.buildHint?.(node, path) ?? path,
        run: () =>
          this.workspaceEditor.openResource({
            resourceId: options.resourceId(node.id),
            kind: options.tabKind,
          }),
      });
    });

    if (commands.length > 0) {
      this.registry.registerAll(commands);
    }
  }

  private openSidebarPanel(panelId: WorkspaceSidebarPanelId): void {
    this.sidebarSession.setActiveSidebarPanelId(panelId);
    this.sidebarSession.setSidebarPanelOpen(true);
  }
}

function sidebarPanelLabel(panelId: WorkspaceSidebarPanelId): string {
  switch (panelId) {
    case 'collections':
      return 'Collections';
    case 'environments':
      return 'Environments';
    case 'testing':
      return 'Testing';
    case 'development':
      return 'Development';
    case 'history':
      return 'History';
    default:
      return panelId;
  }
}

function collectionTabKind(kind: CollectionTreeKind): WorkspaceTabKind | null {
  switch (kind) {
    case 'folder':
      return 'folder';
    case 'request':
      return 'request';
    case 'websocket':
      return 'websocket';
    default:
      return null;
  }
}

function collectionCategory(kind: CollectionTreeKind): string {
  switch (kind) {
    case 'folder':
      return 'Folders';
    case 'request':
      return 'Requests';
    case 'websocket':
      return 'WebSockets';
    default:
      return 'Collections';
  }
}

function buildCollectionKeywords(node: CollectionTreeNode, path: string): string[] {
  const keywords = [path];
  if (node.data?.url) {
    keywords.push(node.data.url);
  }
  if (node.data?.method) {
    keywords.push(node.data.method);
  }
  if (node.data?.wsPath) {
    keywords.push(node.data.wsPath);
  }
  return keywords.filter(Boolean);
}

function walkCollectionNodes(
  nodes: readonly CollectionTreeNode[],
  parentPath: string,
  onNode: (node: CollectionTreeNode, path: string) => void,
): void {
  for (const node of nodes) {
    const path = parentPath ? `${parentPath} / ${node.label}` : node.label;
    onNode(node, path);
    if (node.children?.length) {
      walkCollectionNodes(node.children, path, onNode);
    }
  }
}

function walkTxTree<TMeta>(
  nodes: readonly TxTreeNode<TMeta>[],
  parentPath: string,
  shouldIndex: (node: TxTreeNode<TMeta>) => boolean,
  onNode: (node: TxTreeNode<TMeta>, path: string) => void,
): void {
  for (const node of nodes) {
    const path = parentPath ? `${parentPath} / ${node.label}` : node.label;
    if (shouldIndex(node)) {
      onNode(node, path);
    }
    if (node.children?.length) {
      walkTxTree(node.children, path, shouldIndex, onNode);
    }
  }
}
