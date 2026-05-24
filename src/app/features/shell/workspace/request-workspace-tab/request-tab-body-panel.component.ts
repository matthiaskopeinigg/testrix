import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type {
  CollectionRequestBody,
  CollectionRequestFormField,
  RequestBodyModeId,
} from '@shared/config';
import {
  REQUEST_BODY_MODE_IDS,
  createCollectionRequestFormField,
  createHttpKeyValueRow,
} from '@shared/config';

import { RequestFilePickerService } from '@app/core/shell/request-file-picker.service';
import { TxBannerComponent } from '@app/shared/components/tx-banner/tx-banner.component';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxCodeEditorComponent } from '@app/shared/components/tx-code-editor/tx-code-editor.component';
import { TxDropdownComponent } from '@app/shared/components/tx-dropdown/tx-dropdown.component';
import type { TxDropdownOption } from '@app/shared/components/tx-dropdown/tx-dropdown.types';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';
import { TxKeyValueListComponent } from '@app/shared/components/tx-key-value-list/tx-key-value-list.component';
import type { TxKeyValueRow } from '@app/shared/components/tx-key-value-list/tx-key-value-list.types';
import { TxTextareaComponent } from '@app/shared/components/tx-textarea/tx-textarea.component';
import { TxToggleComponent } from '@app/shared/components/tx-toggle/tx-toggle.component';
import type { TxCodeEditorLanguage } from '@app/shared/components/tx-code-editor/tx-code-editor-language';
import type { DynamicVariableCatalogItem } from '@shared/dynamic-variables';
import { DYNAMIC_VARIABLES } from '@shared/dynamic-variables';

const MODE_OPTIONS: readonly TxDropdownOption[] = REQUEST_BODY_MODE_IDS.map((value) => ({
  value,
  label: value === 'x-www-form-urlencoded' ? 'x-www-form-urlencoded' : value,
}));

const RAW_LANGUAGE: Record<string, { language: TxCodeEditorLanguage; badge: string }> = {
  json: { language: 'json', badge: 'JSON' },
  text: { language: 'plaintext', badge: 'Text' },
  html: { language: 'html', badge: 'HTML' },
  xml: { language: 'xml', badge: 'XML' },
};

const BODY_EDITOR_PLACEHOLDERS: Readonly<Partial<Record<RequestBodyModeId, string>>> = {
  json: '{\n  "name": "{{userName}}",\n  "id": "$uuid"\n}',
  text: 'Hello {{userName}} — request id $uuid',
  html: '<payload user="{{userName}}"/>\n<note>$timestamp</note>',
  xml: '<payload user="{{userName}}"/>\n<note>$timestamp</note>',
  graphql: 'query {\n  user(id: "{{userId}}") {\n    id\n  }\n}',
};

const GQL_VARS_PLACEHOLDER = '{\n  "userId": "{{userId}}"\n}';

