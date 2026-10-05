import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import {
  WORKSPACE_PACK_EXPORT_CATEGORY_KEYS,
  analyzePackExportSecrets,
  formatPackSecretGroup,
  workspaceDisplayName,
  type PackCategory,
  type PackExportCategory,
  type WorkspacePackSelection,
} from '@testrix/contracts';
import {
  TxButtonComponent,
  TxCheckComponent,
  TxHintComponent,
  TxOverlayComponent,
  TxOverlayHostDirective,
} from '@testrix/ui';

import { DesktopApiService } from '../../core/desktop-api.service';
import { WorkspacesStore } from '../workspaces/workspaces.store';
import { PackCategoryIconComponent } from './pack-category-icon.component';
import {
  PackSelectionTreeComponent,
  type PackTreeNode,
  collectAllCollectionTreeIds,
  collectAllDatabaseTreeIds,
  collectAllEnvironmentIds,
  collectAllFlowTemplateIds,
  collectAllQueryTreeIds,
  collectAllServiceTreeIds,
  collectionNodesToPackTree,
  databaseNodesToPackTree,
  environmentsToPackTree,
  queryNodesToPackTree,
  serviceNodesToPackTree,
  templatesToPackTree,
} from './pack-selection-tree.component';
import { ExportWorkspaceDialogService } from './export-workspace-dialog.service';
import { SecretAuditComponent } from './secret-audit.component';
import { PACK_CATEGORY_LABELS, PACK_EXPORT_CATEGORY_OPTIONS } from './workspace-pack-labels';

interface ExportTreeSection {
  readonly category: PackExportCategory;
  readonly label: string;
  readonly nodes: readonly PackTreeNode[];
}

@Component({
  selector: 'tx-export-workspace-dialog',
  standalone: true,
  imports: [
    TxOverlayComponent,
    TxButtonComponent,
    TxCheckComponent,
    TxHintComponent,
    PackCategoryIconComponent,
    PackSelectionTreeComponent,
    SecretAuditComponent,
  ],
  templateUrl: './export-workspace-dialog.component.html',
  styleUrl: './export-workspace-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [TxOverlayHostDirective],
  host: {
    '[class.is-success-pulse]': 'successPulse()',
  },
})
export class ExportWorkspaceDialogComponent {
  private readonly dialog = inject(ExportWorkspaceDialogService);
  private readonly workspaces = inject(WorkspacesStore);
  readonly desktop = inject(DesktopApiService);

  readonly titleId = 'tx-export-workspace-title';
  readonly categoryOptions = PACK_EXPORT_CATEGORY_OPTIONS;
  readonly exporting = signal(false);
  readonly successPulse = signal(false);
  readonly omitSecrets = signal(true);
  readonly secretsExpanded = signal(false);

  readonly enabledCategories = signal<ReadonlySet<PackCategory>>(
    new Set(WORKSPACE_PACK_EXPORT_CATEGORY_KEYS),
  );
  readonly collectionIds = signal<ReadonlySet<string>>(new Set());
  readonly flowIds = signal<ReadonlySet<string>>(new Set());
  readonly mockIds = signal<ReadonlySet<string>>(new Set());
  readonly environmentIds = signal<ReadonlySet<string>>(new Set());
  readonly databaseIds = signal<ReadonlySet<string>>(new Set());
  readonly queryIds = signal<ReadonlySet<string>>(new Set());
  readonly loadIds = signal<ReadonlySet<string>>(new Set());
  readonly interceptIds = signal<ReadonlySet<string>>(new Set());
  readonly regressionIds = signal<ReadonlySet<string>>(new Set());
  readonly flowTemplateIds = signal<ReadonlySet<string>>(new Set());
  readonly collectionExpanded = signal<ReadonlySet<string>>(new Set());
  readonly flowExpanded = signal<ReadonlySet<string>>(new Set());
  readonly mockExpanded = signal<ReadonlySet<string>>(new Set());
  readonly environmentExpanded = signal<ReadonlySet<string>>(new Set());
  readonly databaseExpanded = signal<ReadonlySet<string>>(new Set());
  readonly queryExpanded = signal<ReadonlySet<string>>(new Set());
  readonly loadExpanded = signal<ReadonlySet<string>>(new Set());
  readonly interceptExpanded = signal<ReadonlySet<string>>(new Set());
  readonly regressionExpanded = signal<ReadonlySet<string>>(new Set());
  readonly flowTemplateExpanded = signal<ReadonlySet<string>>(new Set());

