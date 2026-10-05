import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  environmentVariableMap,
  TRAFFIC_RESOURCE_FILTER_OPTIONS,
  classifyTrafficResource,
  normalizeListenerSection,
  type FlowRunEventDetail,
  type ListenerActivityEntry,
  type ListenerMode,
  type TrafficResourceFilter,
} from '@testrix/contracts';
import {
  TxEmptyStateComponent,
  TxHintComponent,
  TxInputComponent,
  TxOverlayComponent,
  TxOverlayHostDirective,
  TxSelectComponent,
} from '@testrix/ui';

import { DesktopApiService } from '../../../core/desktop-api.service';
import { EnvironmentsStore } from '../../environments/environments.store';
import { TokenFieldComponent } from '../../workbench/request/token-field.component';
import { WorkbenchStore, type WorkbenchTab } from '../../workbench/workbench.store';
import { FlowRunExchangeComponent } from '../flows/flow-run-exchange.component';
import { ServicesStore } from '../services.store';

type NetworkSort = 'time-desc' | 'time-asc' | 'method' | 'status' | 'url';

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

const SORT_OPTIONS = [
  { value: 'time-desc', label: 'Newest first' },
  { value: 'time-asc', label: 'Oldest first' },
  { value: 'method', label: 'Method' },
  { value: 'status', label: 'Status' },
  { value: 'url', label: 'URL' },
];

@Component({
  selector: 'tx-listener-editor',
  standalone: true,
  imports: [
    TxEmptyStateComponent,
    TxHintComponent,
    TxInputComponent,
    TxSelectComponent,
    TxOverlayComponent,
    TxOverlayHostDirective,
    TokenFieldComponent,
    FlowRunExchangeComponent,
  ],
  templateUrl: './listener-editor.component.html',
  styleUrl: './listener-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display:flex;flex:1;min-height:0;' },
})
export class ListenerEditorComponent {
  readonly tab = input.required<WorkbenchTab>();
  readonly store = inject(ServicesStore);
  readonly workbench = inject(WorkbenchStore);
  private readonly desktop = inject(DesktopApiService);
  private readonly environments = inject(EnvironmentsStore);

  readonly modeOptions = MODE_OPTIONS;
  readonly methodOptions = METHOD_OPTIONS;
  readonly sortOptions = SORT_OPTIONS;
  readonly resourceFilterOptions = TRAFFIC_RESOURCE_FILTER_OPTIONS;

  readonly selectedHitId = signal<string | null>(null);

