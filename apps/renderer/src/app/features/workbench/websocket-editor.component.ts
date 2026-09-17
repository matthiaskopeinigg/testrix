import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  signal,
} from '@angular/core';
import { TxHintComponent } from '@testrix/ui';

import { buildMockWsMessages, type MockWsMessage } from './request-mock';
import type { WorkbenchTab } from './workbench.store';

@Component({
  selector: 'tx-websocket-editor',
  standalone: true,
  imports: [TxHintComponent],
  templateUrl: './websocket-editor.component.html',
  styleUrl: './websocket-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WebsocketEditorComponent {
  readonly tab = input.required<WorkbenchTab>();

  readonly url = signal('');
  readonly connected = signal(false);
  readonly composer = signal('{ "type": "ping" }');
  readonly messages = signal<MockWsMessage[]>([]);

  constructor() {
    effect(() => {
      const tab = this.tab();
      this.url.set(tab.url);
      this.connected.set(false);
      this.composer.set('{ "type": "ping" }');
      this.messages.set(buildMockWsMessages(tab));
    });
  }

  handleUrlInput(event: Event): void {
    const inputEl = event.target;
    if (!(inputEl instanceof HTMLInputElement)) {
      return;
    }
    this.url.set(inputEl.value);
  }

  handleComposerInput(event: Event): void {
    const el = event.target;
    if (!(el instanceof HTMLTextAreaElement)) {
      return;
    }
    this.composer.set(el.value);
  }

  handleConnectToggle(): void {
    const next = !this.connected();
    this.connected.set(next);
    if (!next) {
      return;
    }
    const tab = this.tab();
    const stamp = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    this.messages.update((list) => [
      ...list,
      {
        id: `${tab.id}-connect-${Date.now()}`,
        direction: 'in',
        body: '{ "type": "connected", "ok": true }',
        at: stamp,
      },
    ]);
  }

  handleSend(): void {
    if (!this.connected()) {
      return;
    }
    const body = this.composer().trim();
    if (!body) {
      return;
    }
    const tab = this.tab();
    const stamp = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    this.messages.update((list) => [
      ...list,
      {
        id: `${tab.id}-out-${Date.now()}`,
        direction: 'out',
        body,
        at: stamp,
      },
      {
        id: `${tab.id}-echo-${Date.now()}`,
        direction: 'in',
        body: `{ "type": "echo", "payload": ${body} }`,
        at: stamp,
      },
    ]);
  }

  trackMessage(_index: number, message: MockWsMessage): string {
    return message.id;
  }
}
