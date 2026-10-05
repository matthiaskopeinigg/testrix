import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
  type AnimationCallbackEvent,
} from '@angular/core';
import {
  environmentVariableMap,
  INTERCEPT_SECTIONS,
  normalizeInterceptSection,
  parseFlowRequestKvRows,
  serializeFlowRequestKvRows,
  type FlowRunEventDetail,
  type InterceptAction,
  type InterceptActivityEntry,
  type InterceptMode,
  type InterceptSection,
} from '@testrix/contracts';
import {
  TxEmptyStateComponent,
  TxHintComponent,
  TxInputComponent,
  TxOverlayComponent,
  TxOverlayHostDirective,
  TxSelectComponent,
} from '@testrix/ui';

import { runPaneEnter, runPaneLeave } from '../../../core/pane-slide-anim';
import { DesktopApiService } from '../../../core/desktop-api.service';
import { EnvironmentsStore } from '../../environments/environments.store';
import { canFormatLanguage, codeEditorLanguageFromBodyMode } from '../../workbench/request/code-editor-language';
import { CodeEditorShellComponent } from '../../workbench/request/code-editor-shell.component';
import { RequestKvTableComponent } from '../../workbench/request/request-kv-table.component';
import { persistMockRows, withTrailingRow, type MockKeyValue } from '../../workbench/request/request-mock';
import { TokenFieldComponent } from '../../workbench/request/token-field.component';
import { WorkbenchStore, type WorkbenchTab } from '../../workbench/workbench.store';
import { FlowRunExchangeComponent } from '../flows/flow-run-exchange.component';
import { ServicesStore } from '../services.store';

interface SectionItem {
  readonly id: InterceptSection;
  readonly label: string;
}

const SECTION_ITEMS: readonly SectionItem[] = [
  { id: 'match', label: 'Match' },
  { id: 'action', label: 'Action' },
  { id: 'activity', label: 'Activity' },
];

const MODE_OPTIONS = [
  { value: 'browser', label: 'Browser' },
  { value: 'device', label: 'Device' },
];

const METHOD_OPTIONS = [
  { value: '*', label: 'Any method' },
  { value: 'GET', label: 'GET' },
  { value: 'POST', label: 'POST' },
  { value: 'PUT', label: 'PUT' },
  { value: 'PATCH', label: 'PATCH' },
  { value: 'DELETE', label: 'DELETE' },
  { value: 'OPTIONS', label: 'OPTIONS' },
  { value: 'HEAD', label: 'HEAD' },
];

const MATCH_OPTIONS = [
  { value: 'contains', label: 'Contains (URL)' },
  { value: 'equals', label: 'Equals (URL)' },
  { value: 'path', label: 'Path contains' },
  { value: 'regex', label: 'Matches regex' },
];

const STAGE_OPTIONS = [
  { value: 'request', label: 'Request' },
  { value: 'response', label: 'Response' },
];

const ACTION_OPTIONS = [
  { value: 'passthrough', label: 'Passthrough (edit)' },
  { value: 'mock', label: 'Mock response' },
  { value: 'block', label: 'Block' },
];

const BODY_MODE_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'json', label: 'JSON' },
  { value: 'text', label: 'Text' },
  { value: 'html', label: 'HTML' },
  { value: 'xml', label: 'XML' },
];

let kvSeq = 0;

@Component({
  selector: 'tx-intercept-editor',
  standalone: true,
  imports: [
    TxEmptyStateComponent,
    TxHintComponent,
    TxInputComponent,
    TxSelectComponent,
    TxOverlayComponent,
    TxOverlayHostDirective,
    TokenFieldComponent,
    RequestKvTableComponent,
    CodeEditorShellComponent,
    FlowRunExchangeComponent,
  ],
  templateUrl: './intercept-editor.component.html',
  styleUrl: './intercept-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display:flex;flex:1;min-height:0;' },
})
export class InterceptEditorComponent {
  readonly tab = input.required<WorkbenchTab>();
  readonly store = inject(ServicesStore);
  readonly workbench = inject(WorkbenchStore);
  private readonly desktop = inject(DesktopApiService);
  private readonly environments = inject(EnvironmentsStore);

