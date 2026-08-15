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
  });

  it('offers table information without requiring a click on the table row', () => {
    const items = buildConnectionNodeContextMenu('table', false);
    const ids = items.map((item) => item.id);
    expect(ids).toContain('show-structure');
    expect(ids).toContain('open-data');
    expect(items.find((item) => item.id === 'show-structure')?.label).toBe('Table information');
  });
});
