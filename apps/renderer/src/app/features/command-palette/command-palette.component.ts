import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  DEFAULT_SERVICES,
  DEFAULT_TOOLS,
  requestConfigOf,
  websocketConfigOf,
  type CollectionNode,
  type CollectionTree,
  type HistoryEntry,
  type ToolItem,
} from '@testrix/contracts';
import {
  DEFAULT_RAIL_ITEMS,
  TxHintComponent,
  TxOverlayComponent,
  TxOverlayHostDirective,
  type TxRailItemId,
} from '@testrix/ui';

import { DesktopApiService } from '../../core/desktop-api.service';
import { PalettePinsStore } from '../../core/palette-pins.store';
import { ShellStateService } from '../../core/shell-state.service';
import { CookieAuthDialogService } from '../cookie-auth/cookie-auth-dialog.service';
import { DatabaseQueryActionsService } from '../database/database-query-actions.service';
import {
  SETTINGS_NAV,
  SETTINGS_SEARCH_INDEX,
  type SettingsCategory,
} from '../settings/settings-registry';
import { CollectionsStore } from '../collections/collections.store';
import { CollectionHealthService } from '../collections/collection-health.service';
import { HistoryStore } from '../history/history.store';
import { ServicesStore } from '../services/services.store';
import { ToolsStore } from '../tools/tools.store';
import { WorkbenchStore } from '../workbench/workbench.store';
import { ExportWorkspaceDialogService } from '../workspace-transfer/export-workspace-dialog.service';
import { ImportWorkspaceDialogService } from '../workspace-transfer/import-workspace-dialog.service';
import {
  buildPaletteHomeRows,
  rankPaletteCommands,
  type PaletteHomeRow,
  type PaletteHomeSectionId,
  type PaletteSearchable,
} from './command-palette-search';
import { CollabStore } from '../collab/collab.store';
import { WorkspacesStore } from '../workspaces/workspaces.store';
import { UpdateStore } from '../updates/update.store';
import { HelpContextService } from '../help/help-context.service';
import { detectNetworkFriction } from '../workbench/request/network-friction';

interface PaletteCommand extends PaletteSearchable {
  readonly shortcut?: string;
  readonly homeSection?: PaletteHomeSectionId;
  readonly run: () => void;
}

const RAIL_HINTS: Record<TxRailItemId, string> = {
  collections: 'Requests, folders, and the collection tree',
  services: 'Flows, load, regression, mock, and emulator',
  database: 'Connections and saved queries',
  environments: 'Variables and secrets for requests',
  tools: 'UUID, Base64, JWT, Cron, Regex, PlantUML, and more',
  history: 'Search, group, and reopen sent requests',
};

@Component({
  selector: 'tx-command-palette',
  standalone: true,
  imports: [TxOverlayComponent, TxHintComponent],
  templateUrl: './command-palette.component.html',
  styleUrl: './command-palette.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [TxOverlayHostDirective],
})
export class CommandPaletteComponent {
  readonly shell = inject(ShellStateService);
  private readonly desktop = inject(DesktopApiService);
  private readonly workbench = inject(WorkbenchStore);
  private readonly queryActions = inject(DatabaseQueryActionsService);
  private readonly cookieAuth = inject(CookieAuthDialogService);
  private readonly tools = inject(ToolsStore);
  private readonly services = inject(ServicesStore);
  private readonly exportWorkspace = inject(ExportWorkspaceDialogService);
  private readonly importWorkspace = inject(ImportWorkspaceDialogService);
  private readonly collections = inject(CollectionsStore);
  private readonly collectionHealth = inject(CollectionHealthService);
  private readonly history = inject(HistoryStore);
  private readonly helpContext = inject(HelpContextService);
  private readonly collab = inject(CollabStore);
  private readonly workspaces = inject(WorkspacesStore);
  private readonly updates = inject(UpdateStore);
  private readonly palettePins = inject(PalettePinsStore);

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  readonly query = signal('');
  readonly activeIndex = signal(0);
  readonly paletteRows = computed((): readonly PaletteHomeRow<PaletteCommand>[] => {
    const query = this.query().trim();
    if (query)
      return this.filtered().map((command) => ({ kind: 'command' as const, command }));
    return buildPaletteHomeRows(this.decoratedCommands());
  });

  /** Drives list crossfade when home rows swap for search results (and vice versa). */
  readonly listPaneKey = computed(() => (this.query().trim() ? 'search' : 'home'));

