import { describe, expect, it } from 'vitest';

import {
  calendarCells,
  databaseCellEditorKind,
  fromNativePickerValue,
  inferDatabaseCellEditorKind,
  normalizeEditedCell,
  toNativePickerValue,
} from './database-cell-edit';

describe('databaseCellEditorKind', () => {
  it('maps postgres timestamptz to datetime', () => {
    expect(databaseCellEditorKind('timestamp with time zone')).toBe('datetime');
    expect(databaseCellEditorKind('timestamptz')).toBe('datetime');
  });

  it('maps date, time, bool, json, and uuid', () => {
    expect(databaseCellEditorKind('date')).toBe('date');
    expect(databaseCellEditorKind('time without time zone')).toBe('time');
    expect(databaseCellEditorKind('boolean')).toBe('boolean');
    expect(databaseCellEditorKind('jsonb')).toBe('json');
    expect(databaseCellEditorKind('uuid')).toBe('uuid');
    expect(databaseCellEditorKind('integer')).toBe('number');
  });
});

describe('normalizeEditedCell', () => {
  it('strips trailing junk from timestamptz values', () => {
    expect(normalizeEditedCell('datetime', '2026-09-17T10:06:42.250Za')).toBe('2026-09-17T10:06:42.250Z');
  });

  it('normalizes boolean aliases', () => {
    expect(normalizeEditedCell('boolean', 't')).toBe('true');
    expect(normalizeEditedCell('boolean', '0')).toBe('false');
  });
});

describe('native picker values', () => {
  it('round-trips a timestamptz through datetime-local', () => {
    const local = toNativePickerValue('datetime', '2026-09-17T10:06:42.250Z');
    expect(local.startsWith('2026-09-17T')).toBe(true);
    expect(fromNativePickerValue('datetime', local).endsWith('Z')).toBe(true);
  });
});

describe('calendarCells', () => {
  it('fills six weeks starting on Monday', () => {
    const cells = calendarCells(2026, 8, new Date(2026, 8, 17), new Date(2026, 8, 17));
    expect(cells).toHaveLength(42);
    expect(cells[0]?.day).toBe(31);
    expect(cells[0]?.inMonth).toBe(false);
    expect(cells[3]?.day).toBe(3);
    expect(cells[17]?.isSelected).toBe(true);
  });
});

describe('inferDatabaseCellEditorKind', () => {
  it('falls back to ISO samples when the catalog type is missing', () => {
    expect(inferDatabaseCellEditorKind('', '2026-09-17T10:06:42.250Z')).toBe('datetime');
  });
});
