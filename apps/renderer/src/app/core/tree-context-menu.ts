/** Right-click in a tree row's left indent, before the chevron and label. */
export function isContextMenuLeftOfRow(event: MouseEvent): boolean {
  const row = contextMenuRow(event);
  if (!row)
    return false;
  const rect = row.getBoundingClientRect();
  const padLeft = Number.parseFloat(getComputedStyle(row).paddingLeft) || 0;
  return event.clientX < rect.left + padLeft;
}

/**
 * Right-click on a sidebar toolbar, including the gap beside sort, filter, and the other tools.
 * Text fields keep their own menu.
 */
export function isSidebarToolbarContext(event: MouseEvent): boolean {
  const target = event.target;
  if (!(target instanceof Element))
    return false;
  if (target.closest('input, textarea, select, [contenteditable="true"]'))
    return false;
  if (target.closest('.tx-menu'))
    return false;
  return Boolean(target.closest('[data-sidebar-toolbar]'));
}

function contextMenuRow(event: MouseEvent): HTMLElement | null {
  const current = event.currentTarget;
  if (current instanceof HTMLElement && current.hasAttribute('data-tree-row'))
    return current;
  const target = event.target;
  if (!(target instanceof Element))
    return null;
  const row = target.closest('[data-tree-row]');
  return row instanceof HTMLElement ? row : null;
}