@Component({
  selector: 'app-request-tab-body-panel',
  standalone: true,
  imports: [
    FormsModule,
    TxBannerComponent,
    TxButtonComponent,
    TxCodeEditorComponent,
    TxDropdownComponent,
    TxFormFieldComponent,
    TxInputComponent,
    TxKeyValueListComponent,
    TxTextareaComponent,
    TxToggleComponent,
  ],
  template: `
    <div
      class="request-panel"
      [class.request-panel--fill]="fillEditor()"
    >
      @if (bodyDisabledHint()) {
        <tx-banner variant="info" [title]="bodyDisabledHint()!" />
      }

      <div class="request-panel__mode-row">
        <tx-form-field label="Body type" controlId="body-mode">
          <tx-dropdown
            id="body-mode"
            [options]="modeOptions"
            [ngModel]="body().mode"
            (ngModelChange)="handleModeChange($event)"
          />
        </tx-form-field>
      </div>

      @switch (body().mode) {
        @case ('none') {
          <p class="request-panel__empty">{{ noneBodyMessage() }}</p>
        }
        @case ('json') {
          @if (rawEditor(); as editor) {
            <div class="request-panel__editor">
            <tx-code-editor
              [language]="editor.language"
              [languageBadgeLabel]="editor.badge"
              [framed]="true"
              [hideToolbarActions]="true"
              [showFormatAction]="true"
              [autoFormat]="false"
              [autoClose]="true"
              [smartEditing]="true"
              [variableCatalog]="variableCatalog()"
              [placeholder]="rawBodyPlaceholder()"
              [showVariablePlaceholderHint]="showVariablePlaceholderHint()"
              [ngModel]="rawContent()"
              (ngModelChange)="handleRawChange($event)"
              (environmentVariableClick)="environmentVariableClick.emit($event)"
            />
            </div>
          }
        }
        @case ('text') {
          @if (rawEditor(); as editor) {
            <div class="request-panel__editor">
            <tx-code-editor
              [language]="editor.language"
              [languageBadgeLabel]="editor.badge"
              [framed]="true"
              [hideToolbarActions]="true"
              [showFormatAction]="true"
              [autoFormat]="false"
              [autoClose]="true"
              [smartEditing]="true"
              [variableCatalog]="variableCatalog()"
              [placeholder]="rawBodyPlaceholder()"
              [showVariablePlaceholderHint]="showVariablePlaceholderHint()"
              [ngModel]="rawContent()"
              (ngModelChange)="handleRawChange($event)"
              (environmentVariableClick)="environmentVariableClick.emit($event)"
            />
            </div>
          }
        }
        @case ('html') {
          @if (rawEditor(); as editor) {
            <div class="request-panel__editor">
            <tx-code-editor
              [language]="editor.language"
              [languageBadgeLabel]="editor.badge"
              [framed]="true"
              [hideToolbarActions]="true"
              [showFormatAction]="true"
              [autoFormat]="false"
              [autoClose]="true"
              [smartEditing]="true"
              [variableCatalog]="variableCatalog()"
              [placeholder]="rawBodyPlaceholder()"
              [showVariablePlaceholderHint]="showVariablePlaceholderHint()"
              [ngModel]="rawContent()"
              (ngModelChange)="handleRawChange($event)"
              (environmentVariableClick)="environmentVariableClick.emit($event)"
            />
            </div>
          }
        }
        @case ('xml') {
          @if (rawEditor(); as editor) {
            <div class="request-panel__editor">
            <tx-code-editor
              [language]="editor.language"
              [languageBadgeLabel]="editor.badge"
              [framed]="true"
              [hideToolbarActions]="true"
              [showFormatAction]="true"
              [autoFormat]="false"
              [autoClose]="true"
              [smartEditing]="true"
              [variableCatalog]="variableCatalog()"
              [placeholder]="rawBodyPlaceholder()"
              [showVariablePlaceholderHint]="showVariablePlaceholderHint()"
              [ngModel]="rawContent()"
              (ngModelChange)="handleRawChange($event)"
              (environmentVariableClick)="environmentVariableClick.emit($event)"
            />
            </div>
          }
        }
        @case ('x-www-form-urlencoded') {
          <tx-key-value-list
            keyLabel="Key"
            valueLabel="Value"
            addLabel="Add field"
            valueInput="variables"
            [maxRows]="64"
            [rows]="urlEncodedRows()"
            (rowsChange)="handleUrlEncodedChange($event)"
          />
        }
        @case ('form-data') {
          <div class="request-panel__form-data">
            @for (field of formFields(); track field.id) {
              <div class="request-panel__form-row" [class.is-disabled]="!field.enabled">
                <div class="request-panel__form-cell request-panel__form-cell--enable">
                  <span class="request-panel__form-cell-label">On</span>
                  <div class="request-panel__form-enable-control">
                    <tx-toggle
                      [controlId]="'fd-en-' + field.id"
                      label=""
                      [attr.aria-label]="'Enable field'"
                      [ngModel]="field.enabled"
                      (ngModelChange)="handleFormFieldPatch(field.id, { enabled: $event })"
                    />
                  </div>
                </div>
                <tx-form-field class="request-panel__form-cell" label="Key" [controlId]="'fd-k-' + field.id">
                  <tx-input
                    [id]="'fd-k-' + field.id"
                    [ngModel]="field.key"
                    (ngModelChange)="handleFormFieldPatch(field.id, { key: $event })"
                  />
                </tx-form-field>
                <tx-form-field class="request-panel__form-cell" label="Type" [controlId]="'fd-t-' + field.id">
                  <tx-dropdown
                    [id]="'fd-t-' + field.id"
                    [options]="formTypeOptions"
                    [ngModel]="field.type"
                    (ngModelChange)="handleFormFieldType(field.id, $event)"
                  />
                </tx-form-field>
                @if (field.type === 'text') {
                  <tx-form-field class="request-panel__form-cell" label="Value" [controlId]="'fd-v-' + field.id">
                    <tx-input
                      [id]="'fd-v-' + field.id"
                      [ngModel]="field.value ?? ''"
                      (ngModelChange)="handleFormFieldPatch(field.id, { value: $event })"
                    />
                  </tx-form-field>
                } @else {
                  <tx-form-field class="request-panel__form-cell" label="Value" [controlId]="'fd-v-' + field.id">
                    @if (field.fileName) {
                      <p class="request-panel__file-meta">{{ field.fileName }}</p>
                      @if (field.filePath) {
                        <p class="request-panel__file-meta">{{ field.filePath }}</p>
                      }
                    }
                    <tx-button variant="secondary" (pressed)="handleFormFilePick(field.id)">
                      Choose file…
                    </tx-button>
                  </tx-form-field>
                }
                <tx-button
                  class="request-panel__form-remove"
                  variant="secondary"
                  (pressed)="handleFormFieldRemove(field.id)"
                >
                  Remove
                </tx-button>
              </div>
            }
            <tx-button variant="secondary" (pressed)="handleAddFormField()">Add field</tx-button>
          </div>
        }
        @case ('binary') {
          <div class="request-panel__binary-toggle" role="group" aria-label="Binary source">
            <button
              type="button"
              [class.is-active]="binarySource() === 'file'"
              (click)="handleBinarySource('file')"
            >
              Select file
            </button>
            <button
              type="button"
              [class.is-active]="binarySource() === 'inline'"
              (click)="handleBinarySource('inline')"
            >
              Binary data
            </button>
          </div>
          @if (binarySource() === 'file') {
            @if (binaryFileName()) {
              <p class="request-panel__file-meta">{{ binaryFileName() }}</p>
              <p class="request-panel__file-meta">{{ binaryFilePath() }}</p>
            }
            <tx-button variant="secondary" (pressed)="handleBinaryFilePick()">Choose file…</tx-button>
            <tx-button variant="secondary" (pressed)="handleBinaryClear()">Clear</tx-button>
          } @else {
            <tx-form-field label="Content-Type (optional)" controlId="binary-ct">
              <tx-input
                id="binary-ct"
                [ngModel]="binaryContentType()"
                (ngModelChange)="handleBinaryInlinePatch({ contentType: $event })"
                placeholder="application/octet-stream"
              />
            </tx-form-field>
            <tx-form-field label="Base64 data" controlId="binary-b64">
              <tx-textarea
                id="binary-b64"
                [ngModel]="binaryBase64()"
                (ngModelChange)="handleBinaryInlinePatch({ contentBase64: $event })"
                placeholder="Paste base64-encoded bytes"
              />
            </tx-form-field>
          }
        }
        @case ('graphql') {
          <div class="request-panel__graphql">
          <div class="request-panel__graphql-query">
          <tx-form-field label="Query" controlId="gql-query">
            <div class="request-panel__editor">
            <tx-code-editor
              language="graphql"
              languageBadgeLabel="GraphQL"
              [framed]="true"
              [hideToolbarActions]="true"
              [showFormatAction]="true"
              [autoFormat]="false"
              [autoClose]="true"
              [smartEditing]="true"
              [variableCatalog]="variableCatalog()"
              [placeholder]="graphqlQueryPlaceholder()"
              [showVariablePlaceholderHint]="showVariablePlaceholderHint()"
              [ngModel]="graphqlQuery()"
              (ngModelChange)="handleGraphqlPatch({ query: $event })"
              (environmentVariableClick)="environmentVariableClick.emit($event)"
            />
            </div>
          </tx-form-field>
          </div>
          <div class="request-panel__graphql-vars">
          <tx-form-field label="Variables (JSON)" controlId="gql-vars">
            <div class="request-panel__editor">
            <tx-code-editor
              language="json"
              languageBadgeLabel="JSON"
              [framed]="true"
              [hideToolbarActions]="true"
              [showFormatAction]="true"
              [autoFormat]="false"
              [autoClose]="true"
              [smartEditing]="true"
              [variableCatalog]="variableCatalog()"
              [placeholder]="graphqlVariablesPlaceholder()"
              [showVariablePlaceholderHint]="showVariablePlaceholderHint()"
              [ngModel]="graphqlVariables()"
              (ngModelChange)="handleGraphqlPatch({ variables: $event })"
              (environmentVariableClick)="environmentVariableClick.emit($event)"
            />
            </div>
          </tx-form-field>
          </div>
          <tx-form-field class="request-panel__graphql-op" label="Operation name (optional)" controlId="gql-op">
            <tx-input
              id="gql-op"
              [ngModel]="graphqlOperationName()"
              (ngModelChange)="handleGraphqlPatch({ operationName: $event || undefined })"
            />
          </tx-form-field>
          </div>
        }
      }
    </div>
  `,
  styleUrl: './request-tab-panels.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.request-tab-body-panel-host--compact]': '!fillEditor()',
  },
})
export class RequestTabBodyPanelComponent {
  private readonly filePicker = inject(RequestFilePickerService);

