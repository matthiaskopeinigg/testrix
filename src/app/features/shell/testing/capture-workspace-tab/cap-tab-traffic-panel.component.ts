import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  CAPTURE_RESOURCE_CATEGORY_IDS,
  CAPTURE_TRAFFIC_FILTER_SCOPE_IDS,
  captureEntryHasRequestBody,
  captureEntryHasResponseBody,
  captureRequestBodyEditorLanguage,
  captureRequestBodyPreview,
  captureResponseBodyEditorLanguage,
  captureResponseBodyPreview,
  filterCaptureLogEntries,
  formatCaptureHeaderPairs,
  type CaptureLogEntry,
  type CaptureResourceCategory,
  type CaptureTrafficFilterScope,
} from '@shared/testing';

import { TxCodeEditorComponent } from '@app/shared/components/tx-code-editor/tx-code-editor.component';
import { txCodeEditorLanguageLabel } from '@app/shared/components/tx-code-editor/tx-code-editor-language';
import type { TxCodeEditorLanguage } from '@app/shared/components/tx-code-editor/tx-code-editor-language';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxDropdownComponent } from '@app/shared/components/tx-dropdown/tx-dropdown.component';
import type { TxDropdownOption } from '@app/shared/components/tx-dropdown/tx-dropdown.types';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';
import { TxTagComponent } from '@app/shared/components/tx-tag/tx-tag.component';

const SCOPE_OPTIONS: readonly TxDropdownOption[] = CAPTURE_TRAFFIC_FILTER_SCOPE_IDS.map((value) => ({
  value,
  label: scopeLabel(value),
}));

const RESOURCE_OPTIONS: readonly TxDropdownOption[] = CAPTURE_RESOURCE_CATEGORY_IDS.map((value) => ({
  value,
  label: resourceLabel(value),
}));

function scopeLabel(scope: CaptureTrafficFilterScope): string {
  const labels: Record<CaptureTrafficFilterScope, string> = {
    all: 'Everything',
    url: 'Full URL',
    path: 'Path & query',
    method: 'Method',
    status: 'Status code',
    type: 'Resource type',
  };
  return labels[scope];
}

function resourceLabel(category: CaptureResourceCategory): string {
  const labels: Record<CaptureResourceCategory, string> = {
    all: 'All resources',
    'fetch-xhr': 'Fetch / XHR',
    document: 'Document',
    stylesheet: 'CSS',
    script: 'JS',
    image: 'Image',
    font: 'Font',
    media: 'Media',
    manifest: 'Manifest',
    websocket: 'WebSocket',
    other: 'Other',
  };
  return labels[category];
}

@Component({
  selector: 'app-cap-tab-traffic-panel',
  standalone: true,
  imports: [
    FormsModule,
    TxCodeEditorComponent,
    TxButtonComponent,
    TxDropdownComponent,
    TxFormFieldComponent,
    TxIconComponent,
    TxInputComponent,
    TxTagComponent,
  ],
  templateUrl: './cap-tab-traffic-panel.component.html',
  styleUrl: './cap-tab-traffic-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CapTabTrafficPanelComponent {
  readonly entries = input<readonly CaptureLogEntry[]>([]);
  readonly running = input(false);
  readonly filterQuery = input('');
  readonly filterScope = input<CaptureTrafficFilterScope>('all');
  readonly resourceCategory = input<CaptureResourceCategory>('all');

  readonly filterQueryChange = output<string>();
  readonly filterScopeChange = output<CaptureTrafficFilterScope>();
  readonly resourceCategoryChange = output<CaptureResourceCategory>();
  readonly clearHistory = output<void>();
  readonly createCollectionRequest = output<CaptureLogEntry>();
  readonly createFlowFromCapture = output<CaptureLogEntry>();

  protected readonly scopeOptions = SCOPE_OPTIONS;
  protected readonly resourceOptions = RESOURCE_OPTIONS;
  protected readonly expandedIds = signal<ReadonlySet<string>>(new Set());

  protected readonly filtered = computed(() =>
    filterCaptureLogEntries(this.entries(), {
      query: this.filterQuery(),
      scope: this.filterScope(),
      resourceCategory: this.resourceCategory(),
    }),
  );

  protected readonly filterActive = computed(
    () =>
      !!this.filterQuery().trim() ||
      this.filterScope() !== 'all' ||
      this.resourceCategory() !== 'all',
  );

  protected readonly formatHeaders = formatCaptureHeaderPairs;
  protected readonly hasRequestBody = captureEntryHasRequestBody;
  protected readonly hasResponseBody = captureEntryHasResponseBody;
  protected readonly requestBodyLanguage = captureRequestBodyEditorLanguage;
  protected readonly requestBodyPreview = captureRequestBodyPreview;
  protected readonly responseBodyLanguage = captureResponseBodyEditorLanguage;
  protected readonly responseBodyPreview = captureResponseBodyPreview;

  protected bodyLanguageLabel(lang: TxCodeEditorLanguage): string {
    return txCodeEditorLanguageLabel(lang);
  }

  protected isExpanded(entryId: string): boolean {
    return this.expandedIds().has(entryId);
  }

  protected handleRowActivate(entry: CaptureLogEntry, event: Event): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, a, input, textarea, select, label')) {
      return;
    }
    this.toggleExpanded(entry.id);
  }

  protected handleRowKeydown(entry: CaptureLogEntry, event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    this.toggleExpanded(entry.id);
  }

  protected toggleExpanded(entryId: string): void {
    this.expandedIds.update((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return next;
    });
  }

  protected methodTone(method: string): string {
    const m = method.toUpperCase();
    if (m === 'GET') return 'get';
    if (m === 'POST') return 'post';
    if (m === 'PUT' || m === 'PATCH') return 'put';
    if (m === 'DELETE') return 'delete';
    return 'other';
  }

  protected formatTime(at: string): string {
    try {
      return new Date(at).toLocaleTimeString();
    } catch {
      return at;
    }
  }

  protected formatStatus(code: number | null | undefined): string {
    return code === null || code === undefined ? '—' : String(code);
  }

  protected statusTone(code: number | null | undefined): string {
    if (code === null || code === undefined) {
      return 'other';
    }
    if (code >= 200 && code < 300) {
      return 'success';
    }
    if (code >= 400) {
      return 'error';
    }
    return 'other';
  }
}
