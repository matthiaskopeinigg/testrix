export type DatabaseCellEditorKind =
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'time'
  | 'datetime'
  | 'json'
  | 'uuid';

const ISO_PREFIX =
  /^(\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?)/u;

export function databaseCellEditorKind(sqlType: string | null | undefined): DatabaseCellEditorKind {
  const type = (sqlType ?? '').trim().toLowerCase();
  if (!type)
    return 'text';
  if (type === 'uuid' || type.includes('uniqueidentifier'))
    return 'uuid';
  if (type === 'json' || type === 'jsonb' || type.startsWith('json'))
    return 'json';
  if (type === 'boolean' || type === 'bool' || type === 'bit')
    return 'boolean';
  if (type === 'date')
    return 'date';
  if (type.startsWith('time') && !type.includes('stamp'))
    return 'time';
  if (type.includes('timestamp') || type.includes('datetime') || type === 'timestamptz')
    return 'datetime';
  if (
    type.includes('int') ||
    type.includes('numeric') ||
    type.includes('decimal') ||
    type.includes('float') ||
    type.includes('double') ||
    type.includes('real') ||
    type.includes('money') ||
    type === 'serial' ||
    type === 'bigserial'
  )
    return 'number';
  return 'text';
}

export function inferDatabaseCellEditorKind(
  sqlType: string | null | undefined,
  sample: string | null | undefined,
): DatabaseCellEditorKind {
  const fromType = databaseCellEditorKind(sqlType);
  if (fromType !== 'text')
    return fromType;
  const value = (sample ?? '').trim();
  if (!value)
    return 'text';
  if (value === 'true' || value === 'false' || value === 't' || value === 'f')
    return 'boolean';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value))
    return 'uuid';
  if (ISO_PREFIX.test(value) && Number.isNaN(Number(value)))
    return value.includes(':') ? 'datetime' : 'date';
  if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']')))
    return 'json';
  return 'text';
}

export function databaseCellHasPicker(kind: DatabaseCellEditorKind): boolean {
  return kind === 'date' || kind === 'time' || kind === 'datetime';
}

export function nativePickerType(kind: DatabaseCellEditorKind): 'date' | 'time' | 'datetime-local' | null {
  if (kind === 'date')
    return 'date';
  if (kind === 'time')
    return 'time';
  if (kind === 'datetime')
    return 'datetime-local';
  return null;
}

export function toNativePickerValue(kind: DatabaseCellEditorKind, value: string): string {
  const date = parseCellDate(value);
  if (!date)
    return '';
  if (kind === 'date')
    return formatDateInput(date);
  if (kind === 'time')
    return formatTimeInput(date);
  return formatDatetimeLocal(date);
}

export function fromNativePickerValue(kind: DatabaseCellEditorKind, value: string): string {
  if (!value.trim())
    return '';
  if (kind === 'date')
    return value;
  if (kind === 'time')
    return value.length === 5 ? `${value}:00` : value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    return value.replace('T', ' ');
  return date.toISOString();
}

export function normalizeEditedCell(kind: DatabaseCellEditorKind, value: string): string {
  const trimmed = value.trim();
  if (!trimmed)
    return trimmed;
  if (kind === 'boolean')
    return normalizeBooleanCell(trimmed);
  if (kind === 'datetime' || kind === 'date' || kind === 'time')
    return normalizeTimestampCell(kind, trimmed);
  if (kind === 'json')
    return formatJsonCell(trimmed) ?? trimmed;
  if (kind === 'uuid')
    return trimmed.toLowerCase();
  return trimmed;
}

export function normalizeBooleanCell(value: string): string {
  const lowered = value.trim().toLowerCase();
  if (lowered === 'true' || lowered === 't' || lowered === '1' || lowered === 'yes' || lowered === 'on')
    return 'true';
  if (lowered === 'false' || lowered === 'f' || lowered === '0' || lowered === 'no' || lowered === 'off')
    return 'false';
  return value;
}

export function isTrueCell(value: string | null | undefined): boolean {
  return normalizeBooleanCell(value ?? '') === 'true';
}

export function formatJsonCell(value: string): string | null {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return null;
  }
}

export function newUuid(): string {
  return crypto.randomUUID();
}

function normalizeTimestampCell(kind: DatabaseCellEditorKind, value: string): string {
  const parsed = parseCellDate(value);
  if (!parsed)
    return value;
  if (kind === 'date')
    return formatDateInput(parsed);
  if (kind === 'time')
    return formatTimeInput(parsed);
  return parsed.toISOString();
}

export function parseCellDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed)
    return null;
  const direct = Date.parse(trimmed);
  if (!Number.isNaN(direct))
    return new Date(direct);
  const match = ISO_PREFIX.exec(trimmed);
  if (!match?.[1])
    return null;
  const normalized = match[1].includes('T') ? match[1] : match[1].replace(' ', 'T');
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

export function sqlValueFromDate(kind: DatabaseCellEditorKind, date: Date): string {
  if (kind === 'date')
    return formatDateInput(date);
  if (kind === 'time')
    return formatTimeInput(date);
  return date.toISOString();
}

export const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;

export interface CalendarCell {
  readonly day: number;
  readonly year: number;
  readonly month: number;
  readonly inMonth: boolean;
  readonly isToday: boolean;
  readonly isSelected: boolean;
}

export function shiftMonth(year: number, month: number, delta: number): { readonly year: number; readonly month: number } {
  const next = new Date(year, month + delta, 1);
  return { year: next.getFullYear(), month: next.getMonth() };
}

export function calendarCells(
  year: number,
  month: number,
  selected: Date | null,
  today = new Date(),
): CalendarCell[] {
  const first = new Date(year, month, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - mondayOffset);
  const selectedKey = selected ? dateKey(selected) : null;
  const todayKey = dateKey(today);
  const cells: CalendarCell[] = [];
  for (let index = 0; index < 42; index++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    cells.push({
      day: date.getDate(),
      year: date.getFullYear(),
      month: date.getMonth(),
      inMonth: date.getMonth() === month,
      isToday: dateKey(date) === todayKey,
      isSelected: selectedKey === dateKey(date),
    });
  }
  return cells;
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

function formatDatetimeLocal(date: Date): string {
  return `${formatDateInput(date)}T${formatTimeInput(date)}`;
}

function formatDateInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatTimeInput(date: Date): string {
  const ms = date.getMilliseconds();
  const base = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return ms ? `${base}.${pad(ms, 3)}` : base;
}
