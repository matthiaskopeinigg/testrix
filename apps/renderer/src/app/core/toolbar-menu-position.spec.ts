// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { placeToolbarMenu } from './toolbar-menu-position';

function box(element: HTMLElement, rect: { left: number; top: number; width: number; height: number }): void {
  element.getBoundingClientRect = () =>
    ({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    }) as DOMRect;
}

describe('placeToolbarMenu', () => {
  it('aligns the menu to the trigger and stays inside the sidebar', () => {
    const sidebar = document.createElement('div');
    sidebar.className = 'tx-sidebar';
    const trigger = document.createElement('button');
    sidebar.append(trigger);
    document.body.append(sidebar);
    box(sidebar, { left: 52, top: 38, width: 248, height: 800 });
    box(trigger, { left: 136, top: 128, width: 30, height: 30 });

    const menu = placeToolbarMenu(trigger, 180);

    expect(menu.width).toBe(180);
    expect(menu.top).toBe(164);
    expect(menu.left).toBe(60);
    expect(menu.left + menu.width).toBeLessThanOrEqual(300 - 8);
    expect(menu.left).toBeGreaterThanOrEqual(60);
    sidebar.remove();
  });

  it('keeps the menu right edge on a trigger near the sidebar edge', () => {
    const sidebar = document.createElement('div');
    sidebar.className = 'tx-sidebar';
    const trigger = document.createElement('button');
    sidebar.append(trigger);
    document.body.append(sidebar);
    box(sidebar, { left: 52, top: 38, width: 360, height: 800 });
    box(trigger, { left: 360, top: 128, width: 30, height: 30 });

    const menu = placeToolbarMenu(trigger, 180);

    expect(menu.left + menu.width).toBe(390);
    expect(menu.left).toBe(210);
    sidebar.remove();
  });
});
