import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  databaseQueryEditorCompletions,
  databaseQueryEditorLanguage,
  databaseQueryEditorLanguageLabel,
  databaseQueryEditorPlaceholder,
} from '@shared/database/database-query-editor';
import type { DynamicVariableCatalogItem } from '@shared/dynamic-variables';

import { ConfigService } from '@app/core/config/config.service';
import { TxCodeEditorComponent } from '@app/shared/components/tx-code-editor/tx-code-editor.component';
import type { TxCodeEditorCompletionItem } from '@app/shared/components/tx-code-editor/tx-code-editor-completion';
import { TxDropdownComponent } from '@app/shared/components/tx-dropdown/tx-dropdown.component';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';

@Component({
  selector: 'app-ts-flow-database-step-panel',
  standalone: true,
  imports: [
    FormsModule,
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

  protected readonly connectionOptions = computed(() => {
    const connections = this.configService.settings()?.databases?.connections ?? [];
    return connections.map((conn) => ({
      value: conn.id,
      label: `${conn.name} (${conn.type})`,
    }));
  });

  protected readonly hasConnections = computed(() => this.connectionOptions().length > 0);

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

  protected cfg(): { connectionId: string; query: string; cacheAs?: string } {
    return (this.config() ?? { connectionId: '', query: '' }) as {
      connectionId: string;
      query: string;
      cacheAs?: string;
    };
  }

  protected patch(patch: Record<string, unknown>): void {
    this.configChange.emit({ ...this.cfg(), ...patch });
  }
}
