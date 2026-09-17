import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TxHintComponent, TxHintLayerService, TxSelectComponent } from '@testrix/ui';

import {
  CRON_DOM_OPTIONS,
  CRON_DOW_OPTIONS,
  CRON_HOUR_OPTIONS,
  CRON_MINUTE_OPTIONS,
  CRON_MONTH_OPTIONS,
  cronOptionsFor,
  DEFAULT_CRON_EXPRESSION,
  formatCronTime,
  joinCronFields,
  nextCronTimes,
  parseCron,
  summarizeCron,
  type CronFields,
} from './cron-builder';
import { copyToolText } from './tool-clipboard';
import type { WorkbenchTab } from './workbench.store';

@Component({
  selector: 'tx-cron-builder-editor',
  standalone: true,
  imports: [TxHintComponent, TxSelectComponent],
  templateUrl: './cron-builder-editor.component.html',
  styleUrl: './cron-builder-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CronBuilderEditorComponent {
  private readonly hints = inject(TxHintLayerService);

  readonly tab = input.required<WorkbenchTab>();
  readonly raw = signal(DEFAULT_CRON_EXPRESSION);
  readonly fields = signal<CronFields>(defaultFields());
  readonly parsed = computed(() => parseCron(this.raw()));
  readonly error = computed(() => this.parsed().error);
  readonly summary = computed(() => summarizeCron(this.raw()));
  readonly nextTimes = computed(() => nextCronTimes(this.raw(), new Date(), 5).map(formatCronTime));
  readonly minuteOptions = computed(() => cronOptionsFor(CRON_MINUTE_OPTIONS, this.fields().minute));
  readonly hourOptions = computed(() => cronOptionsFor(CRON_HOUR_OPTIONS, this.fields().hour));
  readonly domOptions = computed(() => cronOptionsFor(CRON_DOM_OPTIONS, this.fields().dom));
  readonly monthOptions = computed(() => cronOptionsFor(CRON_MONTH_OPTIONS, this.fields().month));
  readonly dowOptions = computed(() => cronOptionsFor(CRON_DOW_OPTIONS, this.fields().dow));

  setField(key: keyof CronFields, value: string): void {
    const next = { ...this.fields(), [key]: value };
    this.fields.set(next);
    this.raw.set(joinCronFields(next));
  }

  handleRaw(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement))
      return;
    this.raw.set(target.value);
    const parsed = parseCron(target.value).parsed;
    if (parsed)
      this.fields.set(parsed.fields);
  }

  clear(): void {
    this.raw.set(DEFAULT_CRON_EXPRESSION);
    this.fields.set(defaultFields());
  }

  async copyExpression(event: Event): Promise<void> {
    await copyToolText(this.hints, this.raw().trim(), event);
  }
}

function defaultFields(): CronFields {
  return { minute: '*/5', hour: '*', dom: '*', month: '*', dow: '*' };
}
