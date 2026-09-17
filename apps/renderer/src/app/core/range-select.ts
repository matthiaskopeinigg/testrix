export interface RangeSelectInput {
  readonly ids: readonly string[];
  readonly anchorId: string | null;
  readonly targetId: string;
}

export interface SelectionEntry {
  readonly ids: readonly string[];
  readonly anchorId: string | null;
}

/** True when Ctrl (Windows/Linux) or Cmd (macOS) is held. */
export function isToggleModifier(event: { readonly ctrlKey: boolean; readonly metaKey: boolean }): boolean {
  return event.ctrlKey || event.metaKey;
}

export function isRangeModifier(event: { readonly shiftKey: boolean }): boolean {
  return event.shiftKey;
}

/**
 * Inclusive range from the anchor to `targetId` in `ids` visual order.
 * Missing anchor falls back to a single-item selection on the target.
 */
export function applyRangeSelect(input: RangeSelectInput): SelectionEntry {
  const { ids, targetId } = input;
  const targetIndex = ids.indexOf(targetId);
  if (targetIndex < 0) {
    return { ids: [], anchorId: null };
  }
  const anchorIndex = input.anchorId ? ids.indexOf(input.anchorId) : -1;
  if (anchorIndex < 0) {
    return { ids: [targetId], anchorId: targetId };
  }
  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  return { ids: ids.slice(start, end + 1), anchorId: input.anchorId };
}

/** Adds `targetId` if missing, otherwise removes it. Anchor becomes the target. */
export function applyToggleSelect(input: {
  readonly selectedIds: readonly string[];
  readonly targetId: string;
}): SelectionEntry {
  const has = input.selectedIds.includes(input.targetId);
  const ids = has
    ? input.selectedIds.filter((id) => id !== input.targetId)
    : [...input.selectedIds, input.targetId];
  return { ids, anchorId: input.targetId };
}

export function applySingleSelect(targetId: string): SelectionEntry {
  return { ids: [targetId], anchorId: targetId };
}

/**
 * A plain click on a row that is already in a multi-set keeps the set so a drag can start.
 * Sole selected rows still activate as a normal click.
 */
export function shouldKeepPointerSelection(options: {
  readonly event: { readonly shiftKey: boolean; readonly ctrlKey: boolean; readonly metaKey: boolean };
  readonly selectedIds: readonly string[];
  readonly targetId: string;
}): boolean {
  if (isRangeModifier(options.event) || isToggleModifier(options.event)) {
    return false;
  }
  return options.selectedIds.includes(options.targetId) && options.selectedIds.length > 1;
}

export function emptySelection(): SelectionEntry {
  return { ids: [], anchorId: null };
}

/**
 * Resolves click modifiers into the next selection.
 * Shift wins over Ctrl so a range replace stays predictable.
 */
export function applyPointerSelect(options: {
  readonly event: { readonly shiftKey: boolean; readonly ctrlKey: boolean; readonly metaKey: boolean };
  readonly visibleIds: readonly string[];
  readonly selectedIds: readonly string[];
  readonly anchorId: string | null;
  readonly targetId: string;
}): SelectionEntry {
  if (isRangeModifier(options.event)) {
    return applyRangeSelect({
      ids: options.visibleIds,
      anchorId: options.anchorId,
      targetId: options.targetId,
    });
  }
  if (isToggleModifier(options.event)) {
    return applyToggleSelect({ selectedIds: options.selectedIds, targetId: options.targetId });
  }
  return applySingleSelect(options.targetId);
}
