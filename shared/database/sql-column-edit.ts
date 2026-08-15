/**
 * How a SQL column should be edited in the table data grid.
 */
export type SqlColumnEditKind =
  | 'boolean'
  | 'integer'
  | 'decimal'
  | 'uuid'
  | 'datetime'
  | 'json'
  | 'text';

const BOOLEAN_TYPES = new Set(['bool', 'boolean']);
const INTEGER_TYPES = new Set([
  'int',
  'int2',
  'int4',
  'int8',
  'integer',
  'smallint',
  'bigint',
  'tinyint',
  'serial',
  'smallserial',
  'bigserial',
  'year',
]);
const DECIMAL_TYPES = new Set([
  'numeric',
  'decimal',
  'float',
  'float4',
  'float8',
  'double',
  'real',
  'money',
  'number',
]);
const DATETIME_TYPES = new Set([
  'date',
  'time',
  'timetz',
  'timestamp',
  'timestamptz',
  'datetime',
  'datetime2',
  'smalldatetime',
]);

/**
 * First identifier of a driver type name (`varchar(255)` → `varchar`, `INT UNSIGNED` → `int`).
 */
export function sqlTypeBaseName(type: string | undefined): string {
  if (!type) {
    return '';
  }
  let trimmed = type.trim().toLowerCase();
  for (;;) {
    const wrapped = trimmed.match(/^(nullable|lowcardinality|array)\((.*)\)$/i);
    if (!wrapped?.[2]) {
      break;
    }
    trimmed = wrapped[2].trim();
  }
  const noArgs = trimmed.replace(/\(.*\)$/, '').trim();
  return noArgs.split(/\s+/)[0] ?? '';
}

/**
 * Maps a driver column type to the editor used in the table data grid.
 */
export function classifySqlColumnType(type: string | undefined): SqlColumnEditKind {
  const base = sqlTypeBaseName(type);
  if (!base) {
    return 'text';
  }
  if (BOOLEAN_TYPES.has(base) || isSingleBitType(type)) {
    return 'boolean';
  }
  if (INTEGER_TYPES.has(base) || /^u?int\d*$/.test(base)) {
    return 'integer';
  }
  if (DECIMAL_TYPES.has(base) || /^float\d*$/.test(base) || /^decimal\d*$/.test(base) || base === 'binary_float' || base === 'binary_double') {
    return 'decimal';
  }
  if (base === 'uuid') {
    return 'uuid';
  }
  if (DATETIME_TYPES.has(base)) {
    return 'datetime';
  }
  if (base === 'json' || base === 'jsonb') {
    return 'json';
  }
  return 'text';
}

/**
 * True when {@link value} is allowed while the user is still typing.
 */
export function isPartialSqlColumnValue(kind: SqlColumnEditKind, value: string): boolean {
  if (kind === 'text' || kind === 'json') {
    return true;
  }
  if (kind === 'boolean') {
    return value === '' || value === 'true' || value === 'false';
  }
  if (kind === 'integer') {
    return /^-?\d*$/.test(value);
  }
  if (kind === 'decimal') {
    return /^-?\d*(?:\.\d*)?$/.test(value);
  }
  if (kind === 'uuid') {
    return value.length <= 36 && /^[0-9a-fA-F-]*$/.test(value);
  }
  return /^[0-9A-Za-zT:\.\+\- Z]*$/.test(value);
}

/**
 * True when {@link value} may be committed for {@link kind}. Empty is allowed.
 */
export function isCompleteSqlColumnValue(kind: SqlColumnEditKind, value: string): boolean {
  if (value === '') {
    return true;
  }
  if (kind === 'text') {
    return true;
  }
  if (kind === 'boolean') {
    return value === 'true' || value === 'false';
  }
  if (kind === 'integer') {
    return /^-?\d+$/.test(value);
  }
  if (kind === 'decimal') {
    return /^-?(?:\d+\.?\d*|\.\d+)$/.test(value);
  }
  if (kind === 'uuid') {
    return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value);
  }
  if (kind === 'json') {
    try {
      JSON.parse(value);
      return true;
    } catch {
      return false;
    }
  }
  return /\d/.test(value);
}

/**
 * Maps a displayed boolean cell to `true` or `false`.
 */
export function normalizeSqlBooleanValue(value: string | null | undefined): 'true' | 'false' | null {
  if (value == null) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === 't' || normalized === '1' || normalized === 'yes') {
    return 'true';
  }
  if (normalized === 'false' || normalized === 'f' || normalized === '0' || normalized === 'no') {
    return 'false';
  }
  return null;
}

/**
 * `inputmode` hint for a typed cell editor.
 */
export function sqlColumnInputMode(kind: SqlColumnEditKind): string | null {
  if (kind === 'integer' || kind === 'decimal') {
    return 'decimal';
  }
  return null;
}

function isSingleBitType(type: string | undefined): boolean {
  const trimmed = type?.trim().toLowerCase() ?? '';
  return trimmed === 'bit' || trimmed === 'bit(1)';
}
