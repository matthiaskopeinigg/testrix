import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
  type AnimationCallbackEvent,
} from '@angular/core';
import {
  environmentVariableMap,
  normalizeMockSection,
  type FlowRunEventDetail,
  type MockActivityEvent,
  type MockHeader,
  type MockSection,
} from '@testrix/contracts';
import {
  TxCheckComponent,
  TxEmptyStateComponent,
  TxHintComponent,
  TxInputComponent,
  TxSelectComponent,
} from '@testrix/ui';

import { runPaneEnter, runPaneLeave } from '../../../core/pane-slide-anim';
import { EnvironmentsStore } from '../../environments/environments.store';
import { canFormatLanguage, codeEditorLanguageFromBodyMode } from '../../workbench/request/code-editor-language';
import { CodeEditorShellComponent } from '../../workbench/request/code-editor-shell.component';
import { RequestKvTableComponent } from '../../workbench/request/request-kv-table.component';
import { withTrailingRow, type MockKeyValue } from '../../workbench/request/request-mock';
import { TokenFieldComponent } from '../../workbench/request/token-field.component';
import { WorkbenchStore, type WorkbenchTab } from '../../workbench/workbench.store';
import { FlowRunExchangeComponent } from '../flows/flow-run-exchange.component';
import { ServicesStore } from '../services.store';

interface SectionItem {
  readonly id: MockSection;
  readonly label: string;
}

interface MockActivityRow {
  readonly key: string;
  readonly event: MockActivityEvent;
}

const SECTION_ITEMS: readonly SectionItem[] = [
  { id: 'matchers', label: 'Matching' },
  { id: 'response', label: 'Response' },
  { id: 'advanced', label: 'Advanced' },
  { id: 'activity', label: 'Activity' },
];

const SECTION_ORDER: readonly MockSection[] = ['matchers', 'response', 'advanced', 'activity'];

const METHOD_OPTIONS = [
  { value: 'GET', label: 'GET' },
  { value: 'POST', label: 'POST' },
  { value: 'PUT', label: 'PUT' },
  { value: 'PATCH', label: 'PATCH' },
  { value: 'DELETE', label: 'DELETE' },
  { value: 'OPTIONS', label: 'OPTIONS' },
  { value: 'HEAD', label: 'HEAD' },
  { value: '*', label: 'Any method' },
];

const MATCH_OPTIONS = [
  { value: 'path', label: 'Path contains' },
  { value: 'contains', label: 'Contains (URL)' },
  { value: 'equals', label: 'Equals (URL)' },
  { value: 'regex', label: 'Matches regex' },
];

const BODY_MODE_OPTIONS = [
  { value: 'json', label: 'JSON' },
  { value: 'text', label: 'Text' },
  { value: 'html', label: 'HTML' },
  { value: 'xml', label: 'XML' },
];

let headerSeq = 0;

@Component({
  selector: 'tx-mock-editor',
  standalone: true,
  imports: [
    TxCheckComponent,
    TxEmptyStateComponent,
    TxHintComponent,
    TxInputComponent,
    TxSelectComponent,
    TokenFieldComponent,
    RequestKvTableComponent,
    CodeEditorShellComponent,
    FlowRunExchangeComponent,
  ],
  templateUrl: './mock-editor.component.html',
  styleUrl: './mock-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display:flex;flex:1;min-height:0;' },
})
export class MockEditorComponent {
  readonly tab = input.required<WorkbenchTab>();
  readonly store = inject(ServicesStore);
  readonly workbench = inject(WorkbenchStore);
  private readonly environments = inject(EnvironmentsStore);

  private readonly bodyEditor = viewChild<CodeEditorShellComponent>('bodyEditor');

  readonly sectionSlideDir = signal<'left' | 'right' | null>(null);
  readonly section = computed(() => {
    const next = normalizeMockSection(this.tab().serviceSection);
    return next === 'overview' ? 'matchers' : next;
  });
  readonly headerRows = signal<MockKeyValue[]>(withTrailingRow([]));
  readonly selectedActivityKey = signal<string | null>(null);
  private headerSyncKey = '';
  private lastActivityTabId: string | null = null;
  private lastActivityHeadKey: string | null = null;

  readonly sections = SECTION_ITEMS;
  readonly methodOptions = METHOD_OPTIONS;
  readonly matchOptions = MATCH_OPTIONS;
  readonly bodyModeOptions = BODY_MODE_OPTIONS;

  readonly mock = computed(() => this.store.findMock(this.tab().nodeId));

