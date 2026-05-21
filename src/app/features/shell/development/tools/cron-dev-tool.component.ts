import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxDropdownComponent } from '@app/shared/components/tx-dropdown/tx-dropdown.component';
import type { TxDropdownOption } from '@app/shared/components/tx-dropdown/tx-dropdown.types';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';
import { TxTagComponent } from '@app/shared/components/tx-tag/tx-tag.component';

import { DevToolClipboardService } from '../shell/dev-tool-clipboard.service';
import { DevToolLayoutComponent } from '../shell/dev-tool-layout.component';
import { DevToolStatStripComponent } from '../shell/dev-tool-stat-strip.component';
import { DevToolToolbarComponent } from '../shell/dev-tool-toolbar.component';
import { createDevToolStateBinding } from './dev-tool-session.harness';
import {
  buildCronExpression,
  CRON_PRESETS,
  describeCron,
  nextCronRuns,
} from './logic/cron.logic';

@Component({
  selector: 'app-cron-dev-tool',
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
    TxTagComponent,
  ],
  templateUrl: './cron-dev-tool.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CronDevToolComponent {
  private readonly clipboard = inject(DevToolClipboardService);
  protected readonly state = createDevToolStateBinding('cron');

  protected readonly presetOptions: readonly TxDropdownOption[] = [
    { value: 'custom', label: 'Preset…' },
    ...CRON_PRESETS.map((p) => ({ value: p.id, label: p.label })),
  ];

  protected readonly expression = computed(() => {
    const s = this.state();
    if (s.expression.trim() && s.presetId === 'custom') {
      return s.expression.trim();
    }
    return buildCronExpression(s);
  });

  protected readonly description = computed(() => describeCron(this.expression()));
  protected readonly nextRuns = computed(() => nextCronRuns(this.expression()));

  protected handlePreset(id: string): void {
    const preset = CRON_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    this.state.update((s) => ({
      ...s,
      presetId: id,
      minute: preset.fields.minute,
      hour: preset.fields.hour,
      dayOfMonth: preset.fields.dayOfMonth,
      month: preset.fields.month,
      dayOfWeek: preset.fields.dayOfWeek,
      expression: buildCronExpression(preset.fields),
    }));
  }

  protected updateField(
    key: 'minute' | 'hour' | 'dayOfMonth' | 'month' | 'dayOfWeek',
    value: string,
  ): void {
    this.state.update((s) => {
      const next = { ...s, [key]: value, presetId: 'custom' as const };
      return { ...next, expression: buildCronExpression(next) };
    });
  }

  protected handleExpressionInput(value: string): void {
    this.state.update((s) => ({ ...s, expression: value, presetId: 'custom' }));
    const parts = value.trim().split(/\s+/);
    if (parts.length >= 5) {
      this.state.update((s) => ({
        ...s,
        minute: parts[0] ?? '*',
        hour: parts[1] ?? '*',
        dayOfMonth: parts[2] ?? '*',
        month: parts[3] ?? '*',
        dayOfWeek: parts[4] ?? '*',
      }));
    }
  }

  protected async handleCopy(): Promise<void> {
    await this.clipboard.copy(this.expression());
  }
}