  private readonly bodyEditor = viewChild<CodeEditorShellComponent>('bodyEditor');

  readonly sectionSlideDir = signal<'left' | 'right' | null>(null);
  readonly selectedHitId = signal<string | null>(null);
  readonly section = computed(() => normalizeInterceptSection(this.tab().serviceSection));
  readonly setHeaderRows = signal<MockKeyValue[]>(withTrailingRow([]));
  readonly removeHeaderRows = signal<MockKeyValue[]>(withTrailingRow([]));
  private kvSyncKey = '';

  readonly sections = SECTION_ITEMS;
  readonly modeOptions = MODE_OPTIONS;
  readonly methodOptions = METHOD_OPTIONS;
  readonly matchOptions = MATCH_OPTIONS;
  readonly stageOptions = STAGE_OPTIONS;
  readonly actionOptions = ACTION_OPTIONS;
  readonly bodyModeOptions = BODY_MODE_OPTIONS;

  readonly rule = computed(() => this.store.findIntercept(this.tab().nodeId));
  readonly isRunning = computed(() => this.store.activeInterceptRuleId() === this.tab().nodeId);
  readonly startError = computed(() => {
    if (this.store.activeInterceptRuleId() && this.store.activeInterceptRuleId() !== this.tab().nodeId)
      return null;
    return this.store.interceptStatus().error;
  });

  readonly deviceOptions = computed(() => {
    const devices = this.desktop.emulator().devices;
    return [
      { value: '', label: devices.length ? 'Select device' : 'No devices' },
      ...devices.map((device) => ({
        value: device.id,
        label: device.name || device.id,
      })),
    ];
  });

  readonly placeholderVariables = computed(() => {
    const env = this.environments.items().find((item) => item.id === this.environments.activeId());
    return env ? Object.keys(environmentVariableMap(env.variables)) : [];
  });

  readonly bodyLanguage = computed(() =>
    codeEditorLanguageFromBodyMode(this.rule()?.bodyMode === 'none' ? 'text' : (this.rule()?.bodyMode ?? 'json')),
  );

  readonly canFormatBody = computed(() => {
    const mode = this.rule()?.bodyMode ?? 'json';
    return mode !== 'none' && canFormatLanguage(this.bodyLanguage());
  });

  readonly activity = computed(() => this.rule()?.activity ?? []);

  readonly selectedHit = computed((): InterceptActivityEntry | null => {
    const id = this.selectedHitId();
    if (!id)
      return null;
    return this.activity().find((hit) => hit.id === id) ?? null;
  });

  readonly selectedExchange = computed((): FlowRunEventDetail | null => {
    const hit = this.selectedHit();
    if (!hit)
      return null;
    return {
      kind: 'interceptor',
      method: hit.method,
      url: hit.url,
      status: hit.status,
      body: hit.body,
      requestBody: hit.requestBody,
      headers: hit.headers,
      requestHeaders: hit.requestHeaders,
      hit: true,
    };
  });

  constructor() {
    effect(() => {
      const tab = this.tab();
      const next = normalizeInterceptSection(tab.serviceSection);
      if (tab.serviceSection === next)
        return;
      this.workbench.patchTab(tab.id, { serviceSection: next });
    });

    effect(() => {
      const artifact = this.rule();
      if (!artifact) {
        this.kvSyncKey = '';
        return;
      }
      const key = `${artifact.id}\0${artifact.setHeaders}\0${artifact.removeHeaders}`;
      if (key === this.kvSyncKey)
        return;
      this.kvSyncKey = key;
      this.setHeaderRows.set(withTrailingRow(kvRowsFromSerialized(normalizeSetHeaders(artifact.setHeaders))));
      this.removeHeaderRows.set(withTrailingRow(kvRowsFromSerialized(normalizeRemoveHeaders(artifact.removeHeaders))));
    });
  }

