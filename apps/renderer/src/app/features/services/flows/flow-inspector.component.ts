import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  DATABASE_TYPE_LABELS,
  REQUEST_BODY_MODES,
  ensureRequestUrlScheme,
  FLOW_FRAME_DEFAULT_HEIGHT,
  FLOW_FRAME_DEFAULT_WIDTH,
  FLOW_REQUEST_SECTIONS,
  flowConfigBoolean,
  flowConfigNumber,
  flowConfigString,
  flowNodeDescriptor,
  flowRequestBodyFromConfig,
  flowRequestBodyHasContent,
  flowRequestSectionSlideDir,
  isFlowContainerKind,
  isFlowFrameKind,
  isFlowTerminalKind,
  normalizeFlowRequestBodyMode,
  normalizeFlowRequestSection,
  parseFlowCaptureRules,
  parseFlowRequestFormRows,
  parseFlowRequestKvRows,
  parsePlayStorePackageId,
  serializeFlowCaptureRules,
  serializeFlowRequestFormRows,
  serializeFlowRequestKvRows,
  syncFlowRequestPathParams,
  type FlowCaptureRule,
  type FlowCaptureRuleKind,
  type FlowGraphNode,
  type FlowNodeConfigValue,
  type FlowRequestSection,
  type RequestBodyMode,
  type RequestFormRow,
} from '@testrix/contracts';
import { TxCheckComponent, TxEmptyStateComponent, TxHintComponent, TxInputComponent, TxSelectComponent } from '@testrix/ui';

import { DesktopApiService } from '../../../core/desktop-api.service';
import { DatabaseSqlFieldComponent } from '../../database/database-sql-field.component';
import { DatabaseStore } from '../../database/database.store';
import { canFormatLanguage, codeEditorLanguageFromBodyMode } from '../../workbench/request/code-editor-language';
import { CodeEditorShellComponent } from '../../workbench/request/code-editor-shell.component';
import { RequestKvTableComponent } from '../../workbench/request/request-kv-table.component';
import { persistMockRows, withTrailingRow, type MockKeyValue } from '../../workbench/request/request-mock';
import { TokenFieldComponent } from '../../workbench/request/token-field.component';

const BODY_MODE_OPTIONS = REQUEST_BODY_MODES.map((value) => ({
  value,
  label:
    value === 'form-data'
      ? 'Form data'
      : value === 'urlencoded'
        ? 'URL encoded'
        : value.toUpperCase() === value
          ? value
          : value.charAt(0).toUpperCase() + value.slice(1),
}));

const INTERCEPT_BODY_MODES = ['none', 'json', 'text', 'html', 'xml'] as const;

const INTERCEPT_BODY_MODE_OPTIONS = INTERCEPT_BODY_MODES.map((value) => ({
  value,
  label: value === 'none' ? 'None' : value.toUpperCase(),
}));

