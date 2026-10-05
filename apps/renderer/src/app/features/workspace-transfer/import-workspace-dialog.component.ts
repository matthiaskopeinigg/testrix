import type { AnimationCallbackEvent } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import {
  WORKSPACE_PACK_CATEGORY_KEYS,
  type ImportFormat,
  type PackCategory,
  type WorkspaceImportMode,
  type WorkspacePackSelection,
} from '@testrix/contracts';
import {
  TxButtonComponent,
  TxCheckComponent,
  TxHintComponent,
  TxInputComponent,
  TxOverlayComponent,
  TxOverlayHostDirective,
} from '@testrix/ui';

import { runPaneEnter, runPaneLeave, type PaneSlideDir } from '../../core/pane-slide-anim';
import { DesktopApiService } from '../../core/desktop-api.service';
import { SessionPersistenceService } from '../../core/session-persistence.service';
import { ShellStateService } from '../../core/shell-state.service';
import { WorkspacesStore } from '../workspaces/workspaces.store';
import {
  PackSelectionTreeComponent,
  collectionNodesToPackTree,
  collectAllCollectionTreeIds,
  collectAllServiceTreeIds,
  serviceNodesToPackTree,
} from './pack-selection-tree.component';
import {
  ImportWorkspaceDialogService,
  type ImportWizardStep,
} from './import-workspace-dialog.service';
import { PACK_CATEGORY_OPTIONS } from './workspace-pack-labels';

const FORMAT_LABELS: Record<ImportFormat, string> = {
  native: 'Native Testrix pack (.testrix)',
  'postman-collection': 'Postman collection',
  'postman-environment': 'Postman environment',
  bruno: 'Bruno collection',
  openapi: 'OpenAPI',
  unsupported: 'Unsupported format',
};

import { summarizeImportWarnings } from './import-workspace-warnings';

@Component({
  selector: 'tx-import-workspace-dialog',
  standalone: true,
  imports: [
    TxOverlayComponent,
    TxButtonComponent,
    TxCheckComponent,
    TxHintComponent,
    TxInputComponent,
    PackSelectionTreeComponent,
  ],
  templateUrl: './import-workspace-dialog.component.html',
  styleUrl: './import-workspace-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [TxOverlayHostDirective],
  host: {
    '[class.is-success-pulse]': 'successPulse()',
  },
})
export class ImportWorkspaceDialogComponent {
  private readonly dialog = inject(ImportWorkspaceDialogService);
  private readonly workspaces = inject(WorkspacesStore);
  private readonly session = inject(SessionPersistenceService);
  private readonly shell = inject(ShellStateService);
  readonly desktop = inject(DesktopApiService);

  readonly titleId = 'tx-import-workspace-title';
  readonly categoryOptions = PACK_CATEGORY_OPTIONS;
  readonly applying = signal(false);
  readonly successPulse = signal(false);
  readonly mode = signal<WorkspaceImportMode>('merge');
  readonly modeStepVisible = signal(false);
  readonly workspaceName = signal('');
  readonly paneSlideDir = signal<PaneSlideDir>(null);
  readonly warningsExpanded = signal(false);

  readonly enabledCategories = signal<ReadonlySet<PackCategory>>(new Set());
  readonly collectionIds = signal<ReadonlySet<string>>(new Set());
  readonly flowIds = signal<ReadonlySet<string>>(new Set());
  readonly mockIds = signal<ReadonlySet<string>>(new Set());
  readonly collectionExpanded = signal<ReadonlySet<string>>(new Set());
  readonly flowExpanded = signal<ReadonlySet<string>>(new Set());
  readonly mockExpanded = signal<ReadonlySet<string>>(new Set());

  readonly inspect = computed(() => this.dialog.inspect());
  readonly step = computed(() => this.dialog.step());

  readonly previewCategories = computed(() => {
    const preview = this.inspect()?.selectionPreview?.categories ?? [];
    return preview.filter((entry): entry is PackCategory =>
      WORKSPACE_PACK_CATEGORY_KEYS.includes(entry as PackCategory),
    );
  });

