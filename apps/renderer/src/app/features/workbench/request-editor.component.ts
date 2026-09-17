import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  signal,
} from '@angular/core';
import { HTTP_METHODS, type HttpMethod } from '@testrix/contracts';
import { TxHintComponent, TxSelectComponent, TxEmptyStateComponent, type TxSelectOption } from '@testrix/ui';

import { RequestKvTableComponent } from './request-kv-table.component';
import {
  buildMockAuth,
  buildMockBody,
  buildMockHeaders,
  buildMockParams,
  buildMockResponse,
  withTrailingRow,
  type MockKeyValue,
  type MockResponse,
} from './request-mock';
import type { WorkbenchTab } from './workbench.store';

type RequestSubTab = 'params' | 'headers' | 'body' | 'auth';
type ResponseSubTab = 'body' | 'headers';
type SendState = 'idle' | 'sending' | 'done';

const SEND_DELAY_MS = 220;

function countEnabled(rows: readonly MockKeyValue[]): number {
  return rows.filter((row) => row.enabled && row.key.trim()).length;
}

@Component({
  selector: 'tx-request-editor',
  standalone: true,
  imports: [TxHintComponent, TxEmptyStateComponent, RequestKvTableComponent, TxSelectComponent],
  templateUrl: './request-editor.component.html',
  styleUrl: './request-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(keydown)': 'handleHotkey($event)',
  },
})
export class RequestEditorComponent {
  readonly tab = input.required<WorkbenchTab>();

  readonly methodOptions: readonly TxSelectOption[] = HTTP_METHODS.map((value) => ({
    value,
    label: value,
  }));

  readonly method = signal<HttpMethod>('GET');
  readonly url = signal('');
  readonly requestTab = signal<RequestSubTab>('params');
  readonly responseTab = signal<ResponseSubTab>('body');
  readonly sendState = signal<SendState>('idle');
  readonly response = signal<MockResponse | null>(null);
  readonly splitRatio = signal(0.55);
  readonly params = signal<MockKeyValue[]>([]);
  readonly headers = signal<MockKeyValue[]>([]);
  readonly body = signal('');
  readonly authToken = signal('');
  readonly copied = signal(false);

  private resizing = false;
  private sendTimer: ReturnType<typeof setTimeout> | null = null;
  private copyTimer: ReturnType<typeof setTimeout> | null = null;
  private hydratedId = '';

  readonly bodyDisabled = computed(() => {
    const method = this.method();
    return method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
  });

  readonly paramCount = computed(() => countEnabled(this.params()));
  readonly headerCount = computed(() => countEnabled(this.headers()));
  readonly hasResponse = computed(() => this.sendState() === 'done' && !!this.response());

  constructor() {
    effect(() => {
      const tab = this.tab();
      if (tab.id === this.hydratedId) {
        return;
      }
      this.hydratedId = tab.id;
      this.hydrate(tab);
    });
  }

  handleMethodChange(value: string): void {
    const next = value as HttpMethod;
    if (!HTTP_METHODS.includes(next)) {
      return;
    }
    this.method.set(next);
    if (next === 'GET' || next === 'HEAD' || next === 'OPTIONS') {
      return;
    }
    if (!this.body().trim()) {
      this.body.set(buildMockBody(next, this.tab()));
    }
  }

  handleUrlInput(event: Event): void {
    const inputEl = event.target;
    if (!(inputEl instanceof HTMLInputElement)) {
      return;
    }
    this.url.set(inputEl.value);
  }

  handleRequestTab(tab: RequestSubTab): void {
    this.requestTab.set(tab);
  }

  handleResponseTab(tab: ResponseSubTab): void {
    this.responseTab.set(tab);
  }

  handleBodyInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement)) {
      return;
    }
    this.body.set(target.value);
  }

  handleTokenInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    this.authToken.set(target.value);
  }

  handleHotkey(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey) || event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    this.handleSend();
  }

  handleSend(): void {
    if (this.sendState() === 'sending') {
      return;
    }
    if (this.sendTimer) {
      clearTimeout(this.sendTimer);
    }
    this.sendState.set('sending');
    this.sendTimer = setTimeout(() => {
      this.response.set(buildMockResponse(this.tab()));
      this.responseTab.set('body');
      this.sendState.set('done');
      this.sendTimer = null;
    }, SEND_DELAY_MS);
  }

  handleCopy(): void {
    const body = this.response()?.body;
    if (!body || typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }
    void navigator.clipboard.writeText(body).then(() => {
      this.copied.set(true);
      if (this.copyTimer) {
        clearTimeout(this.copyTimer);
      }
      this.copyTimer = setTimeout(() => {
        this.copied.set(false);
        this.copyTimer = null;
      }, 1200);
    });
  }

  handleResizeStart(event: PointerEvent): void {
    event.preventDefault();
    const sash = event.currentTarget;
    if (!(sash instanceof HTMLElement)) {
      return;
    }
    const shell = sash.parentElement;
    if (!shell) {
      return;
    }

    this.resizing = true;
    const rect = shell.getBoundingClientRect();
    const onMove = (moveEvent: PointerEvent): void => {
      if (!this.resizing) {
        return;
      }
      const ratio = (moveEvent.clientY - rect.top) / rect.height;
      this.splitRatio.set(Math.min(0.75, Math.max(0.25, ratio)));
    };
    const onUp = (): void => {
      this.resizing = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  trackKv(_index: number, row: MockKeyValue): string {
    return row.id;
  }

  statusTone(status: number): string {
    if (status >= 500) {
      return 'error';
    }
    if (status >= 400) {
      return 'warn';
    }
    if (status >= 300) {
      return 'redirect';
    }
    return 'ok';
  }

  private hydrate(tab: WorkbenchTab): void {
    this.method.set(tab.method ?? 'GET');
    this.url.set(tab.url);
    this.requestTab.set('params');
    this.responseTab.set('body');
    this.params.set(withTrailingRow(buildMockParams(tab)));
    this.headers.set(withTrailingRow(buildMockHeaders(tab)));
    this.body.set(buildMockBody(tab.method, tab));
    this.authToken.set(buildMockAuth(tab).find((row) => row.key === 'Token')?.value ?? '');
    this.copied.set(false);
    if (tab.status !== null) {
      this.response.set(buildMockResponse(tab));
      this.sendState.set('done');
    } else {
      this.response.set(null);
      this.sendState.set('idle');
    }
  }
}
