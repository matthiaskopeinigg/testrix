// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { isContextMenuLeftOfRow, isSidebarToolbarContext } from './tree-context-menu';

describe('isContextMenuLeftOfRow', () => {
  it('is true in the indent left of the row content and false on the label', () => {
    const row = document.createElement('div');
    row.setAttribute('data-tree-row', '');
    row.style.paddingLeft = '24px';
    document.body.appendChild(row);
    const rect = {
      left: 100,
      top: 0,
      right: 280,
      bottom: 30,
      width: 180,
      height: 30,
      x: 100,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;
    row.getBoundingClientRect = () => rect;

    let gutter = false;
    let onLabel = false;
    row.addEventListener('contextmenu', (event) => {
      if (event.clientX === 110)
        gutter = isContextMenuLeftOfRow(event);
      if (event.clientX === 140)
        onLabel = isContextMenuLeftOfRow(event);
    });

    row.dispatchEvent(new MouseEvent('contextmenu', { clientX: 110, bubbles: true }));
    row.dispatchEvent(new MouseEvent('contextmenu', { clientX: 140, bubbles: true }));

    expect(gutter).toBe(true);
    expect(onLabel).toBe(false);
    row.remove();
  });
});

describe('isSidebarToolbarContext', () => {
  it('is true beside toolbar buttons and false inside a text field or open menu', () => {
    const toolbar = document.createElement('div');
    toolbar.setAttribute('data-sidebar-toolbar', '');
    const actions = document.createElement('div');
    const button = document.createElement('button');
    const input = document.createElement('input');
    const menu = document.createElement('div');
    menu.className = 'tx-menu';
    actions.append(button);
    toolbar.append(actions, input, menu);
    document.body.appendChild(toolbar);

    const onActions = new MouseEvent('contextmenu', { bubbles: true });
    Object.defineProperty(onActions, 'target', { value: actions });
    const onButton = new MouseEvent('contextmenu', { bubbles: true });
    Object.defineProperty(onButton, 'target', { value: button });
    const onInput = new MouseEvent('contextmenu', { bubbles: true });
    Object.defineProperty(onInput, 'target', { value: input });
    const onMenu = new MouseEvent('contextmenu', { bubbles: true });
    Object.defineProperty(onMenu, 'target', { value: menu });

    expect(isSidebarToolbarContext(onActions)).toBe(true);
    expect(isSidebarToolbarContext(onButton)).toBe(true);
    expect(isSidebarToolbarContext(onInput)).toBe(false);
    expect(isSidebarToolbarContext(onMenu)).toBe(false);
    toolbar.remove();
  });
});