  readonly collectionTree = computed(() =>
    collectionNodesToPackTree(this.desktop.collections().collections ?? []),
  );
  readonly flowTree = computed(() => serviceNodesToPackTree(this.desktop.flows().items ?? []));
  readonly mockTree = computed(() => serviceNodesToPackTree(this.desktop.mocks().items ?? []));
  readonly environmentTree = computed(() =>
    environmentsToPackTree(this.desktop.environments().items ?? []),
  );
  readonly databaseTree = computed(() => databaseNodesToPackTree(this.desktop.databases().nodes ?? []));
  readonly queryTree = computed(() => queryNodesToPackTree(this.desktop.queries().nodes ?? []));
  readonly loadTree = computed(() => serviceNodesToPackTree(this.desktop.load().items ?? []));
  readonly interceptTree = computed(() => serviceNodesToPackTree(this.desktop.intercept().items ?? []));
  readonly regressionTree = computed(() =>
    serviceNodesToPackTree(this.desktop.regressions().items ?? []),
  );
  readonly flowTemplateTree = computed(() =>
    templatesToPackTree(this.desktop.flowTemplates().templates ?? []),
  );

  readonly exportTreeSections = computed((): ExportTreeSection[] => {
    const enabled = this.enabledCategories();
    const sections: ExportTreeSection[] = [];
    const push = (category: PackExportCategory, nodes: readonly PackTreeNode[]) => {
      if (!enabled.has(category) || nodes.length === 0)
        return;
      sections.push({ category, label: PACK_CATEGORY_LABELS[category], nodes });
    };
    push('collections', this.collectionTree());
    push('flows', this.flowTree());
    push('mocks', this.mockTree());
    push('environments', this.environmentTree());
    push('database', this.databaseTree());
    push('queries', this.queryTree());
    push('load', this.loadTree());
    push('intercept', this.interceptTree());
    push('regressions', this.regressionTree());
    push('flow-templates', this.flowTemplateTree());
    return sections;
  });

  readonly workspaceName = computed(() => {
    const active = this.workspaces.active();
    return active ? workspaceDisplayName(active) : 'Workspace';
  });
  readonly secretReport = computed(() =>
    analyzePackExportSecrets({
      selection: this.buildSelectionBase(),
      environments: this.desktop.environments(),
      collections: this.desktop.collections(),
      cookies: this.desktop.cookies(),
      databases: this.desktop.databases(),
    }),
  );
  readonly secretLines = computed(() => this.secretReport().groups.map(formatPackSecretGroup));
  readonly selectionSummary = computed(() => {
    const count = this.enabledCategories().size;
    const total = this.categoryOptions.length;
    const secrets = this.secretReport().total;
    if (count === 0)
      return 'Select at least one category.';
    const base =
      count === total ? `All ${total} categories` : `${count} of ${total} categories`;
    if (secrets === 0)
      return `${base} · no secrets detected`;
    if (this.omitSecrets())
      return `${base} · ${secrets} secrets will be omitted`;
    return `${base} · ${secrets} secrets included`;
  });

  constructor() {
    effect(() => {
      if (!this.dialog.open())
        return;
      this.enabledCategories.set(new Set(WORKSPACE_PACK_EXPORT_CATEGORY_KEYS));
      this.omitSecrets.set(true);
      this.secretsExpanded.set(false);
      this.selectAllDeepTrees();
    });
  }

  close(): void {
    if (this.exporting())
      return;
    this.dialog.hide();
  }

  isCategoryEnabled(id: PackCategory): boolean {
    return this.enabledCategories().has(id);
  }

