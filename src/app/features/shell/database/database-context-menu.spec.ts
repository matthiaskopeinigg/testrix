import { describe, expect, it } from 'vitest';

import { buildConnectionNodeContextMenu } from './connection-context-menu';
import { buildDatabaseNodeContextMenu } from './database-context-menu';

describe('database sidebar context menus', () => {
  it('does not offer nested folders on connection folders', () => {
    const items = buildConnectionNodeContextMenu('folder', false);
    expect(items.map((item) => item.id)).not.toContain('new-folder');
    expect(items.map((item) => item.id)).toContain('new-connection');
  });

  it('offers New folder on nested query folders', () => {
    const items = buildDatabaseNodeContextMenu('folder', false);
    expect(items.map((item) => item.id)).toContain('new-folder');
  });

  it('opens connection settings from the context menu, not as Open catalog', () => {
    const items = buildConnectionNodeContextMenu('connection', true);
    const ids = items.map((item) => item.id);
    expect(ids).toContain('edit');
    expect(items.find((item) => item.id === 'edit')?.label).toBe('Connection settings');
    expect(ids).toContain('open');
    expect(ids).not.toContain('open-data');
  });

  it('offers Open data on tables, not on connections', () => {
    const tableIds = buildConnectionNodeContextMenu('table', false).map((item) => item.id);
    expect(tableIds).toContain('open-data');
    expect(tableIds[0]).toBe('open-data');
  });

  it('opens the schema picker from the schemas-selected row', () => {
    const items = buildConnectionNodeContextMenu('schemas', false);
    expect(items.map((item) => item.id)).toEqual(['schemas']);
    expect(items[0]?.label).toBe('Schemas…');
  });
});