  readonly activeCommands = computed(() =>
    this.paletteRows()
      .filter((row): row is PaletteHomeRow<PaletteCommand> & { kind: 'command' } => row.kind === 'command')
      .map((row) => row.command),
  );

  readonly activeOptionId = computed(() => {
    const items = this.activeCommands();
    if (items.length === 0)
      return null;
    const index = Math.min(this.activeIndex(), items.length - 1);
    return `palette-option-${items[index]?.id ?? index}`;
  });

  readonly commands = computed((): readonly PaletteCommand[] => {
    const chords = this.desktop.settings().shortcuts;
    const commands: PaletteCommand[] = [];

    const collectionById = new Map(
      collectRequestNodes(this.collections.tree()).map((node) => [node.id, node] as const),
    );
    for (const pin of this.palettePins.pins()) {
      if (pin.kind === 'flow') {
        const flow = this.services.findFlow(pin.id);
        const missing = !flow;
        commands.push({
          id: `pin-flow-${pin.id}`,
          label: missing ? `${pin.label} (missing)` : pin.label,
          hint: missing ? 'Pinned flow no longer exists' : 'Pinned flow',
          keywords: `pin pinned favorite flow ${pin.label}`,
          homeSection: 'pinned',
          run: () => {
            if (missing) {
              void this.palettePins.unpin('flow', pin.id);
              return;
            }
            this.services.openArtifact('flows', pin.id, flow.name);
            this.shell.closeOverlays();
          },
        });
        continue;
      }
      const node = collectionById.get(pin.id);
      const missing = !node || node.kind !== pin.kind;
      commands.push({
        id: `pin-${pin.kind}-${pin.id}`,
        label: missing ? `${pin.label} (missing)` : pin.label,
        hint: missing ? 'Pinned request no longer exists' : `Pinned ${pin.kind}`,
        keywords: `pin pinned favorite ${pin.kind} ${pin.label}`,
        homeSection: 'pinned',
        run: () => {
          if (missing) {
            void this.palettePins.unpin(pin.kind, pin.id);
            return;
          }
          this.workbench.openFromNode(node);
          this.shell.closeOverlays();
        },
      });
    }

    const focused = this.workbench.focusedGroup();
    const tab = focused?.tabs.find((item) => item.id === focused.activeTabId);
    const friction = frictionFromFocusedRequest(this.workbench, tab);
    if (friction === 'certificates') {
      commands.push({
        id: 'open-certificates-settings',
        label: 'Open Certificates settings',
        hint: 'TLS trust, extra CA, and client certificates',
        keywords: 'tls ssl certificate cert error verify',
        run: () => {
          this.shell.openSettings('certificates');
          this.shell.closeOverlays();
        },
      });
    }
    if (friction === 'proxy') {
      commands.push({
        id: 'open-proxy-settings',
        label: 'Open Proxy settings',
        hint: 'HTTP / SOCKS proxy, bypass list, and auth',
        keywords: 'proxy socks tunnel connection refused',
        run: () => {
          this.shell.openSettings('proxy');
          this.shell.closeOverlays();
        },
      });
    }
    if (tab?.kind === 'database-query') {
      commands.push({
        id: 'run-database-query',
        label: 'Run database query',
        hint: 'Execute at caret, or choose all when several exist',
        keywords: 'sql execute query ctrl enter',
        shortcut: 'Ctrl Enter',
        run: () => {
          this.queryActions.run();
          this.shell.closeOverlays();
        },
      });
    }

    commands.push(
      {
        id: 'help',
        label: 'Open help',
        hint: 'Features, shortcuts, and tips',
        keywords: 'docs guide tips f1',
        shortcut: 'F1',
        run: () => {
          this.shell.closeOverlays();
          this.helpContext.openContextualHelp();
        },
      },
      {
        id: 'collab',
        label: 'Open Collab',
        hint: 'Titlebar Collab dock',
        keywords: 'share sync git team repository presence toolbar titlebar',
        run: () => {
          this.shell.closeOverlays();
          this.collab.openDock();
        },
      },
      {
        id: 'collab-connect',
        label: 'Connect a repository',
        hint: 'Add a Git remote for Collab',
        keywords: 'collab git connect repository token ssh',
        run: () => {
          this.shell.closeOverlays();
          this.collab.openConnect();
        },
      },
      {
        id: 'collab-sync',
        label: 'Sync now',
        hint: 'Send and receive Collab changes',
        keywords: 'collab git sync pull push',
        run: () => {
          this.shell.closeOverlays();
          void this.collab.syncNow();
        },
      },
      {
        id: 'collab-publish',
        label: 'Publish this workspace',
        hint: 'Move the open workspace into a repository',
        keywords: 'collab publish share workspace',
        run: () => {
          this.shell.closeOverlays();
          const active = this.workspaces.active();
          if (this.collab.hasRepos())
            this.collab.chooseWorkspaces();
          else
            this.collab.openConnect(active?.id ?? null);
        },
      },
      {
        id: 'settings',
        label: 'Open settings',
        hint: 'Preferences window',
        keywords: 'preferences config',
        shortcut: chords.settings,
        run: () => this.shell.openSettings(),
      },
      {
        id: 'workspaces',
        label: 'Manage workspaces',
        hint: 'Create, switch, rename, or remove workspaces',
        keywords: 'workspace switcher manager',
        run: () => this.shell.openWorkspaceManager(),
      },
      {
        id: 'cookie-auth-jar',
        label: 'Cookie & auth jar',
        hint: 'Browse cookies.json and collection auth',
        keywords: 'cookies session secrets bearer oauth',
        run: () => {
          this.shell.closeOverlays();
          this.cookieAuth.show();
        },
      },
      {
        id: 'export-workspace',
        label: 'Export workspace',
        hint: 'Pack categories into a .testrix archive',
        keywords: 'backup pack transfer export',
        run: () => {
          this.shell.closeOverlays();
          this.exportWorkspace.show();
        },
      },
      {
        id: 'import-workspace',
        label: 'Import workspace',
        hint: 'Import a .testrix pack, Postman, Bruno, or OpenAPI',
        keywords: 'merge replace postman bruno openapi transfer',
        run: () => void this.pickImport(),
      },
      {
        id: 'sidebar',
        label: 'Toggle sidebar',
        hint: 'Show or hide the tree',
        keywords: 'panel rail tree',
        shortcut: chords.sidebar,
        run: () => {
          this.shell.toggleSidebar();
          this.shell.closeOverlays();
        },
      },
      {
        id: 'zoom-reset',
        label: 'Reset zoom',
        hint: 'Scale chrome, text, and columns back to 100%',
        keywords: 'zoom scale 100 percent',
        shortcut: 'Ctrl 0',
        run: () => {
          this.desktop.setUiZoom(1, true);
          this.shell.closeOverlays();
        },
      },
      {
        id: 'reload',
        label: 'Reload window',
        hint: 'Restart the renderer',
        keywords: 'refresh restart',
        run: () => void this.desktop.api.app.reload(),
      },
    );

    for (const rail of DEFAULT_RAIL_ITEMS) {
      commands.push({
        id: `rail-${rail.id}`,
        label: `Open ${rail.label}`,
        hint: RAIL_HINTS[rail.id],
        keywords: `${rail.id} sidebar rail navigate`,
        run: () => {
          this.shell.openRail(rail.id);
          this.shell.closeOverlays();
        },
      });
    }

    for (const tool of DEFAULT_TOOLS) {
      commands.push({
        id: `tool-${tool.id}`,
        label: `Open ${tool.label}`,
        hint: `Tools · ${tool.description}`,
        keywords: `tool utility ${tool.id} ${tool.label}`,
        run: () => this.openTool(tool),
      });
    }

    for (const service of DEFAULT_SERVICES) {
      commands.push({
        id: `service-${service.id}`,
        label: `Open ${service.label}`,
        hint: `Services · ${service.description}`,
        keywords: `service ${service.id} ${service.group}`,
        run: () => {
          this.shell.openRail('services');
          this.services.drillIn(service.id);
          this.shell.closeOverlays();
        },
      });
    }

    for (const nav of SETTINGS_NAV) {
      commands.push({
        id: `settings-nav-${nav.id}`,
        label: `${nav.label} settings`,
        hint: `Settings → ${nav.label}`,
        keywords: `settings preferences ${nav.group} ${nav.id}`,
        run: () => this.shell.openSettings(nav.id),
      });
    }

    for (const hit of SETTINGS_SEARCH_INDEX) {
      if (hit.id === 'export-workspace' || hit.id === 'import-workspace')
        continue;
      commands.push({
        id: `settings-hit-${hit.id}`,
        label: hit.label,
        hint: `Settings → ${categoryLabel(hit.category)}`,
        keywords: hit.keywords,
        run: () => this.shell.openSettings(hit.category, hit.id),
      });
    }

    for (const node of collectRequestNodes(this.collections.tree())) {
      const method = node.kind === 'http' ? node.method : 'WS';
      const url = node.kind === 'http' ? requestConfigOf(node).url : websocketConfigOf(node).url;
      commands.push({
        id: `open-request-${node.id}`,
        label: node.name,
        hint: url || 'Collection request',
        keywords: `${method} ${url} ${node.kind} collection request websocket http open`,
        run: () => {
          this.workbench.openFromNode(node);
          this.shell.closeOverlays();
        },
      });
    }

    const availableVersion = this.updates.availableVersion();
    if (availableVersion) {
      commands.push({
        id: 'download-install-update',
        label: 'Download & Install update',
        hint: `Download Testrix ${availableVersion} and install it`,
        keywords: 'update upgrade download install new version restart relaunch',
        run: () => {
          this.shell.closeOverlays();
          void this.updates.downloadAndInstall();
        },
      });
    }
    const readyVersion = this.updates.readyVersion();
    if (readyVersion) {
      commands.push({
        id: 'install-update',
        label: 'Install update',
        hint: `Install Testrix ${readyVersion} and open it`,
        keywords: 'update upgrade install new version restart relaunch',
        run: () => {
          this.shell.closeOverlays();
          void this.updates.install();
        },
      });
    }
    commands.push({
      id: 'check-for-updates',
      label: 'Check for updates',
      hint: 'Settings, Updates',
      keywords: 'update upgrade version stable beta channel',
      run: () => {
        this.shell.openSettings('updates');
        void this.updates.check();
      },
    });

    const healthIssues = this.collectionHealth.issues();
    if (healthIssues.length > 0) {
      const countLabel = healthIssues.length === 1 ? '1 issue' : `${healthIssues.length} issues`;
      commands.push({
        id: 'collection-health',
        label: 'Show collection issues',
        hint: `${countLabel} in the active environment`,
        keywords: 'health broken request missing variable url validate collection',
        run: () => {
          this.collectionHealth.show();
          this.shell.closeOverlays();
        },
      });
    }

    commands.push({
      id: 'window-new',
      label: 'New window',
      hint: 'Open another workbench on this workspace',
      keywords: 'window multi monitor dual screen new',
      shortcut: 'Ctrl Shift N',
      run: () => {
        void this.desktop.api.window.openWorkbench();
        this.shell.closeOverlays();
      },
    });

    for (const group of this.workbench.groups()) {
      for (const tab of group.tabs) {
        commands.push({
          id: `jump-tab-${tab.id}`,
          label: tab.title,
          hint: tab.url || tab.kind,
          keywords: `tab open jump ${tab.kind} ${tab.method ?? ''} ${tab.url}`,
          run: () => {
            this.workbench.activate(group.id, tab.id);
            this.shell.closeOverlays();
          },
        });
      }
    }

    for (const entry of recentFailedHistory(this.history.entries(), 8)) {
      commands.push({
        id: `history-failed-${entry.id}`,
        label: `${entry.method} ${entry.requestName || entry.url}`,
        hint: entry.error?.trim() || `HTTP ${entry.status}`,
        keywords: `history failed error ${entry.method} ${entry.url}`,
        run: () => {
          this.workbench.openFromHistory(entry);
          this.shell.closeOverlays();
        },
      });
    }

    commands.push(
      {
        id: 'tabs-close-inactive',
        label: 'Close inactive tabs',
        hint: 'Keep only the active tab in each editor group',
        keywords: 'tabs close inactive hygiene',
        run: () => {
          this.workbench.closeInactiveTabs();
          this.shell.closeOverlays();
        },
      },
      {
        id: 'tabs-close-others',
        label: 'Close all but current tab',
        hint: 'Close other tabs in the focused editor group',
        keywords: 'tabs close current others hygiene',
        run: () => {
          this.workbench.closeAllButCurrent();
          this.shell.closeOverlays();
        },
      },
    );

    return commands;
  });