  readonly importCollectionTree = computed(() => {
    const preview = this.inspect()?.selectionPreview;
    if (!preview)
      return [];
    const tree = preview.collections ?? preview.generatedCollections ?? [];
    return collectionNodesToPackTree(tree);
  });

  readonly importFlowTree = computed(() => {
    const items = this.inspect()?.selectionPreview?.flows ?? [];
    return serviceNodesToPackTree(items);
  });

  readonly importMockTree = computed(() => {
    const items = this.inspect()?.selectionPreview?.mocks ?? [];
    return serviceNodesToPackTree(items);
  });

  readonly formatLabel = computed(() => {
    const format = this.inspect()?.format ?? 'unsupported';
    return FORMAT_LABELS[format];
  });

  readonly isUnsupported = computed(() => (this.inspect()?.format ?? 'unsupported') === 'unsupported');

  readonly warningGroups = computed(() => summarizeImportWarnings(this.inspect()?.warnings ?? []));

  readonly warningDetailCount = computed(() =>
    this.warningGroups().reduce((total, group) => total + group.details.length, 0),
  );

  readonly canApply = computed(() => {
    const inspected = this.inspect();
    if (!inspected || inspected.format === 'unsupported')
      return false;
    if (this.enabledCategories().size === 0)
      return false;
    return true;
  });

  constructor() {
    effect(() => {
      const inspected = this.dialog.inspect();
      if (!inspected)
        return;
      const remembered = this.desktop.settings().lastImportMode;
      this.mode.set(remembered);
      this.modeStepVisible.set(false);
      this.workspaceName.set(inspected.sourceName?.trim() ?? '');
      this.warningsExpanded.set(false);
      this.applyPreviewSelection(inspected);
    });
  }

  rememberedModeLabel(): string {
    switch (this.mode()) {
      case 'replace':
        return 'Replace matching categories';
      case 'new':
        return 'Create new workspace';
      default:
        return 'Merge into active workspace';
    }
  }

  showModeStep(): void {
    this.modeStepVisible.set(true);
    this.goToStep('mode');
  }

  close(): void {
    if (this.applying())
      return;
    this.dialog.hide();
  }

  formatSummary(): string {
    return this.formatLabel();
  }

  isChecksumOk(): boolean | null {
    const inspected = this.inspect();
    if (!inspected || inspected.format !== 'native')
      return null;
    return inspected.checksumOk ?? false;
  }

  sourcePath(): string {
    return this.inspect()?.path ?? '';
  }

  sourceFileName(): string {
    const path = this.sourcePath().replace(/\\/g, '/');
    const base = path.split('/').pop()?.trim();
    return base || path || 'Unknown file';
  }

  sourceDir(): string | null {
    const raw = this.sourcePath().replace(/\\/g, '/');
    if (!raw.includes('/'))
      return null;
    const dir = raw.slice(0, raw.lastIndexOf('/'));
    return dir || null;
  }

  isCategoryEnabled(id: PackCategory): boolean {
    return this.enabledCategories().has(id);
  }

  isCategoryAvailable(id: PackCategory): boolean {
    return this.previewCategories().includes(id);
  }

  toggleCategory(id: PackCategory, checked: boolean): void {
    if (!this.isCategoryAvailable(id))
      return;
    const next = new Set(this.enabledCategories());
    if (checked) {
      next.add(id);
      if (id === 'collections') {
        const tree = this.inspect()?.selectionPreview?.collections ?? this.inspect()?.selectionPreview?.generatedCollections ?? [];
        this.collectionIds.set(new Set(collectAllCollectionTreeIds(tree)));
      }
      if (id === 'flows') {
        const items = this.inspect()?.selectionPreview?.flows ?? [];
        this.flowIds.set(new Set(collectAllServiceTreeIds(items)));
      }
      if (id === 'mocks') {
        const items = this.inspect()?.selectionPreview?.mocks ?? [];
        this.mockIds.set(new Set(collectAllServiceTreeIds(items)));
      }
    } else {
      next.delete(id);
    }
    this.enabledCategories.set(next);
  }

  setMode(next: WorkspaceImportMode): void {
    this.mode.set(next);
    if (next === 'new' && !this.workspaceName().trim()) {
      const name = this.inspect()?.sourceName?.trim();
      if (name)
        this.workspaceName.set(name);
    }
  }

