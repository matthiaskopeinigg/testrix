/**
 * True when the event target is an editable field — selection hotkeys must not steal typing.
 */
export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element))
    return false;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
    return !target.readOnly && !target.disabled;
  if (target instanceof HTMLSelectElement)
    return !target.disabled;
  if ((target as HTMLElement).isContentEditable)
    return true;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

/** Ctrl/Cmd + letter (case-insensitive), ignoring Alt. */
export function isModKey(event: KeyboardEvent, key: string): boolean {
  if (!(event.ctrlKey || event.metaKey) || event.altKey)
    return false;
  return event.key.toLowerCase() === key.toLowerCase();
}

/** True when focus is on the flow canvas (node/wire shortcuts own Delete / Ctrl+A). */
export function isFlowCanvasKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element))
    return false;
  return Boolean(target.closest('.tx-flow-canvas'));
}

/** True when the flow canvas currently shows a node or wire selection. */
export function flowCanvasHasSelection(): boolean {
  return Boolean(
    document.querySelector(
      '.tx-flow-canvas .tx-flow-node.is-selected, .tx-flow-canvas .tx-flow-canvas__edge.is-selected, .tx-flow-canvas .tx-flow-canvas__edge-label.is-selected',
    ),
  );
}

/**
 * When the flow canvas has focus and a selection, it owns Delete / Ctrl+A / Ctrl+D.
 * An empty canvas yields to sidebar selection shortcuts (delete the open flow, etc.).
 */
export function shouldDeferToFlowCanvas(event: KeyboardEvent): boolean {
  if (!isFlowCanvasKeyboardTarget(document.activeElement))
    return false;
  if (isModKey(event, 'a'))
    return true;
  return flowCanvasHasSelection();
}
