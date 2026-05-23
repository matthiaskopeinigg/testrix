import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type {
  CollectionRequestExample,
  CollectionRequestSettings,
  HttpMethodId,
  HttpRequestSectionId,
} from '@shared/config';
import type { HttpResponseSnapshot } from '@shared/http/outgoing-request.schema';

import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import type { TxIconName } from '@app/shared/icons/tx-icon.registry';
import { TxTagComponent } from '@app/shared/components/tx-tag/tx-tag.component';
import { TxTagsInputComponent } from '@app/shared/components/tx-tags-input/tx-tags-input.component';
import { TxTextareaComponent } from '@app/shared/components/tx-textarea/tx-textarea.component';

import {
  buildRequestOverviewConfigCards,
  type RequestOverviewFolderVariable,
} from './request-tab-overview-summary';

const FOLDER_VARIABLES_PREVIEW_LIMIT = 8;

interface RequestOverviewRunStat {
  readonly label: string;
  readonly value: string;
  readonly icon: TxIconName;
}

@Component({
  selector: 'app-request-tab-overview-panel',
  standalone: true,
  imports: [
    FormsModule,
    TxButtonComponent,
    TxFormFieldComponent,
    TxIconComponent,
    TxTagComponent,
    TxTagsInputComponent,
    TxTextareaComponent,
  ],
  templateUrl: './request-tab-overview-panel.component.html',
  styleUrl: './request-tab-overview-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequestTabOverviewPanelComponent {
  readonly description = input('');
  readonly tags = input<readonly string[]>([]);
  readonly method = input<HttpMethodId>('GET');
  readonly urlPath = input('');
  readonly environmentName = input('No environment');
  readonly settings = input.required<CollectionRequestSettings>();
  readonly folderVariables = input<readonly RequestOverviewFolderVariable[]>([]);
  readonly examples = input<readonly CollectionRequestExample[]>([]);
  readonly lastRun = input<HttpResponseSnapshot | null>(null);
  readonly runCount = input(0);

  readonly descriptionChange = output<string>();
  readonly tagsChange = output<readonly string[]>();
  readonly sectionSelect = output<HttpRequestSectionId>();
  readonly openResponse = output<void>();
  readonly exampleSelect = output<string>();

  protected readonly configCards = computed(() => buildRequestOverviewConfigCards(this.settings()));

  protected readonly folderVariablesPreview = computed(() =>
    this.folderVariables().slice(0, FOLDER_VARIABLES_PREVIEW_LIMIT),
  );

  protected readonly folderVariablesOverflow = computed(() =>
    Math.max(0, this.folderVariables().length - FOLDER_VARIABLES_PREVIEW_LIMIT),
  );

  protected runCountLabel(): string {
    const count = this.runCount();
    if (count === 0) {
      return 'No saved runs yet.';
    }
    return `${count} saved run${count === 1 ? '' : 's'} in history`;
  }

  protected formatRunTime(capturedAt: string): string {
    return new Date(capturedAt).toLocaleString();
  }

  protected formatExampleMeta(snapshot: HttpResponseSnapshot): string {
    return `${snapshot.timing.totalMs} ms · ${snapshot.size.bodyBytes} B`;
  }

  protected handleExampleSelect(exampleId: string): void {
    this.exampleSelect.emit(exampleId);
  }

  protected lastRunStats(run: HttpResponseSnapshot): readonly RequestOverviewRunStat[] {
    return [
      {
        label: 'Status',
        value: `${run.status.code}`,
        icon: 'checkCircle',
      },
      {
        label: 'Duration',
        value: `${run.timing.totalMs} ms`,
        icon: 'clock',
      },
      {
        label: 'Size',
        value: `${run.size.bodyBytes} B`,
        icon: 'fileText',
      },
      {
        label: 'Headers',
        value: `${run.headers.length}`,
        icon: 'layers',
      },
    ];
  }

  protected statusVariant(ok: boolean): 'success' | 'error' {
    return ok ? 'success' : 'error';
  }
}