  showItemSelection(): boolean {
    return this.exportTreeSections().length > 0;
  }

  selectedIdsFor(category: PackExportCategory): ReadonlySet<string> {
    return this.selectedIdsSignal(category)();
  }

  expandedIdsFor(category: PackExportCategory): ReadonlySet<string> {
    return this.expandedIdsSignal(category)();
  }

  setSelectedIds(category: PackExportCategory, ids: ReadonlySet<string>): void {
    this.selectedIdsSignal(category).set(ids);
  }

  setExpandedIds(category: PackExportCategory, ids: ReadonlySet<string>): void {
    this.expandedIdsSignal(category).set(ids);
  }

  selectAllCategories(): void {
    this.enabledCategories.set(new Set(WORKSPACE_PACK_EXPORT_CATEGORY_KEYS));
    this.selectAllDeepTrees();
  }

  clearCategories(): void {
    this.enabledCategories.set(new Set());
  }

  toggleCategory(id: PackCategory, checked: boolean): void {
    const next = new Set(this.enabledCategories());
    if (checked) {
      next.add(id);
      this.selectAllForCategory(id);
    } else {
      next.delete(id);
    }
    this.enabledCategories.set(next);
  }

  buildSelection(): WorkspacePackSelection {
    const selection = this.buildSelectionBase();
    if (this.secretReport().total === 0)
      return selection;
    return { ...selection, omitSecrets: this.omitSecrets() };
  }

  async confirmExport(): Promise<void> {
    if (this.exporting() || !this.desktop.hasDesktop)
      return;
    if (this.enabledCategories().size === 0)
      return;
    this.exporting.set(true);
    try {
      const result = await this.desktop.api.workspace.exportPack(this.buildSelection());
      if (result.canceled)
        return;
      this.successPulse.set(true);
      this.dialog.notifyExportSuccess();
      window.setTimeout(() => {
        this.successPulse.set(false);
        this.dialog.hide();
      }, durationMs(520));
    } finally {
      this.exporting.set(false);
    }
  }

  private buildSelectionBase(): WorkspacePackSelection {
    const categories = [...this.enabledCategories()];
    const selection: WorkspacePackSelection = { categories };
    const put = (
      key:
        | 'collectionIds'
        | 'flowIds'
        | 'mockIds'
        | 'environmentIds'
        | 'databaseIds'
        | 'queryIds'
        | 'loadIds'
        | 'interceptIds'
        | 'regressionIds'
        | 'flowTemplateIds',
      ids: ReadonlySet<string>,
    ): void => {
      if (ids.size === 0)
        return;
      selection[key] = [...ids];
    };
    if (categories.includes('collections'))
      put('collectionIds', this.collectionIds());
    if (categories.includes('flows'))
      put('flowIds', this.flowIds());
    if (categories.includes('mocks'))
      put('mockIds', this.mockIds());
    if (categories.includes('environments'))
      put('environmentIds', this.environmentIds());
    if (categories.includes('database'))
      put('databaseIds', this.databaseIds());
    if (categories.includes('queries'))
      put('queryIds', this.queryIds());
    if (categories.includes('load'))
      put('loadIds', this.loadIds());
    if (categories.includes('intercept'))
      put('interceptIds', this.interceptIds());
    if (categories.includes('regressions'))
      put('regressionIds', this.regressionIds());
    if (categories.includes('flow-templates'))
      put('flowTemplateIds', this.flowTemplateIds());
    return selection;
  }

