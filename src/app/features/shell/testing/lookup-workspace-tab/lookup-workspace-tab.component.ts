import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  COLLECTION_ENVIRONMENT_NONE,
  buildCollectionEnvironmentDropdownOptions,
  catalogForEnvironment,
  environmentIdFromDropdownValue,
  getEnvironmentDefinition,
  resolveLookupTabUi,
  lookupTabLastRunSchema,
  type LookupTabSectionId,
  type WorkspaceEditorLayoutId,
} from '@shared/config';
import {
  databaseQueryEditorCompletions,
  databaseQueryEditorLanguage,
  databaseQueryEditorLanguageLabel,
  databaseQueryEditorPlaceholder,
} from '@shared/database/database-query-editor';
import type { DynamicVariableCatalogItem } from '@shared/dynamic-variables';
import {
  LOOKUP_EXTRACT_KIND_IDS,
  createLookupExtract,
  createLookupInput,
  createLookupResultField,
  createLookupStep,
  lookupResultTableHeightRem,
  lookupResultViews,
  parseLookupTabResourceId,
  type LookupExtractKind,
  type LookupQuerySource,
  type LookupRenderedResult,
  type LookupResultView,
  type LookupStep,
  type LookupRunResult,
} from '@shared/testing';

import { ConfigService } from '@app/core/config/config.service';
import { resolveTabEditorLayout } from '@app/core/config/workspace-tab-editor-layout';
import { DatabaseQueriesService } from '@app/core/database/database-queries.service';
import { EnvironmentsService } from '@app/core/environments/environments.service';
import { LookupService } from '@app/core/testing/lookup.service';
import { TestingSessionService } from '@app/core/testing/testing-session.service';
import { newTestingId } from '@app/core/testing/testing-id';
import { lookupTabSectionBlockCount } from '@app/core/ui/workspace-tab-section-stagger';
import { WorkspaceTabMotionController } from '@app/core/ui/workspace-tab-motion';
import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';
import { WorkspaceSectionNavSliderDirective } from '../../workspace/workspace-section-nav-slider.directive';
import { TxBannerComponent } from '@app/shared/components/feedback/tx-banner/tx-banner.component';
import { TxButtonComponent } from '@app/shared/components/forms/tx-button/tx-button.component';
import { TxCodeEditorComponent } from '@app/shared/components/editors/tx-code-editor/tx-code-editor.component';
import type { TxCodeEditorCompletionItem } from '@app/shared/components/editors/tx-code-editor/tx-code-editor-completion';
import { TxDataGridComponent } from '@app/shared/components/data/tx-data-grid/tx-data-grid.component';
import { TxDividerComponent } from '@app/shared/components/forms/tx-divider/tx-divider.component';
import { TxDropdownComponent } from '@app/shared/components/forms/tx-dropdown/tx-dropdown.component';
import type { TxDropdownOption } from '@app/shared/components/forms/tx-dropdown/tx-dropdown.types';
import { TxFormFieldComponent } from '@app/shared/components/forms/tx-form-field/tx-form-field.component';
import { TxIconComponent } from '@app/shared/components/forms/tx-icon/tx-icon.component';
import { TxInputComponent } from '@app/shared/components/forms/tx-input/tx-input.component';
import { TxToggleComponent } from '@app/shared/components/forms/tx-toggle/tx-toggle.component';
import { TxTreeSelectComponent } from '@app/shared/components/forms/tx-tree-select/tx-tree-select.component';
import { TxVariableInputComponent } from '@app/shared/components/editors/tx-variable-input/tx-variable-input.component';

import { toConnectionTreeNodes } from '@app/features/shell/database/connection-tree.adapter';
import {
  FLOW_DATABASE_QUERY_SOURCE_OPTIONS,
  savedQueryDropdownOptions,
} from '../test-suite-workspace-tab/flow-database-query-source';

const SESSION_UI_DEBOUNCE_MS = 150;

interface LookupTabNavItem {
  readonly id: LookupTabSectionId;
  readonly label: string;
  readonly icon: string;
}

