import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { CollectionRequestHeaders } from '@shared/config';
import {
  listInheritedRequestHeaderRows,
  type InheritedRequestHeaderRow,
  type ResolveCollectionRequestHeadersInput,
} from '@shared/config';

import { TxBannerComponent } from '@app/shared/components/tx-banner/tx-banner.component';
import { TxKeyValueListComponent } from '@app/shared/components/tx-key-value-list/tx-key-value-list.component';
import type { TxKeyValueRow } from '@app/shared/components/tx-key-value-list/tx-key-value-list.types';
import { DYNAMIC_VARIABLES, type DynamicVariableCatalogItem } from '@shared/dynamic-variables';

function headerKeyLower(key: string): string {
  return key.trim().toLowerCase();
}

@Component({
  selector: 'app-request-tab-headers-panel',
  standalone: true,
  imports: [FormsModule, TxBannerComponent, TxKeyValueListComponent],
  template: `
    <div class="request-panel">
      @if (contentTypeHint()) {
        <tx-banner variant="info" title="Suggested Content-Type">
          {{ contentTypeHint() }} — add a request header with the same key to override.
        </tx-banner>
      }

      @if (inheritedRows().length > 0) {
        <section class="request-panel__inherited-section">
          <h2 class="request-panel__title">Inherited headers</h2>
          <p class="request-panel__hint request-panel__hint--compact">
            From global defaults and ancestor folders. Uncheck to exclude. Add the same key under
            Request headers to override the value.
          </p>
          <ul class="request-panel__inherited-list">
            @for (
              row of inheritedRows();
              track row.key + row.source + (row.folderId ?? '') + row.value + row.enabled
            ) {
              <li class="request-panel__inherited-row" [class.is-disabled]="!row.enabled">
                <div class="request-panel__inherited-line">
                  <label class="request-panel__inherited-enable">
                    <input
                      type="checkbox"
                      class="request-panel__inherited-enable-input"
                      [checked]="row.enabled"
                      [attr.aria-label]="'Include ' + row.key"
                      (change)="handleInheritedEnabled(row, $any($event.target).checked)"
                    />
                    <span class="request-panel__inherited-enable-box" aria-hidden="true"></span>
                  </label>
                  <span class="request-panel__inherited-key">{{ row.key }}</span>
                  <span class="request-panel__inherited-source">{{ sourceLabel(row) }}</span>
                  <span class="request-panel__inherited-value" [attr.title]="row.value || null">
                    {{ row.value || '—' }}
                  </span>
                </div>
              </li>
            }
          </ul>
        </section>
      }

      <h2 class="request-panel__title">Request headers</h2>
      <tx-key-value-list
        [compact]="true"
        keyLabel="Key"
        keyInput="http-headers"
        valueLabel="Value"
        addLabel="Add header"
        valueInput="variables"
        [maxRows]="64"
        [rows]="requestRows()"
        [variableCatalog]="variableCatalog()"
        (rowsChange)="handleRequestRowsChange($event)"
        (environmentVariableClick)="environmentVariableClick.emit($event)"
      />
    </div>
  `,
  styleUrl: './request-tab-panels.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequestTabHeadersPanelComponent {
  readonly resolveInput = input.required<ResolveCollectionRequestHeadersInput>();
  readonly headers = input.required<CollectionRequestHeaders>();
  readonly contentTypeHint = input<string | null>(null);
  readonly variableCatalog = input<readonly DynamicVariableCatalogItem[]>(DYNAMIC_VARIABLES);

  readonly headersChange = output<CollectionRequestHeaders>();
  readonly environmentVariableClick = output<{ readonly key: string }>();

  protected readonly inheritedRows = computed(() =>
    listInheritedRequestHeaderRows(this.resolveInput()),
  );

  protected requestRows(): readonly TxKeyValueRow[] {
    return this.headers().rows.map((row) => ({
      id: row.id,
      enabled: row.enabled,
      key: row.key,
      value: row.value,
      description: row.description,
    }));
  }

  protected sourceLabel(row: InheritedRequestHeaderRow): string {
    if (row.source === 'global') {
      return 'Global default';
    }
    if (row.source === 'folder') {
      return row.folderLabel ? `Folder: ${row.folderLabel}` : 'Folder';
    }
    return 'Request';
  }

  protected handleRequestRowsChange(rows: readonly TxKeyValueRow[]): void {
    const current = this.headers();
    const overrides = pruneOverridesForRequestKeys(current.overrides, rows);

    this.headersChange.emit({
      ...current,
      overrides,
      rows: rows.map((row) => ({
        id: row.id,
        enabled: row.enabled,
        key: row.key,
        value: row.value,
        description: row.description?.trim() || undefined,
      })),
    });
  }

  protected handleInheritedEnabled(row: InheritedRequestHeaderRow, enabled: boolean): void {
    const overrides = { ...this.headers().overrides };
    const key = row.overrideKey;

    if (enabled) {
      const patch = overrides[key];
      if (!patch) {
        return;
      }
      if (patch.value === undefined) {
        delete overrides[key];
      } else {
        overrides[key] = { ...patch, enabled: true };
      }
    } else {
      overrides[key] = { enabled: false };
    }

    this.patchOverrides(overrides);
  }

  private patchOverrides(overrides: CollectionRequestHeaders['overrides']): void {
    this.headersChange.emit({ ...this.headers(), overrides });
  }
}

/** Drops disable-only overrides when an enabled request row defines the same key. */
function pruneOverridesForRequestKeys(
  overrides: CollectionRequestHeaders['overrides'],
  rows: readonly TxKeyValueRow[],
): CollectionRequestHeaders['overrides'] {
  const next = { ...overrides };

  for (const row of rows) {
    if (!row.enabled || !row.key.trim()) {
      continue;
    }

    const lower = headerKeyLower(row.key);
    for (const [overrideKey, patch] of Object.entries(next)) {
      if (headerKeyLower(overrideKey) !== lower) {
        continue;
      }
      if (patch.enabled === false && patch.value === undefined) {
        delete next[overrideKey];
      }
    }
  }

  return next;
}