  readonly body = input.required<CollectionRequestBody>();
  readonly method = input<string>('GET');
  /** When false, body editors use a fixed height instead of filling the parent pane. */
  readonly fillEditor = input(true);
  /** Request tabs use `request`; mock/interceptor response editors use `response`. */
  readonly bodyContext = input<'request' | 'response'>('request');
  readonly variableCatalog = input<readonly DynamicVariableCatalogItem[]>(DYNAMIC_VARIABLES);

  readonly bodyChange = output<CollectionRequestBody>();
  readonly environmentVariableClick = output<{ readonly key: string }>();


  protected readonly modeOptions = MODE_OPTIONS;
  protected readonly formTypeOptions: readonly TxDropdownOption[] = [
    { value: 'text', label: 'Text' },
    { value: 'file', label: 'File' },
  ];

  protected readonly binarySource = signal<'file' | 'inline'>('file');

  protected readonly bodyDisabledHint = computed(() => {
    if (this.bodyContext() === 'response') {
      return null;
    }
    const m = this.method().toUpperCase();
    if (m === 'GET' || m === 'HEAD') {
      return `${m} requests typically have no body; you can still configure a body for overrides.`;
    }
    return null;
  });

  protected readonly showVariablePlaceholderHint = computed(() => this.bodyContext() === 'request');