@Component({
  selector: 'tx-flow-inspector',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    TxCheckComponent,
    TxEmptyStateComponent,
    TxHintComponent,
    TxInputComponent,
    TxSelectComponent,
    TokenFieldComponent,
    RequestKvTableComponent,
    CodeEditorShellComponent,
    DatabaseSqlFieldComponent,
  ],
  templateUrl: './flow-inspector.component.html',
  styleUrl: './flow-inspector.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlowInspectorComponent {
  private readonly desktop = inject(DesktopApiService);
  private readonly databaseStore = inject(DatabaseStore);
  private readonly bodyEditor = viewChild<CodeEditorShellComponent>('bodyEditor');
  private readonly interceptBodyEditor = viewChild<CodeEditorShellComponent>('interceptBodyEditor');
  private readonly gqlQueryEditor = viewChild<CodeEditorShellComponent>('gqlQueryEditor');
  private readonly gqlVarsEditor = viewChild<CodeEditorShellComponent>('gqlVarsEditor');
  /** Avoid reminting trailing empty-row ids on every CD (breaks focus/click). */
  private requestKvSyncKey = '';
  private interceptKvSyncKey = '';

  readonly node = input<FlowGraphNode | null>(null);
  readonly selectionCount = input(0);
  readonly connectionOptions = input<readonly { readonly value: string; readonly label: string }[]>([]);
  readonly flowOptions = input<readonly { readonly value: string; readonly label: string }[]>([]);
  readonly variables = input<readonly string[]>([]);

  readonly patch = output<Partial<FlowGraphNode>>();
  readonly configPatch = output<Readonly<Record<string, FlowNodeConfigValue>>>();
  readonly removed = output<void>();
  readonly pickSelector = output<void>();
  readonly pickingSelector = input(false);
  readonly pickDeviceSelector = output<{ readonly runPrevious: boolean }>();
  readonly pickingDeviceSelector = input(false);
  readonly devicePickError = input<string | null>(null);
  readonly selectorPickError = input<string | null>(null);

  /** When true, Pick runs preceding device steps (Launch / Wait / …), never boots. */
  readonly runPreviousDeviceSteps = signal(false);
  readonly emulatorRunning = signal(false);

  readonly requestSections = FLOW_REQUEST_SECTIONS;
  readonly requestSection = signal<FlowRequestSection>('params');
  readonly requestSlideDir = signal<'left' | 'right'>('right');
  readonly bodyModeOptions = BODY_MODE_OPTIONS;
  readonly interceptBodyModeOptions = INTERCEPT_BODY_MODE_OPTIONS;

  readonly pathParamRows = signal<MockKeyValue[]>(withTrailingRow([]));
  readonly queryParamRows = signal<MockKeyValue[]>(withTrailingRow([]));
  readonly headerRows = signal<MockKeyValue[]>(withTrailingRow([]));
  readonly formKvRows = signal<MockKeyValue[]>(withTrailingRow([]));
  readonly interceptSetHeaderRows = signal<MockKeyValue[]>(withTrailingRow([]));
  readonly interceptRemoveHeaderRows = signal<MockKeyValue[]>(withTrailingRow([]));

  readonly dbConnectionOptions = computed(() => {
    const fromStore = this.databaseStore.connections().map((item) => ({
      value: item.id,
      label: `${item.name} · ${DATABASE_TYPE_LABELS[item.type]}`,
    }));
    if (fromStore.length > 0)
      return fromStore;
    return this.connectionOptions();
  });

  readonly dbConnection = computed(() => {
    const id = this.text('connectionId');
    return id ? this.databaseStore.connectionById(id) : null;
  });

  readonly dbSchemaOptions = computed(() => {
    const connection = this.dbConnection();
    if (!connection)
      return [] as { readonly value: string; readonly label: string }[];
    const selected = connection.selectedSchemas ?? [];
    const cache = this.databaseStore.catalogByConnection()[connection.id];
    const schemas = selected.length ? selected : cache?.schemas ?? [];
    return schemas.map((schema) => ({ value: schema, label: schema }));
  });

  constructor() {
    void this.refreshEmulatorStatus();
    const off = this.desktop.api.services.onDeviceEvent(() => {
      void this.refreshEmulatorStatus();
    });
    const timer = setInterval(() => void this.refreshEmulatorStatus(), 4_000);
    inject(DestroyRef).onDestroy(() => {
      off();
      clearInterval(timer);
    });

    effect(() => {
      const node = this.node();
      if (!node || node.kind !== 'request') {
        this.requestKvSyncKey = '';
        return;
      }
      const headers = flowConfigString(node, 'headers');
      const queryParams = flowConfigString(node, 'queryParams');
      const pathParams = flowConfigString(node, 'pathParams');
      const formRows = flowConfigString(node, 'formRows');
      const key = `${node.id}\0${headers}\0${queryParams}\0${pathParams}\0${formRows}`;
      if (key === this.requestKvSyncKey)
        return;
      this.requestKvSyncKey = key;
      this.pathParamRows.set(withTrailingRow(kvRowsFromConfig(pathParams)));
      this.queryParamRows.set(withTrailingRow(kvRowsFromConfig(queryParams)));
      this.headerRows.set(withTrailingRow(kvRowsFromConfig(headers)));
      this.formKvRows.set(withTrailingRow(formRowsFromConfig(formRows)));
    });
    effect(() => {
      const node = this.node();
      if (!node || node.kind !== 'http-interceptor') {
        this.interceptKvSyncKey = '';
        return;
      }
      const setHeaders = flowConfigString(node, 'setHeaders');
      const removeHeaders = flowConfigString(node, 'removeHeaders');
      const key = `${node.id}\0${setHeaders}\0${removeHeaders}`;
      if (key === this.interceptKvSyncKey)
        return;
      this.interceptKvSyncKey = key;
      this.interceptSetHeaderRows.set(withTrailingRow(kvRowsFromConfig(normalizeInterceptHeaderRows(setHeaders))));
      this.interceptRemoveHeaderRows.set(withTrailingRow(kvRowsFromConfig(normalizeInterceptRemoveRows(removeHeaders))));
    });
    effect(() => {
      const node = this.node();
      if (!node || node.kind !== 'database')
        return;
      const connection = this.dbConnection();
      if (!connection)
        return;
      this.databaseStore.loadCatalog(connection.id);
      const options = this.dbSchemaOptions();
      const current = flowConfigString(node, 'schema');
      if (current && options.some((item) => item.value === current))
        return;
      const next = options[0]?.value ?? '';
      if (next && next !== current)
        queueMicrotask(() => this.configPatch.emit({ schema: next }));
    });
  }

  toggleRunPreviousDeviceSteps(): void {
    this.runPreviousDeviceSteps.update((value) => !value);
  }

  emitPickDeviceSelector(): void {
    if (!this.emulatorRunning() || this.pickingDeviceSelector() || this.pickingSelector())
      return;
    this.pickDeviceSelector.emit({ runPrevious: this.runPreviousDeviceSteps() });
  }

  private async refreshEmulatorStatus(): Promise<void> {
    try {
      const status = await this.desktop.api.services.device.status();
      this.emulatorRunning.set(status.emulatorRunning);
    } catch {
      this.emulatorRunning.set(false);
    }
  }

  setDatabaseConnection(connectionId: string): void {
    const connection = this.databaseStore.connectionById(connectionId);
    const selected = connection?.selectedSchemas ?? [];
    const cache = connection ? this.databaseStore.catalogByConnection()[connection.id] : undefined;
    const schemas = selected.length ? selected : cache?.schemas ?? [];
    this.configPatch.emit({
      connectionId,
      schema: schemas[0] ?? '',
    });
    if (connectionId)
      this.databaseStore.loadCatalog(connectionId);
  }

  readonly matchOptions = [
    { value: 'contains', label: 'Contains' },
    { value: 'equals', label: 'Equals' },
    { value: 'regex', label: 'Matches regex' },
  ];

  readonly listenMatchOptions = [
    { value: 'contains', label: 'Contains (URL)' },
    { value: 'equals', label: 'Equals (URL)' },
    { value: 'path', label: 'Path contains' },
    { value: 'regex', label: 'Matches regex' },
  ];

  readonly methodOptions = [
    { value: 'GET', label: 'GET' },
    { value: 'POST', label: 'POST' },
    { value: 'PUT', label: 'PUT' },
    { value: 'PATCH', label: 'PATCH' },
    { value: 'DELETE', label: 'DELETE' },
  ];

  readonly listenMethodOptions = [
    { value: '*', label: 'Any method' },
    ...this.methodOptions,
    { value: 'OPTIONS', label: 'OPTIONS' },
    { value: 'HEAD', label: 'HEAD' },
  ];

  readonly httpStageOptions = [
    { value: 'request', label: 'Request' },
    { value: 'response', label: 'Response' },
  ];

  readonly interceptActionOptions = [
    { value: 'passthrough', label: 'Passthrough (edit)' },
    { value: 'mock', label: 'Mock response' },
    { value: 'block', label: 'Block' },
  ];

  readonly interceptBodyMode = computed((): string => {
    const raw = this.text('bodyMode', 'json');
    return (INTERCEPT_BODY_MODES as readonly string[]).includes(raw) ? raw : 'json';
  });

  readonly interceptBodyLanguage = computed(() => codeEditorLanguageFromBodyMode(this.interceptBodyMode()));

  readonly canFormatInterceptBody = computed(() => canFormatLanguage(this.interceptBodyLanguage()));

  readonly deviceOptions = computed(() => {
    const devices = this.desktop.emulator().devices;
    const selected = this.desktop.emulator().selectedDeviceId;
    const options = devices.map((item) => ({
      value: item.id,
      label: item.id === selected ? `${item.name} (selected)` : item.name,
    }));
    return [{ value: '', label: devices.length ? 'Emulator selection' : 'Add a device in Emulator' }, ...options];
  });

  readonly captureKindOptions = [
    { value: 'json', label: 'JSON path' },
    { value: 'header', label: 'Header' },
    { value: 'body', label: 'Whole body' },
    { value: 'status', label: 'Status code' },
  ];

  readonly frameDefaultWidth = FLOW_FRAME_DEFAULT_WIDTH;
  readonly frameDefaultHeight = FLOW_FRAME_DEFAULT_HEIGHT;

  readonly requestBodyMode = computed((): RequestBodyMode =>
    normalizeFlowRequestBodyMode(this.text('bodyMode'), this.text('body')),
  );

  readonly requestBodyLanguage = computed(() => codeEditorLanguageFromBodyMode(this.requestBodyMode()));

  readonly canFormatBody = computed(() => canFormatLanguage(this.requestBodyLanguage()));

  listenPatternLabel(): string {
    const mode = this.text('match', 'contains');
    if (mode === 'path')
      return 'Path';
    if (mode === 'regex')
      return 'Regex';
    return 'URL';
  }

  readonly descriptor = computed(() => {
    const node = this.node();
    return node ? flowNodeDescriptor(node.kind) : null;
  });

  readonly isContainer = computed(() => {
    const node = this.node();
    return node ? isFlowContainerKind(node.kind) : false;
  });

  readonly isFrame = computed(() => {
    const node = this.node();
    return node ? isFlowFrameKind(node.kind) : false;
  });

  readonly isTerminal = computed(() => {
    const node = this.node();
    return node ? isFlowTerminalKind(node.kind) : false;
  });

  readonly captureRules = computed(() => {
    const node = this.node();
    if (!node || node.kind !== 'capture')
      return [] as FlowCaptureRule[];
    return parseFlowCaptureRules(flowConfigString(node, 'rules'));
  });

  text(key: string, fallback = ''): string {
    const node = this.node();
    return node ? flowConfigString(node, key, fallback) : fallback;
  }

  num(key: string, fallback = 0): string {
    const node = this.node();
    return String(node ? flowConfigNumber(node, key, fallback) : fallback);
  }

  flag(key: string, fallback = false): boolean {
    const node = this.node();
    return node ? flowConfigBoolean(node, key, fallback) : fallback;
  }

  setText(key: string, value: string): void {
    const playId =
      key === 'packageName' || key === 'fdroidPackage' ? parsePlayStorePackageId(value) : null;
    this.configPatch.emit({ [key]: playId ?? value });
  }

  setDevice(deviceId: string): void {
    const device = this.desktop.emulator().devices.find((item) => item.id === deviceId);
    this.configPatch.emit({
      deviceId,
      deviceName: device?.name ?? '',
    });
  }

  /** Normalize open URL on blur (adds https:// when missing). */
  commitUrl(value: string): void {
    const next = ensureRequestUrlScheme(value.trim());
    if (next !== this.text('url'))
      this.setText('url', next);
    else if (next !== value)
      this.setText('url', next);
  }

  /** Request-node URL blur: scheme + keep `:path` params in sync. */
  commitRequestUrl(value: string): void {
    const next = ensureRequestUrlScheme(value.trim());
    this.setRequestUrl(next !== this.text('url') || next !== value ? next : value.trim());
  }

  setRequestUrl(value: string): void {
    const synced = syncFlowRequestPathParams(value, persistMockRows(this.pathParamRows()));
    const next = withTrailingRow(
      synced.map((row) => ({
        id: row.id,
        key: row.key,
        value: row.value,
        enabled: row.enabled,
        description: row.description,
      })),
    );
    this.pathParamRows.set(next);
    const pathParams = serializeFlowRequestKvRows(persistMockRows(next));
    this.rememberRequestKvSync({ pathParams });
    this.configPatch.emit({
      url: value,
      pathParams,
    });
  }

  setRequestSection(section: string): void {
    const next = normalizeFlowRequestSection(section);
    const current = this.requestSection();
    if (next === current)
      return;
    this.requestSlideDir.set(flowRequestSectionSlideDir(current, next));
    this.requestSection.set(next);
  }

  setRequestBodyMode(value: string): void {
    if (!(REQUEST_BODY_MODES as readonly string[]).includes(value))
      return;
    this.configPatch.emit({ bodyMode: value });
  }

  handleFormatBody(): void {
    if (this.requestBodyMode() === 'graphql') {
      this.gqlQueryEditor()?.format();
      this.gqlVarsEditor()?.format();
      return;
    }
    this.bodyEditor()?.format();
  }

  setInterceptBodyMode(value: string): void {
    if (!(INTERCEPT_BODY_MODES as readonly string[]).includes(value))
      return;
    this.configPatch.emit({ bodyMode: value });
  }

  handleFormatInterceptBody(): void {
    this.interceptBodyEditor()?.format();
  }

  setInterceptKvRows(key: 'setHeaders' | 'removeHeaders', rows: readonly MockKeyValue[]): void {
    const next = [...rows];
    if (key === 'setHeaders')
      this.interceptSetHeaderRows.set(next);
    else
      this.interceptRemoveHeaderRows.set(next);
    const serialized = serializeFlowRequestKvRows(persistMockRows(next));
    this.interceptKvSyncKey = '';
    this.configPatch.emit({ [key]: serialized });
  }

  requestSectionCount(section: FlowRequestSection): number {
    if (section === 'body') {
      const body = flowRequestBodyFromConfig({
        bodyMode: this.text('bodyMode'),
        body: this.text('body'),
        formRows: serializeFlowRequestFormRows(this.formRowsForPersist(this.formKvRows())),
        graphqlQuery: this.text('graphqlQuery'),
        graphqlVariables: this.text('graphqlVariables'),
        graphqlOperation: this.text('graphqlOperation'),
        binaryName: this.text('binaryName'),
        binaryType: this.text('binaryType'),
        binaryBase64: this.text('binaryBase64'),
      });
      return flowRequestBodyHasContent(body) ? 1 : 0;
    }
    if (section === 'params') {
      const query = persistMockRows(this.queryParamRows()).filter((row) => row.enabled && row.key.trim()).length;
      const path = persistMockRows(this.pathParamRows()).filter((row) => row.enabled && row.key.trim()).length;
      return query + path;
    }
    return persistMockRows(this.headerRows()).filter((row) => row.enabled && row.key.trim()).length;
  }

  setRequestKvRows(key: 'headers' | 'queryParams' | 'pathParams', rows: readonly MockKeyValue[]): void {
    const next = [...rows];
    if (key === 'headers')
      this.headerRows.set(next);
    else if (key === 'queryParams')
      this.queryParamRows.set(next);
    else
      this.pathParamRows.set(next);
    const serialized = serializeFlowRequestKvRows(persistMockRows(next));
    this.rememberRequestKvSync({ [key]: serialized });
    this.configPatch.emit({ [key]: serialized });
  }

  setRequestFormKvRows(rows: readonly MockKeyValue[]): void {
    const next = [...rows];
    this.formKvRows.set(next);
    const serialized = serializeFlowRequestFormRows(this.formRowsForPersist(next));
    this.rememberRequestKvSync({ formRows: serialized });
    this.configPatch.emit({ formRows: serialized });
  }

  private formRowsForPersist(rows: readonly MockKeyValue[]): RequestFormRow[] {
    const previous = new Map(parseFlowRequestFormRows(this.text('formRows')).map((row) => [row.id, row]));
    return persistMockRows([...rows]).map((row) => {
      const prior = previous.get(row.id);
      return {
        id: row.id,
        key: row.key,
        value: row.value,
        enabled: row.enabled,
        description: row.description,
        kind: prior?.kind ?? 'text',
        fileName: prior?.fileName ?? '',
        contentType: prior?.contentType ?? '',
      };
    });
  }

  private rememberRequestKvSync(patch: {
    readonly headers?: string;
    readonly queryParams?: string;
    readonly pathParams?: string;
    readonly formRows?: string;
  }): void {
    const node = this.node();
    if (!node || node.kind !== 'request')
      return;
    const headers = patch.headers ?? flowConfigString(node, 'headers');
    const queryParams = patch.queryParams ?? flowConfigString(node, 'queryParams');
    const pathParams = patch.pathParams ?? flowConfigString(node, 'pathParams');
    const formRows = patch.formRows ?? flowConfigString(node, 'formRows');
    this.requestKvSyncKey = `${node.id}\0${headers}\0${queryParams}\0${pathParams}\0${formRows}`;
  }

  setNumber(key: string, value: string, fallback: number): void {
    const parsed = Number(value);
    this.configPatch.emit({ [key]: Number.isFinite(parsed) ? parsed : fallback });
  }

  setFlag(key: string, value: boolean): void {
    this.configPatch.emit({ [key]: value });
  }

  captureNeedsPath(kind: string): boolean {
    return kind === 'json' || kind === 'header';
  }

  capturePathLabel(kind: string): string {
    return kind === 'header' ? 'Header name' : 'JSON path';
  }

  addCaptureRule(): void {
    const next: FlowCaptureRule[] = [
      ...this.captureRules(),
      { kind: 'json', path: '', name: '' },
    ];
    this.setText('rules', serializeFlowCaptureRules(next));
  }

  removeCaptureRule(index: number): void {
    const next = this.captureRules().filter((_, i) => i !== index);
    this.setText(
      'rules',
      serializeFlowCaptureRules(next.length > 0 ? next : [{ kind: 'json', path: '', name: '' }]),
    );
  }

  patchCaptureRule(index: number, patch: { kind?: string; path?: string; name?: string }): void {
    const next = this.captureRules().map((rule, i) => {
      if (i !== index)
        return rule;
      const kind = (patch.kind ?? rule.kind) as FlowCaptureRuleKind;
      return {
        kind,
        path: patch.path ?? rule.path,
        name: patch.name ?? rule.name,
      };
    });
    this.setText('rules', serializeFlowCaptureRules(next));
  }
}

