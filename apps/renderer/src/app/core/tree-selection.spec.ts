// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { isOutsideTreePointer } from './tree-selection';

describe('isOutsideTreePointer', () => {
  it('is false inside the sidebar and true on the rest of the window', () => {
    const host = document.createElement('aside');
    const row = document.createElement('button');
    host.append(row);
    const pane = document.createElement('main');
    document.body.append(host, pane);
    const inside = new MouseEvent('pointerdown', { bubbles: true });
    const outside = new MouseEvent('pointerdown', { bubbles: true });
    row.dispatchEvent(inside);
    pane.dispatchEvent(outside);

    expect(isOutsideTreePointer(host, inside)).toBe(false);
    expect(isOutsideTreePointer(host, outside)).toBe(true);
    host.remove();
    pane.remove();
  });

  it('keeps the selection while a menu or dialog is the target', () => {
    const host = document.createElement('aside');
    const menu = document.createElement('div');
    menu.className = 'tx-menu';
    const item = document.createElement('button');
    menu.append(item);
    document.body.append(host, menu);
    const event = new MouseEvent('pointerdown', { bubbles: true });
    item.dispatchEvent(event);

    expect(isOutsideTreePointer(host, event)).toBe(false);
    host.remove();
    menu.remove();
  });
});
