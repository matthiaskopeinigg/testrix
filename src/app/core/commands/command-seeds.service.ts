import { Injectable, effect, inject, untracked } from '@angular/core';

import { type EnvironmentDefinition } from '@shared/config';
import type { WorkspaceTabKind } from '@shared/config/workspace-editor.schema';
import { databaseConnectionTabResourceId } from '@shared/database';
import type { LookupDefinition } from '@shared/testing';
import {
  lookupTabResourceId,
  mockServerTabResourceId,
  testSuiteTabResourceId,
} from '@shared/testing';

import { CollectionsService } from '@app/core/collections/collections.service';
import { DatabaseConnectionsService } from '@app/core/database/database-connections.service';
import { DatabaseQueriesService } from '@app/core/database/database-queries.service';
import { TxNotificationService } from '@app/core/notifications/tx-notification.service';
import {
  generateGatlingSimulation,
  generateK6Script,
  generateLoadTestHtmlReport,
} from '@shared/testing';
import { looksLikeCurl } from '@shared/http/parse-curl';
import { FileDialogService } from '@app/core/platform/file-dialog.service';
import { TeamsPanelService } from '@app/core/collaboration/teams-panel.service';
import { DEVELOPMENT_TOOLS } from '@app/core/development-tools/development-tool.registry';
import { EnvironmentsService } from '@app/core/environments/environments.service';
import { HistoryService } from '@app/core/history/history.service';
import { CaptureWorkbenchStore } from '@app/core/testing/capture-workbench.store';
import { InterceptorWorkspaceStore } from '@app/core/testing/interceptor-workspace.store';
import { LookupService } from '@app/core/testing/lookup.service';
import { LoadTestService } from '@app/core/testing/load-test.service';
import { MockServerService } from '@app/core/testing/mock-server.service';
import { RegressionService } from '@app/core/testing/regression.service';
import { TestSuiteService } from '@app/core/testing/test-suite.service';
import { TestingSessionService } from '@app/core/testing/testing-session.service';
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
import type { TxTreeNode } from '@app/shared/components/data/tx-tree/tx-tree.types';

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
  private readonly databaseQueries = inject(DatabaseQueriesService);
  private readonly databaseConnections = inject(DatabaseConnectionsService);
  private readonly notifications = inject(TxNotificationService);
  private readonly environments = inject(EnvironmentsService);
  private readonly history = inject(HistoryService);
  private readonly testSuite = inject(TestSuiteService);
  private readonly loadTest = inject(LoadTestService);
  private readonly regression = inject(RegressionService);
  private readonly mockServer = inject(MockServerService);
  private readonly capture = inject(CaptureWorkbenchStore);
  private readonly interceptor = inject(InterceptorWorkspaceStore);
  private readonly lookups = inject(LookupService);
  private readonly sidebarSession = inject(WorkspaceSidebarSessionService);
  private readonly settingsPopup = inject(SettingsPopupService);
  private readonly helpPopup = inject(HelpPopupService);
  private readonly teamsPanel = inject(TeamsPanelService);
  private readonly commandPalette = inject(CommandPaletteService);
  private readonly files = inject(FileDialogService);
  private readonly testingSession = inject(TestingSessionService);

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
      {
        id: 'workspace.importCurl',
        label: 'Import cURL from clipboard',
        category: 'Workspace',
        hint: 'Parse a curl command and open it as a collection request',
        keywords: ['curl', 'paste', 'import'],
        run: () => void this.importCurlFromClipboard(),
      },
      {
        id: 'workspace.closeActiveTab',
        label: 'Close active tab',
        category: 'Workspace',
        hint: 'Close the tab in the focused pane',
        shortcut: 'Ctrl+X',
        keywords: ['close', 'tab'],
        run: () => this.workspaceEditor.closeActiveTab(),
      },
      {
        id: 'workspace.splitTabRight',
        label: 'Split tab to the right',
        category: 'Workspace',
        hint: 'Open the current tab in a new pane on the right',
        shortcut: 'Ctrl+Right',
        keywords: ['split', 'pane', 'right'],
        run: () => this.workspaceEditor.splitFocusedPane('right'),
      },
      {
        id: 'workspace.splitTabLeft',
        label: 'Split tab to the left',
        category: 'Workspace',
        hint: 'Open the current tab in a new pane on the left',
        shortcut: 'Ctrl+Left',
        keywords: ['split', 'pane', 'left'],
        run: () => this.workspaceEditor.splitFocusedPane('left'),
      },
      {
        id: 'workspace.splitTabUp',
        label: 'Split tab up',
        category: 'Workspace',
        hint: 'Open the current tab in a new pane above',
        shortcut: 'Ctrl+Up',
        keywords: ['split', 'pane', 'up'],
        run: () => this.workspaceEditor.splitFocusedPane('top'),
      },
      {
        id: 'workspace.splitTabDown',
        label: 'Split tab down',
        category: 'Workspace',
        hint: 'Open the current tab in a new pane below',
        shortcut: 'Ctrl+Down',
        keywords: ['split', 'pane', 'down'],
        run: () => this.workspaceEditor.splitFocusedPane('bottom'),
      },
      {
        id: 'database.newQuery',
        label: 'New database query',
        category: 'Database',
        hint: 'Create a saved query in the Database sidebar',
        keywords: ['sql', 'redis', 'query', 'database'],
        run: () => {
          const created = this.databaseQueries.createQuery();
          this.openSidebarPanel('data');
          this.workspaceEditor.openResource({
            resourceId: this.databaseQueries.tabResourceId(created.id),
            kind: 'database',
          });
        },
      },
      {
        id: 'database.newFolder',
        label: 'New query folder',
        category: 'Database',
        hint: 'Create a folder for saved queries',
        keywords: ['database', 'folder', 'query'],
        run: () => {
          this.databaseQueries.createFolder();
          this.openSidebarPanel('data');
        },
      },
      {
        id: 'database.newConnection',
        label: 'New database connection',
        category: 'Database',
        hint: 'Add a connection from the Database sidebar',
        keywords: ['sql', 'redis', 'postgresql', 'mysql', 'mariadb', 'oracle', 'mongodb', 'clickhouse', 'cockroachdb', 'sqlite', 'database'],
        run: () => void this.createDatabaseConnection(),
      },
      {
        id: 'database.newConnectionFolder',
        label: 'New connection folder',
        category: 'Database',
        hint: 'Create a folder for database connections',
        keywords: ['database', 'folder', 'connection'],
        run: () => void this.createDatabaseConnectionFolder(),
      },
      {
        id: 'loadTest.exportHtml',
        label: 'Export load test HTML report',
        category: 'Load tests',
        hint: 'Save a self-contained HTML report for the latest run on the active load test',
        keywords: ['html', 'report', 'export'],
        run: () => void this.exportActiveLoadTest('html'),
      },
      {
        id: 'loadTest.exportK6',
        label: 'Export load test k6 script',
        category: 'Load tests',
        hint: 'Generate a k6 script from the active load test',
        keywords: ['k6', 'export'],
        run: () => void this.exportActiveLoadTest('k6'),
      },
      {
        id: 'loadTest.exportGatling',
        label: 'Export load test Gatling stub',
        category: 'Load tests',
        hint: 'Generate a Gatling Simulation from the active load test',
        keywords: ['gatling', 'export'],
        run: () => void this.exportActiveLoadTest('gatling'),
      },
      {
        id: 'testing.openMonitors',
        label: 'Open Monitors',
        category: 'Testing',
        hint: 'Local cron monitors for request, flow, or load test',
        keywords: ['cron', 'monitor', 'schedule'],
        run: () => {
          this.openSidebarPanel('testing');
          this.testingSession.setSubpanel('monitors');
        },
      },
      {
        id: 'testing.openLookups',
        label: 'Open Lookups',
        category: 'Testing',
        hint: 'Ticket identifiers to database queries and a results card',
        keywords: ['lookup', 'debug', 'ticket', 'email', 'uuid', 'msisdn'],
        run: () => {
          this.openSidebarPanel('testing');
          this.testingSession.setSubpanel('lookups');
        },
      },
      ...(['collections', 'environments', 'testing', 'data', 'development', 'history'] as const).map(
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

    effect(() => {
      const lookups = this.lookups.lookups();
      untracked(() => this.syncLookupCommands(lookups));
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

  private syncLookupCommands(lookups: readonly LookupDefinition[]): void {
    this.registry.unregisterPrefix('lookup.open.');
    this.registry.registerAll(
      lookups.map((lookup) => ({
        id: `lookup.open.${lookup.id}`,
        label: lookup.name,
        category: 'Lookups',
        hint: lookup.description.trim() || 'Ticket identifiers → DB queries → results',
        run: () =>
          this.workspaceEditor.openResource({
            resourceId: lookupTabResourceId(lookup.id),
            kind: 'lookup',
          }),
      })),
    );
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

  private async createDatabaseConnection(): Promise<void> {
    const conn = await this.databaseConnections.createConnection();
    this.openSidebarPanel('data');
    this.workspaceEditor.openResource({
      resourceId: databaseConnectionTabResourceId(conn.id),
      kind: 'database',
    });
  }

  private async createDatabaseConnectionFolder(): Promise<void> {
    await this.databaseConnections.createFolder();
    this.openSidebarPanel('data');
  }

  private async importCurlFromClipboard(): Promise<void> {
    let text = '';
    try {
      text = (await navigator.clipboard.readText()).trim();
    } catch {
      this.notifications.showError('Could not read the clipboard');
      return;
    }
    if (!looksLikeCurl(text)) {
      this.notifications.showError('Clipboard does not contain a cURL command');
      return;
    }
    const id = this.collections.createRequestFromCurl(text);
    if (!id) {
      this.notifications.showError('Could not import the cURL command');
      return;
    }
    this.openSidebarPanel('collections');
    this.workspaceEditor.openResource({ resourceId: id, kind: 'request' });
    this.notifications.showSuccess('Imported cURL as a collection request');
  }

  private async exportActiveLoadTest(kind: 'html' | 'k6' | 'gatling'): Promise<void> {
    const tab = this.workspaceEditor.activeTab();
    if (!tab || tab.kind !== 'load-test' || !tab.resourceId.startsWith('lt:')) {
      this.notifications.showError('Open a load test tab to export');
      return;
    }
    const artifact = this.loadTest.findArtifact(tab.resourceId.slice(3));
    const record = artifact?.runs[0];
    if (!artifact || !record) {
      this.notifications.showError('Run the load test before exporting');
      return;
    }
    const context = { artifact, record };
    if (kind === 'html') {
      const path = await this.files.saveText(
        generateLoadTestHtmlReport(context),
        `load-test-${record.id}.html`,
        [{ name: 'HTML', extensions: ['html'] }],
      );
      if (path) {
        this.notifications.showSuccess('HTML report saved');
      }
      return;
    }
    if (kind === 'k6') {
      const path = await this.files.saveText(generateK6Script(context), `load-test-${artifact.id}.k6.js`, [
        { name: 'JavaScript', extensions: ['js'] },
      ]);
      if (path) {
        this.notifications.showSuccess('k6 script saved');
      }
      return;
    }
    const path = await this.files.saveText(
      generateGatlingSimulation(context),
      `${artifact.name.replace(/[^A-Za-z0-9]+/g, '') || 'Testrix'}Simulation.scala`,
      [{ name: 'Scala', extensions: ['scala'] }],
    );
    if (path) {
      this.notifications.showSuccess('Gatling stub saved');
    }
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
    case 'data':
      return 'Database';
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