function kvRowsFromConfig(raw: string): MockKeyValue[] {
  return parseFlowRequestKvRows(raw).map((row) => ({
    id: row.id,
    key: row.key,
    value: row.value,
    enabled: row.enabled,
    description: row.description,
  }));
}

/** Accepts KV-row JSON, legacy `{Header:value}` objects, or empty. */
function normalizeInterceptHeaderRows(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '{}')
    return '[]';
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed))
      return trimmed;
    if (parsed && typeof parsed === 'object') {
      const rows = Object.entries(parsed as Record<string, unknown>).map(([key, value], index) => ({
        id: `ih_${index}`,
        enabled: true,
        key,
        value: value == null ? '' : String(value),
        description: '',
      }));
      return serializeFlowRequestKvRows(rows);
    }
  } catch {
    /* ignore */
  }
  return '[]';
}

/** Accepts KV-row JSON, string arrays, or legacy comma-separated names. */
function normalizeInterceptRemoveRows(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed)
    return '[]';
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      if (parsed.every((item) => typeof item === 'string')) {
        const rows = (parsed as string[])
          .map((key) => key.trim())
          .filter(Boolean)
          .map((key, index) => ({
            id: `ir_${index}`,
            enabled: true,
            key,
            value: '',
            description: '',
          }));
        return serializeFlowRequestKvRows(rows);
      }
      return trimmed;
    }
  } catch {
    /* comma list */
  }
  const rows = trimmed
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((key, index) => ({
      id: `ir_${index}`,
      enabled: true,
      key,
      value: '',
      description: '',
    }));
  return serializeFlowRequestKvRows(rows);
}

function formRowsFromConfig(raw: string): MockKeyValue[] {
  return parseFlowRequestFormRows(raw).map((row) => ({
    id: row.id,
    key: row.key,
    value: row.value,
    enabled: row.enabled,
    description: row.description,
  }));
}