  /** Newest-first hits for this endpoint (matches only). */
  readonly endpointActivity = computed((): readonly MockActivityRow[] => {
    const id = this.mock()?.id;
    if (!id)
      return [];
    const rows: MockActivityRow[] = [];
    const events = this.store.mockActivity();
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const event = events[i];
      if (!event || event.kind !== 'match' || event.endpointId !== id)
        continue;
      rows.push({ key: activityKey(event, i), event });
      if (rows.length >= 80)
        break;
    }
    return rows;
  });

  readonly selectedActivity = computed((): MockActivityRow | null => {
    const key = this.selectedActivityKey();
    const rows = this.endpointActivity();
    if (key) {
      const found = rows.find((row) => row.key === key);
      if (found)
        return found;
    }
    return rows[0] ?? null;
  });

  readonly selectedExchange = computed((): FlowRunEventDetail | null => {
    const row = this.selectedActivity();
    if (!row)
      return null;
    return activityToExchange(row.event);
  });

  readonly placeholderVariables = computed(() => {
    const env = this.environments.items().find((item) => item.id === this.environments.activeId());
    return env ? Object.keys(environmentVariableMap(env.variables)) : [];
  });

  readonly bodyLanguage = computed(() =>
    codeEditorLanguageFromBodyMode(this.mock()?.bodyMode ?? 'json'),
  );

  readonly canFormatBody = computed(() => canFormatLanguage(this.bodyLanguage()));

  constructor() {
    // Rewrite legacy/missing section ids onto the tab so session keeps a real pane.
    effect(() => {
      const tab = this.tab();
      const next = normalizeMockSection(tab.serviceSection);
      const section = next === 'overview' ? 'matchers' : next;
      if (tab.serviceSection === section)
        return;
      this.workbench.patchTab(tab.id, { serviceSection: section });
    });

    effect(() => {
      const tabId = this.tab().id;
      if (tabId === this.lastActivityTabId)
        return;
      this.lastActivityTabId = tabId;
      untracked(() => {
        this.sectionSlideDir.set(null);
        this.selectedActivityKey.set(null);
        this.lastActivityHeadKey = null;
      });
    });

    effect(() => {
      const artifact = this.mock();
      if (!artifact) {
        this.headerSyncKey = '';
        return;
      }
      const key = `${artifact.id}\0${JSON.stringify(artifact.headers)}`;
      if (key === this.headerSyncKey)
        return;
      this.headerSyncKey = key;
      this.headerRows.set(withTrailingRow(headersToRows(artifact.headers)));
    });

    effect(() => {
      const head = this.endpointActivity()[0];
      if (!head)
        return;
      if (head.key === this.lastActivityHeadKey)
        return;
      const previousHead = this.lastActivityHeadKey;
      this.lastActivityHeadKey = head.key;
      const selected = this.selectedActivityKey();
      if (!selected || selected === previousHead)
        this.selectedActivityKey.set(head.key);
    });
  }

  handleSection(id: MockSection): void {
    const next = id === 'overview' ? 'matchers' : id;
    if (next === this.section())
      return;
    const current = SECTION_ORDER.indexOf(this.section());
    const target = SECTION_ORDER.indexOf(next);
    this.sectionSlideDir.set(target >= current ? 'right' : 'left');
    this.workbench.patchTab(this.tab().id, { serviceSection: next });
  }

  handlePaneEnter(event: AnimationCallbackEvent): void {
    runPaneEnter(event, this.sectionSlideDir());
  }

  handlePaneLeave(event: AnimationCallbackEvent): void {
    runPaneLeave(event, this.sectionSlideDir());
  }

  patchName(name: string): void {
    const artifact = this.mock();
    if (!artifact)
      return;
    void this.store.patchMock(artifact.id, { name });
    this.workbench.patchTab(this.tab().id, { title: name });
  }

  patchField<K extends keyof NonNullable<ReturnType<MockEditorComponent['mock']>>>(
    key: K,
    value: NonNullable<ReturnType<MockEditorComponent['mock']>>[K],
  ): void {
    const artifact = this.mock();
    if (!artifact)
      return;
    void this.store.patchMock(artifact.id, { [key]: value } as Partial<typeof artifact>);
  }

  patchNumber(key: 'statusCode' | 'delayMs' | 'priority', raw: string | number, fallback: number): void {
    const value = typeof raw === 'number' ? raw : Number(raw);
    this.patchField(key, Number.isFinite(value) ? value : fallback);
  }

  handleHeaders(rows: readonly MockKeyValue[]): void {
    const next = [...rows];
    this.headerRows.set(next);
    this.headerSyncKey = '';
    this.patchField(
      'headers',
      next
        .filter((row) => row.key.trim() || row.value.trim())
        .map((row) => ({ key: row.key, value: row.value }) satisfies MockHeader),
    );
  }

  handleFormatBody(): void {
    this.bodyEditor()?.format();
  }

  selectActivity(key: string): void {
    this.selectedActivityKey.set(key);
  }

  formatActivityTime(at: number | undefined): string {
    if (!at)
      return '';
    return new Date(at).toLocaleTimeString();
  }
}

function activityKey(event: MockActivityEvent, index: number): string {
  return `${event.at ?? 0}\0${event.method}\0${event.url}\0${index}`;
}

function activityToExchange(event: MockActivityEvent): FlowRunEventDetail {
  return {
    kind: 'request',
    method: event.method,
    url: event.url,
    status: event.status,
    requestHeaders: event.requestHeaders ?? {},
    requestBody: event.requestBody ?? '',
    headers: event.headers ?? {},
    body: event.body ?? '',
  };
}

function headersToRows(headers: readonly MockHeader[]): MockKeyValue[] {
  return headers.map((header) => {
    headerSeq += 1;
    return {
      id: `mh_${headerSeq}`,
      key: header.key,
      value: header.value,
      enabled: true,
      description: '',
    };
  });
}