  handleSection(id: InterceptSection): void {
    if (id === this.section())
      return;
    const current = INTERCEPT_SECTIONS.indexOf(this.section());
    const target = INTERCEPT_SECTIONS.indexOf(id);
    this.sectionSlideDir.set(target >= current ? 'right' : 'left');
    this.workbench.patchTab(this.tab().id, { serviceSection: id });
  }

  handlePaneEnter(event: AnimationCallbackEvent): void {
    runPaneEnter(event, this.sectionSlideDir());
  }

  handlePaneLeave(event: AnimationCallbackEvent): void {
    runPaneLeave(event, this.sectionSlideDir());
  }

  patchName(name: string): void {
    const artifact = this.rule();
    if (!artifact)
      return;
    void this.store.patchIntercept(artifact.id, { name });
    this.workbench.patchTab(this.tab().id, { title: name });
  }

  patchField<K extends keyof NonNullable<ReturnType<InterceptEditorComponent['rule']>>>(
    key: K,
    value: NonNullable<ReturnType<InterceptEditorComponent['rule']>>[K],
  ): void {
    const artifact = this.rule();
    if (!artifact)
      return;
    void this.store.patchIntercept(artifact.id, { [key]: value } as Partial<typeof artifact>);
  }

  patchMode(value: string): void {
    const mode: InterceptMode = value === 'device' ? 'device' : 'browser';
    this.patchField('mode', mode);
  }

  patchAction(value: string): void {
    const action: InterceptAction =
      value === 'mock' || value === 'block' ? value : 'passthrough';
    this.patchField('action', action);
  }

  patchStage(value: string): void {
    this.patchField('stage', value === 'response' ? 'response' : 'request');
  }

  patchNumber(key: 'mockStatus', raw: string | number, fallback: number): void {
    const value = typeof raw === 'number' ? raw : Number(raw);
    this.patchField(key, Number.isFinite(value) ? value : fallback);
  }

  handleSetHeaders(rows: readonly MockKeyValue[]): void {
    const next = [...rows];
    this.setHeaderRows.set(next);
    this.kvSyncKey = '';
    this.patchField('setHeaders', serializeFlowRequestKvRows(persistMockRows(next)));
  }

  handleRemoveHeaders(rows: readonly MockKeyValue[]): void {
    const next = [...rows];
    this.removeHeaderRows.set(next);
    this.kvSyncKey = '';
    this.patchField('removeHeaders', serializeFlowRequestKvRows(persistMockRows(next)));
  }

  handleFormatBody(): void {
    this.bodyEditor()?.format();
  }

  openHit(hit: InterceptActivityEntry): void {
    this.selectedHitId.set(hit.id);
  }

  closeHit(): void {
    this.selectedHitId.set(null);
  }

  clearActivity(): void {
    const artifact = this.rule();
    if (!artifact)
      return;
    this.selectedHitId.set(null);
    void this.store.clearInterceptActivity(artifact.id);
  }

  startRule(): void {
    const artifact = this.rule();
    if (!artifact)
      return;
    void this.store.startIntercept(artifact.id);
  }

  stopRule(): void {
    void this.store.stopIntercept();
  }

  trackHit(_index: number, hit: InterceptActivityEntry): string {
    return hit.id;
  }

  formatHitTime(at: number): string {
    return new Date(at).toLocaleTimeString();
  }

  statusTone(status: number): string {
    if (status >= 500)
      return 'server';
    if (status >= 400)
      return 'client';
    if (status >= 300)
      return 'redirect';
    if (status > 0)
      return 'ok';
    return 'muted';
  }
}

function kvRowsFromSerialized(raw: string): MockKeyValue[] {
  return parseFlowRequestKvRows(raw).map((row) => {
    kvSeq += 1;
    return {
      id: row.id || `ix_${kvSeq}`,
      key: row.key,
      value: row.value,
      enabled: row.enabled,
      description: row.description,
    };
  });
}

function normalizeSetHeaders(raw: string): string {
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

function normalizeRemoveHeaders(raw: string): string {
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
