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
});