  protected readonly noneBodyMessage = computed(() =>
    this.bodyContext() === 'response'
      ? 'No response body configured.'
      : 'This request does not send a body.',
  );

  protected readonly rawEditor = computed(() => {
    const mode = this.body().mode;
    if (mode === 'json' || mode === 'text' || mode === 'html' || mode === 'xml') {
      return RAW_LANGUAGE[mode];
    }
    return null;
  });

  protected rawBodyPlaceholder(): string {
    if (this.bodyContext() === 'response') {
      return '';
    }
    const mode = this.body().mode;
    if (mode === 'json' || mode === 'text' || mode === 'html' || mode === 'xml') {
      return BODY_EDITOR_PLACEHOLDERS[mode] ?? '';
    }
    return '';
  }

  protected graphqlQueryPlaceholder(): string {
    return this.bodyContext() === 'response' ? '' : (BODY_EDITOR_PLACEHOLDERS.graphql ?? '');
  }

  protected graphqlVariablesPlaceholder(): string {
    return this.bodyContext() === 'response' ? '' : GQL_VARS_PLACEHOLDER;
  }

  protected rawContent(): string {
    const b = this.body();
    if ('raw' in b) {
      return b.raw;
    }
    return '';
  }

  protected formFields(): readonly CollectionRequestFormField[] {
    const b = this.body();
    return b.mode === 'form-data' ? b.fields : [];
  }

