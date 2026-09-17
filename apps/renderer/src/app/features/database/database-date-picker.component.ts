import { afterNextRender, ChangeDetectionStrategy, Component, computed, inject, Injector, input, output, signal } from '@angular/core';

import {
  calendarCells,
  parseCellDate,
  shiftMonth,
  sqlValueFromDate,
  WEEKDAY_LABELS,
  type DatabaseCellEditorKind,
} from './database-cell-edit';

const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

@Component({
  selector: 'tx-database-date-picker',
  standalone: true,
  templateUrl: './database-date-picker.component.html',
  styleUrl: './database-date-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatabaseDatePickerComponent {
  readonly kind = input.required<DatabaseCellEditorKind>();
  readonly value = input('');
  readonly picked = output<string>();

  readonly weekdays = WEEKDAY_LABELS;
  readonly cursor = signal({ year: new Date().getFullYear(), month: new Date().getMonth() });
  readonly selected = signal(new Date());
  readonly hours = signal('00');
  readonly minutes = signal('00');
  readonly seconds = signal('00');

  constructor() {
    afterNextRender(
      () => this.seedFromValue(),
      { injector: inject(Injector) },
    );
  }

  readonly monthLabel = computed(() => {
    const cursor = this.cursor();
    return `${MONTH_LABELS[cursor.month]} ${cursor.year}`;
  });
  readonly days = computed(() => calendarCells(this.cursor().year, this.cursor().month, this.selected()));
  readonly showCalendar = computed(() => this.kind() !== 'time');
  readonly showTime = computed(() => this.kind() !== 'date');

  handlePrev(): void {
    this.cursor.update((current) => shiftMonth(current.year, current.month, -1));
  }

  handleNext(): void {
    this.cursor.update((current) => shiftMonth(current.year, current.month, 1));
  }

  handleDay(cell: { readonly year: number; readonly month: number; readonly day: number }): void {
    const next = this.withTime(new Date(cell.year, cell.month, cell.day));
    this.selected.set(next);
    this.cursor.set({ year: cell.year, month: cell.month });
    if (this.kind() === 'date')
      this.picked.emit(sqlValueFromDate(this.kind(), next));
  }

  handleTime(part: 'hours' | 'minutes' | 'seconds', event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement))
      return;
    const next = clampTimePart(part, target.value);
    if (part === 'hours')
      this.hours.set(next);
    else if (part === 'minutes')
      this.minutes.set(next);
    else
      this.seconds.set(next);
    this.selected.set(this.withTime(this.selected()));
  }

  handleNow(): void {
    const now = new Date();
    this.selected.set(now);
    this.cursor.set({ year: now.getFullYear(), month: now.getMonth() });
    this.hours.set(pad(now.getHours()));
    this.minutes.set(pad(now.getMinutes()));
    this.seconds.set(pad(now.getSeconds()));
    this.picked.emit(sqlValueFromDate(this.kind(), now));
  }

  handleApply(): void {
    this.picked.emit(sqlValueFromDate(this.kind(), this.withTime(this.selected())));
  }

  private seedFromValue(): void {
    const date = parseCellDate(this.value()) ?? new Date();
    this.selected.set(date);
    this.cursor.set({ year: date.getFullYear(), month: date.getMonth() });
    this.hours.set(pad(date.getHours()));
    this.minutes.set(pad(date.getMinutes()));
    this.seconds.set(pad(date.getSeconds()));
  }

  private withTime(date: Date): Date {
    const next = new Date(date);
    next.setHours(Number.parseInt(this.hours(), 10) || 0);
    next.setMinutes(Number.parseInt(this.minutes(), 10) || 0);
    next.setSeconds(Number.parseInt(this.seconds(), 10) || 0);
    next.setMilliseconds(0);
    return next;
  }
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function clampTimePart(part: 'hours' | 'minutes' | 'seconds', raw: string): string {
  const max = part === 'hours' ? 23 : 59;
  const parsed = Number.parseInt(raw.replace(/\D/g, ''), 10);
  if (!Number.isFinite(parsed))
    return '00';
  return pad(Math.min(max, Math.max(0, parsed)));
}
