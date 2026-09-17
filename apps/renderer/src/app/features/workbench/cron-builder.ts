import type { TxSelectOption } from '@testrix/ui';

export interface CronFields {
  readonly minute: string;
  readonly hour: string;
  readonly dom: string;
  readonly month: string;
  readonly dow: string;
}

export interface ParsedCron {
  readonly fields: CronFields;
  readonly minute: CronField;
  readonly hour: CronField;
  readonly dom: CronField;
  readonly month: CronField;
  readonly dow: CronField;
}

export interface CronParseResult {
  readonly parsed: ParsedCron | null;
  readonly error: string | null;
}

interface CronField {
  readonly any: boolean;
  readonly values: ReadonlySet<number>;
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const DOW_NAMES: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

const DOW_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
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
];

export const CRON_MINUTE_OPTIONS: readonly TxSelectOption[] = [
  { value: '*', label: 'Every minute (*)' },
  { value: '*/5', label: 'Every 5 minutes' },
  { value: '*/10', label: 'Every 10 minutes' },
  { value: '*/15', label: 'Every 15 minutes' },
  { value: '*/30', label: 'Every 30 minutes' },
  { value: '0', label: '0' },
  { value: '15', label: '15' },
  { value: '30', label: '30' },
  { value: '45', label: '45' },
];

export const CRON_HOUR_OPTIONS: readonly TxSelectOption[] = [
  { value: '*', label: 'Every hour (*)' },
  { value: '*/2', label: 'Every 2 hours' },
  { value: '*/3', label: 'Every 3 hours' },
  { value: '*/6', label: 'Every 6 hours' },
  { value: '0', label: '00' },
  { value: '6', label: '06' },
  { value: '8', label: '08' },
  { value: '9', label: '09' },
  { value: '12', label: '12' },
  { value: '18', label: '18' },
  { value: '21', label: '21' },
  { value: '23', label: '23' },
];

export const CRON_DOM_OPTIONS: readonly TxSelectOption[] = [
  { value: '*', label: 'Every day (*)' },
  { value: '1', label: '1' },
  { value: '15', label: '15' },
  { value: '28', label: '28' },
  { value: '31', label: '31' },
];

export const CRON_MONTH_OPTIONS: readonly TxSelectOption[] = [
  { value: '*', label: 'Every month (*)' },
  ...MONTH_LABELS.map((label, index) => ({
    value: String(index + 1),
    label: `${label} (${index + 1})`,
  })),
];

export const CRON_DOW_OPTIONS: readonly TxSelectOption[] = [
  { value: '*', label: 'Every weekday (*)' },
  { value: '1-5', label: 'Monday–Friday' },
  { value: '0,6', label: 'Weekend' },
  ...DOW_LABELS.map((label, index) => ({ value: String(index), label })),
];

export const DEFAULT_CRON_EXPRESSION = '*/5 * * * *';

/**
 * Parse a five-field cron expression.
 */
export function parseCron(expression: string): CronParseResult {
  const trimmed = expression.trim();
  if (!trimmed)
    return { parsed: null, error: 'Enter a cron expression' };
  const parts = trimmed.split(/\s+/u);
  if (parts.length !== 5)
    return { parsed: null, error: 'Use five fields: minute hour day-of-month month day-of-week' };
  const [minuteRaw, hourRaw, domRaw, monthRaw, dowRaw] = parts;
  try {
    const minute = parseField(minuteRaw ?? '', 0, 59);
    const hour = parseField(hourRaw ?? '', 0, 23);
    const dom = parseField(domRaw ?? '', 1, 31);
    const month = parseField(monthRaw ?? '', 1, 12, MONTH_NAMES);
    const dow = parseField(dowRaw ?? '', 0, 6, DOW_NAMES, true);
    return {
      parsed: {
        fields: {
          minute: minuteRaw ?? '*',
          hour: hourRaw ?? '*',
          dom: domRaw ?? '*',
          month: monthRaw ?? '*',
          dow: dowRaw ?? '*',
        },
        minute,
        hour,
        dom,
        month,
        dow,
      },
      error: null,
    };
  } catch (error) {
    return { parsed: null, error: error instanceof Error ? error.message : 'Invalid cron expression' };
  }
}

/**
 * Join five cron fields into a compact expression.
 */
export function joinCronFields(fields: CronFields): string {
  return `${fields.minute} ${fields.hour} ${fields.dom} ${fields.month} ${fields.dow}`;
}

/**
 * Return the next `count` local fire times after `from`.
 */