  goToStep(next: ImportWizardStep): void {
    const order: ImportWizardStep[] = ['format', 'mode', 'selection'];
    const from = order.indexOf(this.step());
    const to = order.indexOf(next);
    this.paneSlideDir.set(to > from ? 'right' : 'left');
    this.dialog.setStep(next);
  }

  nextFromFormat(): void {
    if (this.isUnsupported())
      return;
    if (this.modeStepVisible() || this.mode() === 'new')
      this.goToStep('mode');
    else
      this.goToStep('selection');
  }

  backToFormat(): void {
    this.goToStep('format');
  }

  nextFromMode(): void {
    this.goToStep('selection');
  }

  backToMode(): void {
    this.goToStep('mode');
  }

  visibleCategoryOptions() {
    return this.categoryOptions.filter((option) => this.isCategoryAvailable(option.id));
  }

  showCollectionsTree(): boolean {
    return this.isCategoryEnabled('collections') && this.importCollectionTree().length > 0;
  }

  showFlowsTree(): boolean {
    return this.isCategoryEnabled('flows') && this.importFlowTree().length > 0;
  }

  showMocksTree(): boolean {
    return this.isCategoryEnabled('mocks') && this.importMockTree().length > 0;
  }

  paneEnter(event: AnimationCallbackEvent): void {
    runPaneEnter(event, this.paneSlideDir());
  }

  paneLeave(event: AnimationCallbackEvent): void {
    runPaneLeave(event, this.paneSlideDir());
  }

  async applyImport(): Promise<void> {
    const inspected = this.inspect();
    if (!inspected || !this.desktop.hasDesktop || !this.canApply())
      return;
    this.applying.set(true);
    try {
      const snapshot = await this.desktop.api.workspace.importApply({
        path: inspected.path,
        mode: this.mode(),
        selection: this.buildSelection(),
        workspaceName: this.mode() === 'new' ? this.workspaceName().trim() || undefined : undefined,
      });
      this.workspaces.acceptSnapshot(snapshot);
      this.shell.playScene();
      this.session.applyActiveWorkspace();
      if (this.mode() === 'merge' || this.mode() === 'replace') {
        const remembered = this.mode();
        if (remembered === 'merge' || remembered === 'replace')
          void this.desktop.patchSettings({ lastImportMode: remembered });
      }
      this.successPulse.set(true);
      window.setTimeout(() => this.successPulse.set(false), 700);
      this.dialog.hide();
    } finally {
      this.applying.set(false);
    }
  }

  private applyPreviewSelection(inspected: NonNullable<ReturnType<ImportWorkspaceDialogComponent['inspect']>>): void {
    const categories = (inspected.selectionPreview?.categories ?? []).filter(
      (entry): entry is PackCategory => WORKSPACE_PACK_CATEGORY_KEYS.includes(entry as PackCategory),
    );
    this.enabledCategories.set(new Set(categories));
    const collections =
      inspected.selectionPreview?.collections ?? inspected.selectionPreview?.generatedCollections ?? [];
    this.collectionIds.set(new Set(collectAllCollectionTreeIds(collections)));
    this.flowIds.set(new Set(collectAllServiceTreeIds(inspected.selectionPreview?.flows ?? [])));
    this.mockIds.set(new Set(collectAllServiceTreeIds(inspected.selectionPreview?.mocks ?? [])));
    this.collectionExpanded.set(new Set());
    this.flowExpanded.set(new Set());
    this.mockExpanded.set(new Set());
  }

  private buildSelection(): WorkspacePackSelection {
    const categories = [...this.enabledCategories()];
    const selection: WorkspacePackSelection = { categories };
    if (categories.includes('collections') && this.collectionIds().size > 0)
      selection.collectionIds = [...this.collectionIds()];
    if (categories.includes('flows') && this.flowIds().size > 0)
      selection.flowIds = [...this.flowIds()];
    if (categories.includes('mocks') && this.mockIds().size > 0)
      selection.mockIds = [...this.mockIds()];
    return selection;
  }
}