const NAV_ITEMS: readonly LookupTabNavItem[] = [
  { id: 'run', label: 'Run', icon: 'play' },
  { id: 'edit', label: 'Edit', icon: 'edit' },
];

const EXTRACT_KIND_OPTIONS: readonly TxDropdownOption[] = LOOKUP_EXTRACT_KIND_IDS.map((kind) => ({
  value: kind,
  label: kind === 'jsonpath' ? 'JSONPath' : kind === 'json_pointer' ? 'JSON pointer' : 'Full result',
}));

/**
 * Workspace tab for a lookup playbook: run form plus editor for inputs, steps, and results.
 */
@Component({
  selector: 'app-lookup-workspace-tab',
  standalone: true,
  imports: [
    FormsModule,
    TxBannerComponent,
    TxButtonComponent,
    TxCodeEditorComponent,
    TxDataGridComponent,
    TxDividerComponent,
    TxDropdownComponent,
    TxFormFieldComponent,
    TxIconComponent,
    TxInputComponent,
    TxToggleComponent,
    TxTreeSelectComponent,
    TxVariableInputComponent,
    WorkspaceSectionNavSliderDirective,
  ],
  templateUrl: './lookup-workspace-tab.component.html',
  styleUrl: './lookup-workspace-tab.component.scss',
  host: { class: 'testing-workspace-tab-host' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LookupWorkspaceTabComponent {
  private readonly lookups = inject(LookupService);
  private readonly configService = inject(ConfigService);
  private readonly testingSession = inject(TestingSessionService);
  private readonly environments = inject(EnvironmentsService);
  private readonly queries = inject(DatabaseQueriesService);
  private readonly uiPreferences = inject(UiPreferencesService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly tabMotion = new WorkspaceTabMotionController(
    this.uiPreferences,
    this.destroyRef,
  );

  readonly resourceId = input.required<string>();
  readonly active = input(false);

  protected readonly navItems = NAV_ITEMS;
  protected readonly querySourceOptions = FLOW_DATABASE_QUERY_SOURCE_OPTIONS;
  protected readonly extractKindOptions = EXTRACT_KIND_OPTIONS;
  protected readonly resultTemplatePlaceholder = '{{uuid}}';
  protected readonly skipUnlessRegexPlaceholder = 'Leave empty to always run';

  protected readonly activeSection = signal<LookupTabSectionId>('run');
  protected readonly runEnvironmentId = signal<string | null>(null);
  protected readonly runInputs = signal<Record<string, string>>({});
  protected readonly runResult = signal<LookupRunResult | null>(null);
  protected readonly running = signal(false);
  protected readonly runError = signal<string | null>(null);
  protected readonly copiedKey = signal<string | null>(null);

  private sessionUiLoadKey: string | null = null;
  private sessionUiSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private copiedResetTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly editorLayout = computed((): WorkspaceEditorLayoutId =>
    resolveTabEditorLayout(this.configService.settings(), 'testSuite'),
  );

  protected readonly useSidebarLayout = computed(() => this.editorLayout() === 'sidebar');
  protected readonly useTitlebarLayout = computed(() => this.editorLayout() === 'titlebar');

  protected readonly lookupId = computed(() => parseLookupTabResourceId(this.resourceId()) ?? '');

  protected readonly lookup = computed(() => {
    const id = this.lookupId();
    return id ? this.lookups.find(id) : null;
  });

  protected readonly missing = computed(() => !!this.lookupId() && !this.lookup());

  protected readonly title = computed(() => this.lookups.labelForResource(this.resourceId()));

  protected readonly environmentOptions = computed(() =>
    buildCollectionEnvironmentDropdownOptions(this.environments.environments(), {
      includeInherit: false,
    }).map((option) => ({ value: option.value, label: option.label })),
  );

  protected readonly connectionTreeNodes = computed(() =>
    toConnectionTreeNodes(this.configService.settings()?.databases?.nodes ?? []),
  );

  protected readonly hasConnections = computed(
    () => (this.configService.settings()?.databases?.connections ?? []).length > 0,
  );

  protected readonly savedQueryOptions = computed(() => savedQueryDropdownOptions(this.queries.nodes()));

  protected readonly variableCatalog = computed((): readonly DynamicVariableCatalogItem[] => {
    const lookup = this.lookup();
    if (!lookup) {
      return [];
    }
    const environment = getEnvironmentDefinition(
      this.environments.environments(),
      lookup.environmentId,
    );
    const extras: DynamicVariableCatalogItem[] = [...catalogForEnvironment(environment)];
    for (const field of lookup.inputs) {
      extras.push({
        id: `input:${field.key}`,
        label: `{{${field.key}}}`,
        insert: field.key,
        detail: field.label.trim() || 'Lookup input',
      });
    }
    for (const step of lookup.steps) {
      for (const extract of step.extracts) {
        extras.push({
          id: `extract:${step.id}:${extract.variableName}`,
          label: `{{${extract.variableName}}}`,
          insert: extract.variableName,
          detail: `${step.name} extract`,
        });
      }
    }
    return extras;
  });

  constructor() {
    this.tabMotion.startLoadAfterRender(
      () => this.loadChromeChildCount(),
      () => !this.active(),
    );
    this.tabMotion.bindLoadReplay(
      () => `${this.configService.sessionRevision()}:${this.resourceId()}`,
      () => this.loadChromeChildCount(),
      { tabActive: () => this.active() },
    );

    void this.lookups.hydrate();
    void this.environments.hydrate();
    void this.queries.hydrate();

    effect(() => {
      if (!this.active()) {
        return;
      }
      const resourceId = this.resourceId();
      const revision = this.configService.sessionRevision();
      const lookup = this.lookup();
      const session = untracked(() => this.configService.session());
      if (!lookup || !session) {
        return;
      }
      const loadKey = `${revision}:${resourceId}`;
      if (this.sessionUiLoadKey === loadKey) {
        return;
      }
      this.sessionUiLoadKey = loadKey;
      const ui = resolveLookupTabUi(session.workspace.testing.lookupTabsById, resourceId);
      this.activeSection.set(ui.activeSection);
      this.runEnvironmentId.set(ui.runEnvironmentId ?? lookup.environmentId ?? null);
      const inputs: Record<string, string> = {};
      for (const field of lookup.inputs) {
        inputs[field.key] = ui.runInputs[field.key] ?? '';
      }
      this.runInputs.set(inputs);
      this.runResult.set(ui.lastRun);
      this.runError.set(ui.runError);
    });

    this.destroyRef.onDestroy(() => {
      if (this.sessionUiSaveTimer !== null) {
        clearTimeout(this.sessionUiSaveTimer);
      }
      if (this.copiedResetTimer !== null) {
        clearTimeout(this.copiedResetTimer);
      }
    });
  }

  protected isSectionContentAnimating(sectionId: LookupTabSectionId): boolean {
    return this.tabMotion.isSectionContentAnimating(sectionId);
  }

  protected isSectionContentSettled(sectionId: LookupTabSectionId): boolean {
    return this.tabMotion.isSectionContentSettled(sectionId);
  }

  protected handleSectionSelect(section: LookupTabSectionId): void {
    if (section === this.activeSection()) {
      return;
    }
    this.activeSection.set(section);
    this.tabMotion.onSectionChange(section, {
      contentBlockCount: lookupTabSectionBlockCount(section),
    });
    this.scheduleTabUiPersist();
  }

  protected environmentDropdownValue(environmentId: string | null | undefined): string {
    if (!environmentId?.trim()) {
      return COLLECTION_ENVIRONMENT_NONE;
    }
    return environmentId.trim();
  }

  protected persistEnvironmentId(value: string): string | null {
    const id = environmentIdFromDropdownValue(value);
    return id?.trim() ? id : null;
  }

  protected handleNameChange(name: string): void {
    const lookup = this.lookup();
    if (!lookup) {
      return;
    }
    this.lookups.patchLookup(lookup.id, { name: name.trim() || 'New lookup' });
  }

  protected handleDescriptionChange(description: string): void {
    const lookup = this.lookup();
    if (!lookup) {
      return;
    }
    this.lookups.patchLookup(lookup.id, { description });
  }

  protected handleSavedEnvironmentChange(value: string): void {
    const lookup = this.lookup();
    if (!lookup) {
      return;
    }
    this.lookups.patchLookup(lookup.id, { environmentId: this.persistEnvironmentId(value) });
  }

  protected handleRunEnvironmentChange(value: string): void {
    this.runEnvironmentId.set(this.persistEnvironmentId(value));
    this.scheduleTabUiPersist();
  }

  protected handleRunInputChange(key: string, value: string): void {
    this.runInputs.update((current) => ({ ...current, [key]: value }));
    this.scheduleTabUiPersist();
  }

  protected inputValue(key: string): string {
    return this.runInputs()[key] ?? '';
  }

  protected handleAddInput(): void {
    const lookup = this.lookup();
    if (!lookup) {
      return;
    }
    const key = `field_${lookup.inputs.length + 1}`;
    this.lookups.patchLookup(lookup.id, {
      inputs: [...lookup.inputs, createLookupInput(key)],
    });
  }

  protected handleInputPatch(index: number, patch: { key?: string; label?: string; placeholder?: string }): void {
    const lookup = this.lookup();
    if (!lookup) {
      return;
    }
    if (patch.key !== undefined && !patch.key.trim()) {
      return;
    }
    this.lookups.patchLookup(lookup.id, {
      inputs: lookup.inputs.map((field, i) => (i === index ? { ...field, ...patch } : field)),
    });
  }

  protected handleRemoveInput(index: number): void {
    const lookup = this.lookup();
    if (!lookup) {
      return;
    }
    this.lookups.patchLookup(lookup.id, {
      inputs: lookup.inputs.filter((_, i) => i !== index),
    });
  }

  protected handleAddStep(): void {
    const lookup = this.lookup();
    if (!lookup) {
      return;
    }
    this.lookups.patchLookup(lookup.id, {
      steps: [...lookup.steps, createLookupStep(newTestingId(), `Query ${lookup.steps.length + 1}`)],
    });
  }

  protected handleRemoveStep(stepId: string): void {
    const lookup = this.lookup();
    if (!lookup) {
      return;
    }
    this.lookups.patchLookup(lookup.id, {
      steps: lookup.steps.filter((step) => step.id !== stepId),
    });
  }

  protected handleStepPatch(stepId: string, patch: Partial<LookupStep>): void {
    const lookup = this.lookup();
    if (!lookup) {
      return;
    }
    const nextPatch: Partial<LookupStep> = { ...patch };
    if ('required' in nextPatch) {
      nextPatch.required = nextPatch.required === true;
    }
    if ('enabled' in nextPatch) {
      nextPatch.enabled = nextPatch.enabled === true;
    }
    this.lookups.patchLookup(lookup.id, {
      steps: lookup.steps.map((step) => (step.id === stepId ? { ...step, ...nextPatch } : step)),
    });
  }

  /**
   * Persists Enabled / Required without putting `required` in the template object literal.
   */
  protected handleStepFlagChange(stepId: string, flag: 'enabled' | 'required', value: unknown): void {
    if (flag === 'required') {
      this.handleStepPatch(stepId, { required: value === true });
      return;
    }
    this.handleStepPatch(stepId, { enabled: value === true });
  }

  /** Updates the skip-unless source token (`input.email`, `var.uuid`). */
  protected handleWhenSourceChange(step: LookupStep, source: string): void {
    this.patchStepWhen(step, source, step.when?.value ?? '');
  }

  /** Updates the skip-unless JavaScript regex; empty pattern always runs. */
  protected handleWhenRegexChange(step: LookupStep, pattern: string): void {
    this.patchStepWhen(step, step.when?.source ?? '', pattern);
  }

  protected handleQuerySourceChange(step: LookupStep, source: string): void {
    const querySource = source as LookupQuerySource;
    if (querySource === 'manual') {
      this.handleStepPatch(step.id, { querySource: 'manual', savedQueryId: undefined });
      return;
    }
    this.handleStepPatch(step.id, { querySource: 'saved' });
  }

  protected handleSavedQueryChange(step: LookupStep, savedQueryId: string): void {
    const id = savedQueryId.trim();
    if (!id) {
      this.handleStepPatch(step.id, { savedQueryId: undefined });
      return;
    }
    const saved = this.queries.find(id);
    this.handleStepPatch(step.id, {
      savedQueryId: id,
      connectionId: saved?.connectionId || step.connectionId,
    });
  }

  protected handleAddExtract(step: LookupStep): void {
    this.handleStepPatch(step.id, {
      extracts: [...step.extracts, createLookupExtract(`value_${step.extracts.length + 1}`)],
    });
  }

  protected handleExtractPatch(
    step: LookupStep,
    index: number,
    patch: { variableName?: string; extract?: string; extractKind?: LookupExtractKind },
  ): void {
    this.handleStepPatch(step.id, {
      extracts: step.extracts.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    });
  }

  protected handleRemoveExtract(step: LookupStep, index: number): void {
    this.handleStepPatch(step.id, {
      extracts: step.extracts.filter((_, i) => i !== index),
    });
  }

  protected handleAddResult(): void {
    const lookup = this.lookup();
    if (!lookup) {
      return;
    }
    this.lookups.patchLookup(lookup.id, {
      results: [...lookup.results, createLookupResultField(newTestingId(), `Field ${lookup.results.length + 1}`)],
    });
  }

  protected handleResultPatch(index: number, patch: { label?: string; template?: string }): void {
    const lookup = this.lookup();
    if (!lookup) {
      return;
    }
    this.lookups.patchLookup(lookup.id, {
      results: lookup.results.map((field, i) => (i === index ? { ...field, ...patch } : field)),
    });
  }

  protected handleRemoveResult(index: number): void {
    const lookup = this.lookup();
    if (!lookup) {
      return;
    }
    this.lookups.patchLookup(lookup.id, {
      results: lookup.results.filter((_, i) => i !== index),
    });
  }

  protected connectionFor(step: LookupStep) {
    const connectionId = step.connectionId?.trim();
    if (!connectionId) {
      return null;
    }
    return (
      this.configService.settings()?.databases?.connections.find((conn) => conn.id === connectionId) ??
      null
    );
  }

  protected queryEditorLanguage(step: LookupStep) {
    return databaseQueryEditorLanguage(this.connectionFor(step)?.type);
  }

  protected queryEditorLanguageLabel(step: LookupStep): string {
    return databaseQueryEditorLanguageLabel(this.connectionFor(step)?.type);
  }

  protected queryEditorPlaceholder(step: LookupStep): string {
    return databaseQueryEditorPlaceholder(this.connectionFor(step)?.type);
  }

  protected queryEditorCompletions(step: LookupStep): readonly TxCodeEditorCompletionItem[] {
    return databaseQueryEditorCompletions(this.connectionFor(step)?.type);
  }

  protected savedQueryPreview(step: LookupStep): string {
    const id = step.savedQueryId?.trim();
    if (!id) {
      return '';
    }
    return this.queries.find(id)?.query ?? '';
  }

  /** Failed step names and messages for the error banner (the step log is not shown). */
  protected failedStepSummary(result: LookupRunResult): string {
    const failed = result.stepLog.filter((row) => row.status === 'failed');
    if (failed.length === 0) {
      return 'One or more steps failed.';
    }
    return failed
      .map((row) => (row.message.trim() ? `${row.name}: ${row.message}` : row.name))
      .join(' ');
  }

  /** Tables/lists when a result value is JSON; otherwise a single text block. */
  protected resultViews(row: LookupRenderedResult): readonly LookupResultView[] {
    return lookupResultViews(row.value);
  }

  /** True when the result should stack a grid or nested captions instead of one line. */
  protected resultRowIsBlock(views: readonly LookupResultView[]): boolean {
    if (views.length !== 1) {
      return true;
    }
    return views[0]?.block.kind !== 'text';
  }

  /** Plain text for a scalar result field. */
  protected scalarResultText(views: readonly LookupResultView[]): string {
    const block = views[0]?.block;
    return block?.kind === 'text' ? block.text : '—';
  }

  /** Row count for the first table in a result field, if any. */
  protected resultTableRowCount(views: readonly LookupResultView[]): number | null {
    const table = views.find((view) => view.block.kind === 'table');
    return table?.block.kind === 'table' ? table.block.rows.length : null;
  }

  /** CSS height for a compact result grid. */
  protected resultTableHeight(rowCount: number): string {
    return `${lookupResultTableHeightRem(rowCount)}rem`;
  }

  protected async handleRun(): Promise<void> {
    const lookup = this.lookup();
    if (!lookup || this.running()) {
      return;
    }
    this.running.set(true);
    this.runError.set(null);
    const result = await this.lookups.run(lookup.id, {
      environmentId: this.runEnvironmentId(),
      inputs: this.runInputs(),
    });
    this.running.set(false);
    if (!result) {
      this.runError.set('The lookup could not run.');
      this.scheduleTabUiPersist();
      return;
    }
    this.runResult.set(result);
    this.scheduleTabUiPersist();
  }

  /** Copy icon, or a check after a successful copy. */
  protected resultCopyIcon(key: string): 'check' | 'copy' {
    return this.copiedKey() === key ? 'check' : 'copy';
  }

  /** Copies one results-card value. */
  protected async handleCopyResultRow(row: LookupRenderedResult): Promise<void> {
    await this.copyText(row.value || '—', row.id);
  }

  /** Copies every results-card row as `label: value` lines. */
  protected async handleCopyAllResults(rows: readonly LookupRenderedResult[]): Promise<void> {
    const text = rows.map((row) => `${row.label}: ${row.value || '—'}`).join('\n');
    await this.copyText(text, 'all');
  }

  /** Writes skip-unless source + regex; empty regex still always runs. */
  private patchStepWhen(step: LookupStep, source: string, pattern: string): void {
    const nextSource = source.trim();
    const regex = pattern.trim();
    if (!nextSource && !regex) {
      this.handleStepPatch(step.id, { when: undefined });
      return;
    }
    this.handleStepPatch(step.id, {
      when: { kind: 'matches', source: nextSource, value: regex },
    });
  }

  private async copyText(text: string, key: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.copiedKey.set(key);
      if (this.copiedResetTimer !== null) {
        clearTimeout(this.copiedResetTimer);
      }
      this.copiedResetTimer = setTimeout(() => {
        this.copiedResetTimer = null;
        this.copiedKey.set(null);
      }, 1200);
    } catch {
      this.copiedKey.set(null);
    }
  }

  private scheduleTabUiPersist(): void {
    if (this.sessionUiSaveTimer !== null) {
      clearTimeout(this.sessionUiSaveTimer);
    }
    this.sessionUiSaveTimer = setTimeout(() => {
      this.sessionUiSaveTimer = null;
      void this.persistTabUi();
    }, SESSION_UI_DEBOUNCE_MS);
  }

  private async persistTabUi(): Promise<void> {
    const resourceId = this.resourceId();
    const session = this.configService.session();
    const existing = resolveLookupTabUi(session?.workspace.testing.lookupTabsById, resourceId);
    await this.configService.patchSession({
      workspace: {
        testing: {
          ...this.testingSession.navigationFields(),
          lookupTabsById: {
            [resourceId]: {
              ...existing,
              activeSection: this.activeSection(),
              runEnvironmentId: this.runEnvironmentId(),
              runInputs: { ...this.runInputs() },
              lastRun: this.runResult() ? lookupTabLastRunSchema.parse(this.runResult()) : null,
              runError: this.runError(),
            },
          },
        },
      },
    });
  }

  private loadChromeChildCount(): number {
    let count = 1;
    if (this.useTitlebarLayout()) {
      count += 1;
    }
    return count;
  }
}
