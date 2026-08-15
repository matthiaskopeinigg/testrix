import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { TxButtonComponent } from '@app/shared/components/forms/tx-button/tx-button.component';
import { TxDropdownComponent } from '@app/shared/components/forms/tx-dropdown/tx-dropdown.component';
import type { TxDropdownOption } from '@app/shared/components/forms/tx-dropdown/tx-dropdown.types';
import { TxFormFieldComponent } from '@app/shared/components/forms/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/forms/tx-input/tx-input.component';
import { TxTagComponent } from '@app/shared/components/forms/tx-tag/tx-tag.component';
import { TxToggleComponent } from '@app/shared/components/forms/tx-toggle/tx-toggle.component';

import { DevToolClipboardService } from '../shell/dev-tool-clipboard.service';
import { DevToolLayoutComponent } from '../shell/dev-tool-layout.component';
import { DevToolStatStripComponent } from '../shell/dev-tool-stat-strip.component';
import { DevToolToolbarComponent } from '../shell/dev-tool-toolbar.component';
import { createDevToolStateBinding } from './dev-tool-session.harness';
import { generateUuids, NIL_UUID } from './logic/uuid.logic';

@Component({
  selector: 'app-uuid-generator-dev-tool',
  standalone: true,
  imports: [
    FormsModule,
    DevToolLayoutComponent,
    DevToolToolbarComponent,
    DevToolStatStripComponent,
    TxButtonComponent,
    TxDropdownComponent,
    TxFormFieldComponent,
    TxInputComponent,
    TxToggleComponent,
    TxTagComponent,
  ],
  templateUrl: './uuid-generator-dev-tool.component.html',
  styleUrl: './uuid-generator-dev-tool.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UuidGeneratorDevToolComponent {
  private readonly clipboard = inject(DevToolClipboardService);
  protected readonly state = createDevToolStateBinding('uuid-generator');

  protected readonly versionOptions: readonly TxDropdownOption[] = [
    { value: 'v4', label: 'UUID v4' },
    { value: 'v7', label: 'UUID v7' },
    { value: 'ulid', label: 'ULID' },
    { value: 'nanoid', label: 'NanoID' },
  ];

  protected readonly versionLabel = computed(() => {
    const version = this.state().version;
    return this.versionOptions.find((option) => option.value === version)?.label ?? 'UUID v4';
  });

  protected readonly lines = computed(() => {
    const s = this.state();
    if (s.output.trim()) {
      return s.output.split('\n').filter((line) => line.length > 0);
    }
    return generateUuids({
      count: s.count,
      uppercase: s.uppercase,
      stripHyphens: s.stripHyphens,
      version: s.version,
    });
  });

  protected readonly byteSize = computed(() =>
    new TextEncoder().encode(this.lines().join('\n')).length,
  );

  protected handleCountChange(value: string): void {
    const parsed = Number.parseInt(value, 10);
    this.state.update((s) => ({
      ...s,
      count: Number.isFinite(parsed) ? Math.min(500, Math.max(1, parsed)) : 1,
    }));
  }

  protected handleGenerate(): void {
    const s = this.state();
    const output = generateUuids({
      count: s.count,
      uppercase: s.uppercase,
      stripHyphens: s.stripHyphens,
      version: s.version,
    }).join('\n');
    this.state.update((prev) => ({ ...prev, output }));
  }

  protected handleClear(): void {
    this.state.update((s) => ({ ...s, output: '' }));
  }

  protected handleNil(): void {
    this.state.update((s) => ({ ...s, output: NIL_UUID }));
  }

  protected handleBulk10(): void {
    this.state.update((s) => ({ ...s, count: 10 }));
    this.handleGenerate();
  }

  protected async handleCopyAll(): Promise<void> {
    await this.clipboard.copy(this.lines().join('\n'), 'UUIDs copied');
  }

  protected async handleCopyLine(line: string): Promise<void> {
    await this.clipboard.copy(line, 'UUID copied');
  }
}
