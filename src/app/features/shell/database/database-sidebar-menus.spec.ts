import { describe, expect, it } from 'vitest';

import {
  buildDatabaseFilterMenuItems,
  connectionFilterActionId,
  isDatabaseConnectionFilterAction,
  parseDatabaseConnectionFilterAction,
} from './database-sidebar-menus';

describe('database-sidebar-menus', () => {
  it('appends connection filter actions', () => {
    const items = buildDatabaseFilterMenuItems(
      'all',
      false,
      [
        { id: 'c1', name: 'Primary' },
        { id: 'c2', name: 'Replica' },
      ],
      ['c2'],
    );
    const replica = items.find((item) => item.id === connectionFilterActionId('c2'));
    expect(replica?.selected).toBe(true);
    expect(items.some((item) => item.id === connectionFilterActionId('c1'))).toBe(true);
  });

  it('parses connection filter action ids', () => {
    expect(isDatabaseConnectionFilterAction(connectionFilterActionId('abc'))).toBe(true);
    expect(parseDatabaseConnectionFilterAction(connectionFilterActionId('abc'))).toBe('abc');
    expect(parseDatabaseConnectionFilterAction('all')).toBeNull();
  });
});