export function nextCronTimes(expression: string, from: Date, count = 5): Date[] {
  const { parsed } = parseCron(expression);
  if (!parsed)
    return [];
  const cursor = startCursor(from);
  const limit = from.getTime() + 1000 * 60 * 60 * 24 * 400;
  const hits: Date[] = [];
  while (hits.length < count && cursor.getTime() < limit) {
    if (matchesCron(parsed, cursor))
      hits.push(new Date(cursor.getTime()));
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  return hits;
}

/**
 * Build a short English summary of a five-field expression.
 */
export function summarizeCron(expression: string): string {
  const { parsed, error } = parseCron(expression);
  if (!parsed)
    return error ?? 'Invalid cron expression';
  const { fields, minute, hour, dom, month, dow } = parsed;
  if (fields.minute === '*' && fields.hour === '*' && fields.dom === '*' && fields.month === '*' && fields.dow === '*')
    return 'Every minute';
  const time = describeTime(fields, minute, hour);
  const days = describeDays(fields, dom, dow);
  const months = month.any ? '' : ` in ${describeList(fields.month, MONTH_LABELS, 1)}`;
  return `${time}${days}${months}`;
}

export function cronOptionsFor(presets: readonly TxSelectOption[], current: string): TxSelectOption[] {
  if (presets.some((option) => option.value === current))
    return [...presets];
  return [...presets, { value: current, label: current }];
}

export function formatCronTime(value: Date): string {
  return value.toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function startCursor(from: Date): Date {
  const next = new Date(from.getTime());
  next.setSeconds(0, 0);
  if (next.getTime() <= from.getTime())
    next.setMinutes(next.getMinutes() + 1);
  return next;
}

function matchesCron(parsed: ParsedCron, date: Date): boolean {
  if (!parsed.minute.any && !parsed.minute.values.has(date.getMinutes()))
    return false;
  if (!parsed.hour.any && !parsed.hour.values.has(date.getHours()))
    return false;
  if (!parsed.month.any && !parsed.month.values.has(date.getMonth() + 1))
    return false;
  const domOk = parsed.dom.any || parsed.dom.values.has(date.getDate());
  const dowOk = parsed.dow.any || parsed.dow.values.has(date.getDay());
  if (!parsed.dom.any && !parsed.dow.any)
    return domOk || dowOk;
  return domOk && dowOk;
}

function parseField(
  raw: string,
  min: number,
  max: number,
  names?: Record<string, number>,
  wrapSeven = false,
): CronField {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed)
    throw new Error('Empty cron field');
  if (trimmed === '*')
    return { any: true, values: new Set() };
  const values = new Set<number>();
  for (const part of trimmed.split(',')) {
    const [rangePart, stepRaw] = part.split('/');
    const step = stepRaw === undefined ? 1 : Number.parseInt(stepRaw, 10);
    if (!Number.isInteger(step) || step < 1)
      throw new Error(`Invalid step in "${raw}"`);
    if (!rangePart)
      throw new Error(`Invalid cron field "${raw}"`);
    let start: number;
    let end: number;
    if (rangePart === '*') {
      start = min;
      end = max;
    } else if (rangePart.includes('-')) {
      const [left, right] = rangePart.split('-');
      start = parseToken(left ?? '', min, max, names, wrapSeven);
      end = parseToken(right ?? '', min, max, names, wrapSeven);
      if (end < start)
        throw new Error(`Invalid range in "${raw}"`);
    } else {
      start = parseToken(rangePart, min, max, names, wrapSeven);
      end = start;
    }
    for (let value = start; value <= end; value += step) {
      if (value < min || value > max)
        throw new Error(`Value ${value} is out of range in "${raw}"`);
      values.add(value);
    }
  }
  return { any: false, values };
}

function parseToken(
  token: string,
  min: number,
  max: number,
  names: Record<string, number> | undefined,
  wrapSeven: boolean,
): number {
  const named = names?.[token];
  if (named !== undefined)
    return named;
  const numeric = Number.parseInt(token, 10);
  if (!Number.isInteger(numeric))
    throw new Error(`Unknown cron token "${token}"`);
  if (wrapSeven && numeric === 7)
    return 0;
  if (numeric < min || numeric > max)
    throw new Error(`Value ${numeric} is out of range`);
  return numeric;
}

function describeTime(fields: CronFields, minute: CronField, hour: CronField): string {
  if (fields.minute.startsWith('*/') && hour.any)
    return `Every ${fields.minute.slice(2)} minutes`;
  if (minute.any && hour.any)
    return 'Every minute';
  if (!minute.any && minute.values.size === 1 && hour.any)
    return `At minute ${[...minute.values][0]} of every hour`;
  if (!minute.any && minute.values.size === 1 && !hour.any && hour.values.size === 1) {
    const hourValue = [...hour.values][0] ?? 0;
    const minuteValue = [...minute.values][0] ?? 0;
    return `At ${pad(hourValue)}:${pad(minuteValue)}`;
  }
  return `At minute ${fields.minute}, hour ${fields.hour}`;
}

function describeDays(fields: CronFields, dom: CronField, dow: CronField): string {
  if (dom.any && dow.any)
    return '';
  if (!dow.any && dom.any)
    return ` on ${describeList(fields.dow, DOW_LABELS, 0)}`;
  if (!dom.any && dow.any)
    return ` on day ${fields.dom} of the month`;
  return ` on day ${fields.dom} of the month or ${describeList(fields.dow, DOW_LABELS, 0)}`;
}

function describeList(raw: string, labels: readonly string[], offset: number): string {
  if (raw === '1-5' && offset === 0)
    return 'Monday through Friday';
  if (raw === '0,6' && offset === 0)
    return 'Saturday and Sunday';
  const parts = raw.split(',');
  const names = parts.map((part) => {
    const numeric = Number.parseInt(part, 10);
    if (Number.isInteger(numeric) && labels[numeric - offset])
      return labels[numeric - offset];
    return part;
  });
  if (names.length === 1)
    return names[0] ?? raw;
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