  readonly listener = computed(() => this.store.findListener(this.tab().nodeId));
  readonly networkUi = computed(() => this.workbench.listenerUi(this.tab().nodeId));
  readonly searchQuery = computed(() => this.networkUi().search);
  readonly sortBy = computed(() => this.networkUi().sort);
  readonly isRunning = computed(() => this.store.activeListenerId() === this.tab().nodeId);
  readonly startError = computed(() => {
    if (this.store.activeListenerId() && this.store.activeListenerId() !== this.tab().nodeId)
      return null;
    return this.store.listenerStatus().error;
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

  readonly activity = computed(() => this.listener()?.activity ?? []);

  readonly resourceCounts = computed(() => {
    const counts: Record<string, number> = { all: 0 };
    for (const option of TRAFFIC_RESOURCE_FILTER_OPTIONS)
      counts[option.value] = 0;
    for (const hit of this.activity()) {
      counts['all'] = (counts['all'] ?? 0) + 1;
      const kind = classifyListenerHit(hit);
      counts[kind] = (counts[kind] ?? 0) + 1;
    }
    return counts;
  });

  readonly hits = computed(() => {
    const artifact = this.listener();
    const resource = normalizeResourceFilter(artifact?.filterResource);
    const query = this.searchQuery().trim().toLowerCase();
    const sort = this.sortBy();
    let rows = [...this.activity()];
    if (resource !== 'all')
      rows = rows.filter((hit) => hitMatchesResourceFilter(hit, resource));
    if (query) {
      rows = rows.filter((hit) => {
        const haystack = `${hit.method} ${hit.url} ${hit.status} ${hit.resourceType ?? ''}`.toLowerCase();
        return haystack.includes(query);
      });
    }
    rows.sort((a, b) => compareHits(a, b, sort));
    return rows.slice(0, 200);
  });

  readonly selectedHit = computed((): ListenerActivityEntry | null => {
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
      kind: 'listener',
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
      const next = normalizeListenerSection(tab.serviceSection);
      if (tab.serviceSection === next)
        return;
      this.workbench.patchTab(tab.id, { serviceSection: next });
    });
  }

  patchName(name: string): void {
    const artifact = this.listener();
    if (!artifact)
      return;
    void this.store.patchListener(artifact.id, { name });
    this.workbench.patchTab(this.tab().id, { title: name });
  }

  patchField<K extends keyof NonNullable<ReturnType<ListenerEditorComponent['listener']>>>(
    key: K,
    value: NonNullable<ReturnType<ListenerEditorComponent['listener']>>[K],
  ): void {
    const artifact = this.listener();
    if (!artifact)
      return;
    void this.store.patchListener(artifact.id, { [key]: value } as Partial<typeof artifact>);
  }

  patchMode(value: string): void {
    const mode: ListenerMode = value === 'device' ? 'device' : 'browser';
    this.patchField('mode', mode);
  }

  patchResourceFilter(value: string): void {
    this.patchField('filterResource', normalizeResourceFilter(value));
  }

  setSearch(value: string): void {
    this.workbench.patchListenerUi(this.tab().nodeId, { search: value });
  }

  setSort(value: string): void {
    const next = SORT_OPTIONS.find((item) => item.value === value)?.value as NetworkSort | undefined;
    this.workbench.patchListenerUi(this.tab().nodeId, { sort: next ?? 'time-desc' });
  }

  toggleTimeSort(): void {
    const current = this.sortBy();
    this.workbench.patchListenerUi(this.tab().nodeId, {
      sort: current === 'time-desc' ? 'time-asc' : 'time-desc',
    });
  }

  openHit(hit: ListenerActivityEntry): void {
    this.selectedHitId.set(hit.id);
  }

  closeHit(): void {
    this.selectedHitId.set(null);
  }

  startCapture(): void {
    const artifact = this.listener();
    if (!artifact)
      return;
    void this.store.startListener(artifact.id);
  }

  stopCapture(): void {
    void this.store.stopListener();
  }

  clearActivity(): void {
    const artifact = this.listener();
    if (!artifact)
      return;
    this.selectedHitId.set(null);
    void this.store.clearListenerActivity(artifact.id);
  }

  trackHit(_index: number, hit: ListenerActivityEntry): string {
    return hit.id;
  }

  formatHitTime(at: number): string {
    return new Date(at).toLocaleTimeString();
  }

  resourceLabel(hit: ListenerActivityEntry): string {
    const kind = classifyListenerHit(hit);
    return TRAFFIC_RESOURCE_FILTER_OPTIONS.find((item) => item.value === kind)?.label ?? kind;
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

function normalizeResourceFilter(raw: string | null | undefined): TrafficResourceFilter {
  const value = (raw ?? 'all').trim().toLowerCase();
  return TRAFFIC_RESOURCE_FILTER_OPTIONS.find((item) => item.value === value)?.value ?? 'all';
}

function classifyListenerHit(hit: ListenerActivityEntry): Exclude<TrafficResourceFilter, 'all'> {
  return classifyTrafficResource({
    method: hit.method,
    url: hit.url,
    resourceType: hit.resourceType,
    responseHeaders: Object.entries(hit.headers).map(([key, value]) => ({ key, value })),
  });
}

function hitMatchesResourceFilter(hit: ListenerActivityEntry, filter: TrafficResourceFilter): boolean {
  if (filter === 'all')
    return true;
  return classifyListenerHit(hit) === filter;
}

function compareHits(a: ListenerActivityEntry, b: ListenerActivityEntry, sort: NetworkSort): number {
  if (sort === 'time-asc')
    return a.at - b.at;
  if (sort === 'time-desc')
    return b.at - a.at;
  if (sort === 'method')
    return a.method.localeCompare(b.method) || b.at - a.at;
  if (sort === 'status')
    return a.status - b.status || b.at - a.at;
  return a.url.localeCompare(b.url) || b.at - a.at;
}
