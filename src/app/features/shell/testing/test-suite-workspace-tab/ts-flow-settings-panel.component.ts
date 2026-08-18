import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  parseDatasetCsv,
  parseDatasetJson,
  type TestSuiteFlow,
} from '@shared/testing';

import { FileDialogService } from '@app/core/platform/file-dialog.service';
import { TxButtonComponent } from '@app/shared/components/forms/tx-button/tx-button.component';
import { TxDataGridComponent } from '@app/shared/components/data/tx-data-grid/tx-data-grid.component';
import { TxFormFieldComponent } from '@app/shared/components/forms/tx-form-field/tx-form-field.component';
import { TxTagsInputComponent } from '@app/shared/components/forms/tx-tags-input/tx-tags-input.component';
import { TxToggleComponent } from '@app/shared/components/forms/tx-toggle/tx-toggle.component';

@Component({
  selector: 'app-ts-flow-settings-panel',
  standalone: true,
  imports: [
    FormsModule,
    TxFormFieldComponent,
    TxToggleComponent,
    TxTagsInputComponent,
    TxButtonComponent,
    TxDataGridComponent,
  ],
  templateUrl: './ts-flow-settings-panel.component.html',
  styleUrl: './ts-flow-settings-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TsFlowSettingsPanelComponent {
  readonly flow = input.required<TestSuiteFlow>();
  readonly hasE2eSteps = input(false);

  readonly criticalChange = output<boolean>();
  readonly tagsChange = output<readonly string[]>();
  readonly e2eShowWindowChange = output<boolean>();
  readonly e2eKeepWindowOpenChange = output<boolean>();
  readonly datasetChange = output<NonNullable<TestSuiteFlow['dataset']>>();

  private readonly files = inject(FileDialogService);

  protected e2eShowWindow(): boolean {
    return this.flow().e2eShowWindow !== false;
  }

  protected e2eKeepWindowOpen(): boolean {
    return this.flow().e2eKeepWindowOpen === true;
  }

  protected readonly datasetEnabled = computed(() => this.flow().dataset?.enabled === true);

  protected readonly datasetColumns = computed(() => {
    const keys = new Set<string>();
    for (const row of this.flow().dataset?.rows ?? []) {
      for (const key of Object.keys(row)) {
        keys.add(key);
      }
    }
    return [...keys];
  });

  protected readonly datasetGridRows = computed(() => {
    const columns = this.datasetColumns();
    return (this.flow().dataset?.rows ?? []).map((row) => columns.map((column) => row[column] ?? ''));
  });

  protected handleDatasetEnabled(enabled: boolean): void {
    this.datasetChange.emit({
      enabled,
      rows: this.flow().dataset?.rows ?? [],
    });
  }

  protected async handleImportDataset(): Promise<void> {
    const picked = await this.files.pickFile(['csv', 'json']);
    if (!picked) {
      return;
    }
    const name = picked.fileName.toLowerCase();
    const rows = name.endsWith('.json') ? parseDatasetJson(picked.content) : parseDatasetCsv(picked.content);
    this.datasetChange.emit({
      enabled: true,
      rows,
    });
  }
}