  protected urlEncodedRows(): readonly TxKeyValueRow[] {
    const b = this.body();
    if (b.mode !== 'x-www-form-urlencoded') {
      return [];
    }
    return b.fields.map((row) => ({
      id: row.id,
      enabled: row.enabled,
      key: row.key,
      value: row.value,
    }));
  }

  protected binaryFilePath(): string {
    const b = this.body();
    if (b.mode === 'binary' && b.source === 'file') {
      return b.filePath ?? '';
    }
    return '';
  }

  protected binaryFileName(): string | undefined {
    const b = this.body();
    if (b.mode === 'binary') {
      return b.fileName;
    }
    return undefined;
  }

  protected binaryBase64(): string {
    const b = this.body();
    if (b.mode === 'binary' && b.source === 'inline') {
      return b.contentBase64 ?? '';
    }
    return '';
  }

  protected binaryContentType(): string {
    const b = this.body();
    if (b.mode === 'binary' && b.source === 'inline') {
      return b.contentType ?? '';
    }
    return '';
  }

  protected graphqlQuery(): string {
    const b = this.body();
    return b.mode === 'graphql' ? b.query : '';
  }

  protected graphqlVariables(): string {
    const b = this.body();
    if (b.mode !== 'graphql') {
      return this.bodyContext() === 'response' ? '' : '{\n}';
    }
    return b.variables;
  }

  protected graphqlOperationName(): string {
    const b = this.body();
    return b.mode === 'graphql' ? (b.operationName ?? '') : '';
  }

  protected handleModeChange(value: string): void {
    const mode = value as RequestBodyModeId;
    const current = this.body();
    if (current.mode === mode) {
      return;
    }
    const isResponse = this.bodyContext() === 'response';
    switch (mode) {
      case 'none':
        this.bodyChange.emit({ mode: 'none' });
        break;
      case 'json':
      case 'text':
      case 'html':
      case 'xml':
        this.bodyChange.emit({
          mode,
          raw:
            'raw' in current && current.mode === mode
              ? current.raw
              : isResponse
                ? ''
                : mode === 'json'
                  ? '{\n}'
                  : '',
        });
        break;
      case 'form-data':
        this.bodyChange.emit({
          mode: 'form-data',
          fields:
            current.mode === 'form-data'
              ? current.fields
              : isResponse
                ? []
                : [createCollectionRequestFormField()],
        });
        break;
      case 'x-www-form-urlencoded':
        this.bodyChange.emit({
          mode: 'x-www-form-urlencoded',
          fields:
            current.mode === 'x-www-form-urlencoded'
              ? current.fields
              : isResponse
                ? []
                : [createHttpKeyValueRow()],
        });
        break;
      case 'binary':
        this.binarySource.set('file');
        this.bodyChange.emit({ mode: 'binary', source: 'file', filePath: '', fileName: undefined });
        break;
      case 'graphql':
        this.bodyChange.emit({
          mode: 'graphql',
          query: current.mode === 'graphql' ? current.query : '',
          variables: current.mode === 'graphql' ? current.variables : isResponse ? '' : '{\n}',
        });
        break;
    }
  }

