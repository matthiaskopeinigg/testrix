import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TxCheckComponent, TxHintComponent, TxHintLayerService, type TxHintPlacement } from '@testrix/ui';

import type { WorkbenchTab } from './workbench.store';

@Component({
  selector: 'tx-uuid-generator-editor',
  standalone: true,
  imports: [TxCheckComponent, TxHintComponent],
  templateUrl: './uuid-generator-editor.component.html',
  styleUrl: './uuid-generator-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UuidGeneratorEditorComponent {
  private readonly hints = inject(TxHintLayerService);

  readonly tab = input.required<WorkbenchTab>();

  readonly raw = signal(createUuid());
  readonly uppercase = signal(false);
  readonly hyphens = signal(true);

  readonly displayValue = computed(() => formatUuid(this.raw(), this.uppercase(), this.hyphens()));

  generate(): void {
    this.raw.set(createUuid());
  }

  async generateAndCopy(event: Event): Promise<void> {
    this.generate();
    await this.copyText(this.displayValue(), event, 'bottom');
  }

  selectValue(event: FocusEvent): void {
    const el = event.target;
    if (el instanceof HTMLInputElement)
      el.select();
  }

  async copyLatest(event: Event): Promise<void> {
    await this.copyText(this.displayValue(), event, 'bottom');
  }

  private async copyText(
    value: string,
    event: Event,
    placement: TxHintPlacement,
  ): Promise<void> {
    if (!value)
      return;
    const copied = await writeClipboard(value);
    if (!copied)
      return;
    const target = event.currentTarget;
    if (target instanceof HTMLElement)
      this.hints.flashAt('Copied', target, placement);
  }
}

function createUuid(): string {
  return globalThis.crypto.randomUUID();
}

function formatUuid(value: string, uppercase: boolean, hyphens: boolean): string {
  const next = hyphens ? value : value.replaceAll('-', '');
  return uppercase ? next.toUpperCase() : next.toLowerCase();
}

async function writeClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const input = document.createElement('textarea');
    input.value = value;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.append(input);
    input.select();
    const ok = document.execCommand('copy');
    input.remove();
    return ok;
  }
}