  private selectAllDeepTrees(): void {
    this.collectionIds.set(new Set(collectAllCollectionTreeIds(this.desktop.collections().collections ?? [])));
    this.flowIds.set(new Set(collectAllServiceTreeIds(this.desktop.flows().items ?? [])));
    this.mockIds.set(new Set(collectAllServiceTreeIds(this.desktop.mocks().items ?? [])));
    this.environmentIds.set(new Set(collectAllEnvironmentIds(this.desktop.environments().items ?? [])));
    this.databaseIds.set(new Set(collectAllDatabaseTreeIds(this.desktop.databases().nodes ?? [])));
    this.queryIds.set(new Set(collectAllQueryTreeIds(this.desktop.queries().nodes ?? [])));
    this.loadIds.set(new Set(collectAllServiceTreeIds(this.desktop.load().items ?? [])));
    this.interceptIds.set(new Set(collectAllServiceTreeIds(this.desktop.intercept().items ?? [])));
    this.regressionIds.set(new Set(collectAllServiceTreeIds(this.desktop.regressions().items ?? [])));
    this.flowTemplateIds.set(
      new Set(collectAllFlowTemplateIds(this.desktop.flowTemplates().templates ?? [])),
    );
  }

  private selectAllForCategory(id: PackCategory): void {
    switch (id) {
      case 'collections':
        this.collectionIds.set(
          new Set(collectAllCollectionTreeIds(this.desktop.collections().collections ?? [])),
        );
        break;
      case 'flows':
        this.flowIds.set(new Set(collectAllServiceTreeIds(this.desktop.flows().items ?? [])));
        break;
      case 'mocks':
        this.mockIds.set(new Set(collectAllServiceTreeIds(this.desktop.mocks().items ?? [])));
        break;
      case 'environments':
        this.environmentIds.set(
          new Set(collectAllEnvironmentIds(this.desktop.environments().items ?? [])),
        );
        break;
      case 'database':
        this.databaseIds.set(new Set(collectAllDatabaseTreeIds(this.desktop.databases().nodes ?? [])));
        break;
      case 'queries':
        this.queryIds.set(new Set(collectAllQueryTreeIds(this.desktop.queries().nodes ?? [])));
        break;
      case 'load':
        this.loadIds.set(new Set(collectAllServiceTreeIds(this.desktop.load().items ?? [])));
        break;
      case 'intercept':
        this.interceptIds.set(new Set(collectAllServiceTreeIds(this.desktop.intercept().items ?? [])));
        break;
      case 'regressions':
        this.regressionIds.set(
          new Set(collectAllServiceTreeIds(this.desktop.regressions().items ?? [])),
        );
        break;
      case 'flow-templates':
        this.flowTemplateIds.set(
          new Set(collectAllFlowTemplateIds(this.desktop.flowTemplates().templates ?? [])),
        );
        break;
      default:
        break;
    }
  }

  private selectedIdsSignal(
    category: PackExportCategory,
  ): ReturnType<typeof signal<ReadonlySet<string>>> {
    switch (category) {
      case 'collections':
        return this.collectionIds;
      case 'flows':
        return this.flowIds;
      case 'mocks':
        return this.mockIds;
      case 'environments':
        return this.environmentIds;
      case 'database':
        return this.databaseIds;
      case 'queries':
        return this.queryIds;
      case 'load':
        return this.loadIds;
      case 'intercept':
        return this.interceptIds;
      case 'regressions':
        return this.regressionIds;
      case 'flow-templates':
        return this.flowTemplateIds;
    }
  }

  private expandedIdsSignal(
    category: PackExportCategory,
  ): ReturnType<typeof signal<ReadonlySet<string>>> {
    switch (category) {
      case 'collections':
        return this.collectionExpanded;
      case 'flows':
        return this.flowExpanded;
      case 'mocks':
        return this.mockExpanded;
      case 'environments':
        return this.environmentExpanded;
      case 'database':
        return this.databaseExpanded;
      case 'queries':
        return this.queryExpanded;
      case 'load':
        return this.loadExpanded;
      case 'intercept':
        return this.interceptExpanded;
      case 'regressions':
        return this.regressionExpanded;
      case 'flow-templates':
        return this.flowTemplateExpanded;
    }
  }
}

function durationMs(base: number): number {
  if (typeof document === 'undefined')
    return base;
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--tx-motion-scale').trim();
  const scale = Number.parseFloat(raw);
  if (!Number.isFinite(scale) || scale <= 0)
    return 0;
  return Math.max(0, Math.round(base * scale));
}
