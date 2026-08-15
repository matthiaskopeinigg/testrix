import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  databaseQueryEditorCompletions,
  databaseQueryEditorLanguage,
  databaseQueryEditorLanguageLabel,
  databaseQueryEditorPlaceholder,
} from '@shared/database/database-query-editor';
import type { DynamicVariableCatalogItem } from '@shared/dynamic-variables';
import {
  createDefaultDatabaseStepConfig,
  resolveDatabaseStepQuerySource,
  type DatabaseStepConfig,
  type FlowDatabaseStepQuerySource,
} from '@shared/testing';

import { ConfigService } from '@app/core/config/config.service';
import { DatabaseQueriesService } from '@app/core/database/database-queries.service';
import { TxBannerComponent } from '@app/shared/components/feedback/tx-banner/tx-banner.component';
import { TxCodeEditorComponent } from '@app/shared/components/editors/tx-code-editor/tx-code-editor.component';
import type { TxCodeEditorCompletionItem } from '@app/shared/components/editors/tx-code-editor/tx-code-editor-completion';
import { TxDropdownComponent } from '@app/shared/components/forms/tx-dropdown/tx-dropdown.component';
import { TxFormFieldComponent } from '@app/shared/components/forms/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/forms/tx-input/tx-input.component';

import {
  FLOW_DATABASE_QUERY_SOURCE_OPTIONS,
  savedQueryDropdownOptions,
} from './flow-database-query-source';

@Component({
  selector: 'app-ts-flow-database-step-panel',
  standalone: true,
  imports: [
    FormsModule,
    TxBannerComponent,
    TxCodeEditorComponent,
    TxDropdownComponent,
    TxFormFieldComponent,
    TxInputComponent,
  ],
  templateUrl: './ts-flow-database-step-panel.component.html',
  styleUrl: './ts-flow-database-step-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TsFlowDatabaseStepPanelComponent {
  readonly config = input<Record<string, unknown>>({});

  readonly variableCatalog = input<readonly DynamicVariableCatalogItem[]>([]);

  readonly configChange = output<Record<string, unknown>>();

  private readonly configService = inject(ConfigService);
  private readonly queries = inject(DatabaseQueriesService);

  protected readonly querySourceOptions = FLOW_DATABASE_QUERY_SOURCE_OPTIONS;

  protected readonly querySource = computed(() => resolveDatabaseStepQuerySource(this.cfg()));

  protected readonly connectionOptions = computed(() => {
    const connections = this.configService.settings()?.databases?.connections ?? [];
    return connections.map((conn) => ({
      value: conn.id,
      label: `${conn.name} (${conn.type})`,
    }));
  });

  protected readonly hasConnections = computed(() => this.connectionOptions().length > 0);

  protected readonly savedQueryOptions = computed(() => savedQueryDropdownOptions(this.queries.nodes()));

  protected readonly hasSavedQueries = computed(() => this.savedQueryOptions().length > 0);

  protected readonly selectedSavedQuery = computed(() => {
    const savedQueryId = this.cfg().savedQueryId;
    if (!savedQueryId) {
      return null;
    }
    return this.queries.find(savedQueryId);
  });

  protected readonly needsSavedQuery = computed(
    () => this.querySource() === 'saved' && !this.cfg().savedQueryId,
  );

  protected readonly missingSavedQuery = computed(
    () => this.querySource() === 'saved' && Boolean(this.cfg().savedQueryId) && !this.selectedSavedQuery(),
  );

  protected readonly selectedConnection = computed(() => {
    const connectionId = this.cfg().connectionId;
    if (!connectionId) {
      return null;
    }
    return (
      this.configService.settings()?.databases?.connections.find((conn) => conn.id === connectionId) ??
      null
    );
  });

  protected readonly queryEditorLanguage = computed(() =>
    databaseQueryEditorLanguage(this.selectedConnection()?.type),
  );

  protected readonly queryEditorLanguageLabel = computed(() =>
    databaseQueryEditorLanguageLabel(this.selectedConnection()?.type),
  );

  protected readonly queryEditorPlaceholder = computed(() =>
    databaseQueryEditorPlaceholder(this.selectedConnection()?.type),
  );

  protected readonly queryEditorCompletions = computed((): readonly TxCodeEditorCompletionItem[] =>
    databaseQueryEditorCompletions(this.selectedConnection()?.type),
  );

  protected readonly savedQueryPreview = computed(() => this.selectedSavedQuery()?.query ?? '');

  constructor() {
    void this.queries.hydrate();
  }

  protected cfg(): DatabaseStepConfig {
    return (this.config() ?? createDefaultDatabaseStepConfig()) as DatabaseStepConfig;
  }

  protected patch(patch: Partial<DatabaseStepConfig>): void {
    this.configChange.emit({ ...this.cfg(), ...patch });
  }

  protected handleQuerySourceChange(source: FlowDatabaseStepQuerySource): void {
    if (source === 'manual') {
      this.patch({
        querySource: 'manual',
        savedQueryId: undefined,
      });
      return;
    }
    this.patch({
      querySource: 'saved',
    });
  }

  protected handleSavedQueryChange(savedQueryId: string): void {
    const id = savedQueryId.trim();
    if (!id) {
      this.patch({ savedQueryId: undefined });
      return;
    }
    const saved = this.queries.find(id);
    this.patch({
      savedQueryId: id,
      connectionId: saved?.connectionId || this.cfg().connectionId,
    });
  }
}