  protected handleRawChange(raw: string): void {
    const b = this.body();
    if (b.mode === 'json' || b.mode === 'text' || b.mode === 'html' || b.mode === 'xml') {
      this.bodyChange.emit({ ...b, raw });
    }
  }

  protected handleUrlEncodedChange(rows: readonly TxKeyValueRow[]): void {
    this.bodyChange.emit({
      mode: 'x-www-form-urlencoded',
      fields: rows.map((row) => ({
        id: row.id,
        enabled: row.enabled,
        key: row.key,
        value: row.value,
      })),
    });
  }

  protected handleAddFormField(): void {
    const b = this.body();
    if (b.mode !== 'form-data') {
      return;
    }
    this.bodyChange.emit({
      mode: 'form-data',
      fields: [...b.fields, createCollectionRequestFormField()],
    });
  }

  protected handleFormFieldRemove(id: string): void {
    const b = this.body();
    if (b.mode !== 'form-data') {
      return;
    }
    this.bodyChange.emit({
      mode: 'form-data',
      fields: b.fields.filter((f) => f.id !== id),
    });
  }

  protected handleFormFieldPatch(
    id: string,
    patch: Partial<CollectionRequestFormField>,
  ): void {
    const b = this.body();
    if (b.mode !== 'form-data') {
      return;
    }
    this.bodyChange.emit({
      mode: 'form-data',
      fields: b.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    });
  }

  protected handleFormFieldType(id: string, type: string): void {
    this.handleFormFieldPatch(id, {
      type: type as 'text' | 'file',
      value: type === 'text' ? '' : undefined,
      filePath: type === 'file' ? null : undefined,
      fileName: undefined,
    });
  }

  protected async handleFormFilePick(id: string): Promise<void> {
    const picked = await this.filePicker.pickFile();
    if (!picked) {
      return;
    }
    this.handleFormFieldPatch(id, {
      type: 'file',
      filePath: picked.filePath,
      fileName: picked.fileName,
    });
  }

  protected handleBinarySource(source: 'file' | 'inline'): void {
    this.binarySource.set(source);
    if (source === 'file') {
      this.bodyChange.emit({ mode: 'binary', source: 'file', filePath: '', fileName: undefined });
    } else {
      this.bodyChange.emit({
        mode: 'binary',
        source: 'inline',
        contentBase64: '',
        contentType: undefined,
      });
    }
  }

  protected async handleBinaryFilePick(): Promise<void> {
    const picked = await this.filePicker.pickFile();
    if (!picked) {
      return;
    }
    this.bodyChange.emit({
      mode: 'binary',
      source: 'file',
      filePath: picked.filePath,
      fileName: picked.fileName,
    });
  }

  protected handleBinaryClear(): void {
    this.bodyChange.emit({ mode: 'binary', source: 'file', filePath: '', fileName: undefined });
  }

  protected handleBinaryInlinePatch(patch: {
    contentBase64?: string;
    contentType?: string;
  }): void {
    const b = this.body();
    if (b.mode !== 'binary') {
      return;
    }
    this.bodyChange.emit({
      mode: 'binary',
      source: 'inline',
      contentBase64: patch.contentBase64 ?? b.contentBase64 ?? '',
      contentType: patch.contentType ?? b.contentType,
      fileName: b.fileName,
    });
  }

  protected handleGraphqlPatch(patch: {
    query?: string;
    variables?: string;
    operationName?: string;
  }): void {
    const b = this.body();
    if (b.mode !== 'graphql') {
      return;
    }
    this.bodyChange.emit({ ...b, ...patch });
  }
}