  readonly decoratedCommands = computed(() => {
    const focused = this.workbench.focusedGroup();
    const focusedTabIds = new Set(focused?.tabs.map((item) => item.id) ?? []);
    return this.commands().map((command) => ({
      ...command,
      homeSection: command.homeSection ?? paletteHomeSectionFor(command.id, focusedTabIds),
    }));
  });

  readonly filtered = computed(() => rankPaletteCommands(this.decoratedCommands(), this.query()));

  constructor() {
    afterNextRender(() => this.focusSearch());
  }

  handleInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);
    this.activeIndex.set(0);
  }

  handleSearchKeydown(event: KeyboardEvent): void {
    const items = this.activeCommands();
    if (items.length === 0)
      return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeIndex.update((index) => Math.min(index + 1, items.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeIndex.update((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      this.runActive();
    }
  }

  isActive(index: number): boolean {
    const max = Math.max(0, this.activeCommands().length - 1);
    return Math.min(this.activeIndex(), max) === index;
  }

  commandRowIndex(row: PaletteHomeRow<PaletteCommand>): number {
    let index = -1;
    for (const entry of this.paletteRows()) {
      if (entry.kind === 'command')
        index += 1;
      if (entry === row)
        return index;
    }
    return -1;
  }

  runActive(): void {
    const items = this.activeCommands();
    if (items.length === 0)
      return;
    const index = Math.min(this.activeIndex(), items.length - 1);
    items[index]?.run();
  }

  private openTool(tool: ToolItem): void {
    this.shell.openRail('tools');
    if (tool.id === 'plantuml') {
      this.tools.drillIn(tool.id);
      this.shell.closeOverlays();
      return;
    }
    this.workbench.openFromTool(tool);
    this.shell.closeOverlays();
  }

  private async pickImport(): Promise<void> {
    this.shell.closeOverlays();
    const path = await this.desktop.api.workspace.pickImportSource();
    if (!path)
      return;
    const inspected = await this.desktop.api.workspace.importInspect(path);
    this.importWorkspace.show(inspected);
  }

  private focusSearch(): void {
    const input = this.searchInput()?.nativeElement;
    if (!input)
      return;
    input.focus();
    input.select();
  }
}

function categoryLabel(id: SettingsCategory): string {
  return SETTINGS_NAV.find((item) => item.id === id)?.label ?? id;
}

function collectRequestNodes(tree: CollectionTree): readonly CollectionNode[] {
  const out: CollectionNode[] = [];
  const walk = (nodes: CollectionTree): void => {
    for (const node of nodes) {
      if (node.kind === 'http' || node.kind === 'websocket')
        out.push(node);
      if (node.kind === 'folder')
        walk(node.children);
    }
  };
  walk(tree);
  return out;
}

function paletteHomeSectionFor(
  id: string,
  focusedTabIds: ReadonlySet<string>,
): PaletteHomeSectionId {
  if (id.startsWith('pin-'))
    return 'pinned';
  if (
    id === 'run-database-query' ||
    id === 'tabs-close-inactive' ||
    id === 'tabs-close-others' ||
    id === 'open-certificates-settings' ||
    id === 'open-proxy-settings'
  ) {
    return 'this-tab';
  }
  if (id.startsWith('jump-tab-')) {
    const tabId = id.slice('jump-tab-'.length);
    return focusedTabIds.has(tabId) ? 'this-tab' : 'go-to';
  }
  if (
    id === 'settings' ||
    id.startsWith('settings-nav-') ||
    id.startsWith('settings-hit-') ||
    id === 'zoom-reset' ||
    id === 'reload' ||
    id === 'cookie-auth-jar'
  ) {
    return 'preferences';
  }
  if (
    id === 'help' ||
    id === 'collab' ||
    id === 'sidebar' ||
    id.startsWith('rail-') ||
    id.startsWith('tool-') ||
    id.startsWith('service-') ||
    id.startsWith('open-request-')
  ) {
    return 'go-to';
  }
  return 'workspace';
}

function frictionFromFocusedRequest(
  workbench: WorkbenchStore,
  tab: { readonly kind: string; readonly nodeId: string } | undefined,
): ReturnType<typeof detectNetworkFriction> {
  if (tab?.kind !== 'http')
    return null;
  const runs = workbench.runsFor(tab.nodeId);
  for (const run of runs.slice(0, 4)) {
    const fromError = detectNetworkFriction(run.error);
    if (fromError)
      return fromError;
    const fromBody = detectNetworkFriction(run.responseBody);
    if (fromBody)
      return fromBody;
    const fromStatus = detectNetworkFriction(run.statusText);
    if (fromStatus)
      return fromStatus;
  }
  return null;
}

function recentFailedHistory(entries: readonly HistoryEntry[], limit: number): readonly HistoryEntry[] {
  const failed: HistoryEntry[] = [];
  for (const entry of entries) {
    if (failed.length >= limit)
      break;
    if (entry.error?.trim() || entry.status >= 400 || entry.status <= 0)
      failed.push(entry);
  }
  return failed;
}
