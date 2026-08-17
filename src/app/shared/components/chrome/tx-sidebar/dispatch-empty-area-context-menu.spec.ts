import { describe, expect, it, vi } from 'vitest';

import {
  dispatchEmptyAreaContextMenu,
  findSidebarEmptyContextTarget,
  shouldPassthroughSidebarContextMenu,
} from './dispatch-empty-area-context-menu';

describe('dispatchEmptyAreaContextMenu', () => {
  it('finds the projected panel body inside the workspace shell', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div class="workspace-panel-shell__body">
        <div class="collections-sidebar-panel__body"></div>
      </div>
    `;
    expect(findSidebarEmptyContextTarget(root)?.className).toBe('collections-sidebar-panel__body');
  });

  it('ignores right-clicks that started on an input or button', () => {
    const input = document.createElement('input');
    expect(shouldPassthroughSidebarContextMenu(input)).toBe(true);
    const button = document.createElement('button');
    expect(shouldPassthroughSidebarContextMenu(button)).toBe(true);
  });

  it('replays a header click onto the empty-area body', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <header class="tx-sidebar__panel-header"><h2>Collections</h2></header>
      <div class="workspace-panel-shell__body">
        <div class="collections-sidebar-panel__body"></div>
      </div>
    `;
    const body = root.querySelector('.collections-sidebar-panel__body')!;
    const handler = vi.fn();
    body.addEventListener('contextmenu', handler);

    const header = root.querySelector('h2')!;
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 12, clientY: 24 });
    Object.defineProperty(event, 'target', { value: header });
    const retargeted = dispatchEmptyAreaContextMenu(event, root);

    expect(retargeted).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not replay a click that already started inside the empty-area body', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div class="workspace-panel-shell__body">
        <div class="collections-sidebar-panel__body"><span class="tx-tree__empty-space"></span></div>
      </div>
    `;
    const body = root.querySelector('.collections-sidebar-panel__body')!;
    const handler = vi.fn();
    body.addEventListener('contextmenu', handler);

    const pad = root.querySelector('.tx-tree__empty-space')!;
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'target', { value: pad });

    expect(dispatchEmptyAreaContextMenu(event, root)).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not retarget right-clicks on toolbar buttons', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div class="workspace-panel-shell__body">
        <div class="collections-sidebar-panel__body"></div>
      </div>
    `;
    const button = document.createElement('button');
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'target', { value: button });

    expect(dispatchEmptyAreaContextMenu(event, root)).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  });
});
