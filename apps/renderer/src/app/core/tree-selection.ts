const OUTSIDE_SELECTION_KEEP = '.tx-menu, .cdk-overlay-pane, [role="dialog"]';

/**
 * True when the pointer landed outside a tree sidebar.
 * Menus and dialogs stay put so a menu action can still use the selection.
 */
export function isOutsideTreePointer(host: HTMLElement, event: Event): boolean {
  const target = event.target;
  if (!(target instanceof Node) || host.contains(target))
    return false;
  const element = target instanceof Element ? target : target.parentElement;
  return !element?.closest(OUTSIDE_SELECTION_KEEP);
}
