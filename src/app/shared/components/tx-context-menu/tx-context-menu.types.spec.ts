import { describe, expect, it } from 'vitest';

import { isDestructiveContextMenuItem } from './tx-context-menu.types';

describe('isDestructiveContextMenuItem', () => {
  it('returns true for explicit danger items', () => {
    expect(isDestructiveContextMenuItem({ id: 'remove', label: 'Remove', danger: true })).toBe(true);
  });

  it('returns true for trash-icon delete actions', () => {
    expect(isDestructiveContextMenuItem({ id: 'delete', label: 'Delete', icon: 'trash' })).toBe(true);
  });

  it('returns true for clear-all actions', () => {
    expect(isDestructiveContextMenuItem({ id: 'clear-all', label: 'Clear history', icon: 'trash' })).toBe(true);
  });

  it('returns false for normal actions', () => {
    expect(isDestructiveContextMenuItem({ id: 'rename', label: 'Rename', icon: 'edit' })).toBe(false);
  });
});
