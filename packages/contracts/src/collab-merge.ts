import type { CollabReview } from './collab';

export interface CollabMergeResult {
  readonly value: unknown;
  readonly conflicts: readonly CollabReview[];
}

/**
 * Structured 3-way merge for team JSON. Non-overlapping edits combine.
 * The same node edited on both sides becomes a review item.
 */
export function mergeCollabDocument(
  file: string,
  base: unknown,
  ours: unknown,
  theirs: unknown,
  meta?: { readonly author?: string | null; readonly at?: string | null },
): CollabMergeResult {
  const conflicts: CollabReview[] = [];
  const value = mergeValue(file, base, ours, theirs, conflicts, meta);
  return { value, conflicts };
}

/**
 * Replaces one merged node with the chosen copy.
 */
export function applyCollabReviewChoice(document: unknown, itemId: string, chosen: unknown): unknown {
  if (itemId === '*')
    return chosen ?? document;
  if (chosen == null)
    return removeById(document, itemId);
  return upsertById(document, itemId, chosen).value;
}

function mergeValue(
  file: string,
  base: unknown,
  ours: unknown,
  theirs: unknown,
  conflicts: CollabReview[],
  meta: { readonly author?: string | null; readonly at?: string | null } | undefined,
): unknown {
  if (sameJson(ours, theirs) || sameJson(theirs, base))
    return ours;
  if (sameJson(ours, base))
    return theirs;
  if (Array.isArray(base) && Array.isArray(ours) && Array.isArray(theirs) && allIdentified(base, ours, theirs))
    return mergeIdArray(file, base, ours, theirs, conflicts, meta);
  if (isRecord(ours) && isRecord(theirs)) {
    const id = recordId(ours);
    if (id && id === recordId(theirs)) {
      const local: CollabReview[] = [];
      const nested = mergeRecord(file, isRecord(base) ? base : {}, ours, theirs, local, meta);
      const structural = local.some((item) => item.itemId === '*' || item.itemId === id);
      for (const item of local) {
        if (item.itemId !== '*' && item.itemId !== id)
          conflicts.push(item);
      }
      if (structural) {
        conflicts.push(reviewFor(file, ours, theirs, meta, id));
        return ours;
      }
      return nested;
    }
    return mergeRecord(file, isRecord(base) ? base : {}, ours, theirs, conflicts, meta);
  }
  conflicts.push(reviewFor(file, ours, theirs, meta));
  return ours;
}

function mergeRecord(
  file: string,
  base: Record<string, unknown>,
  ours: Record<string, unknown>,
  theirs: Record<string, unknown>,
  conflicts: CollabReview[],
  meta: { readonly author?: string | null; readonly at?: string | null } | undefined,
): Record<string, unknown> {
  const keys = new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)]);
  const next: Record<string, unknown> = {};
  for (const key of keys) {
    const inBase = Object.prototype.hasOwnProperty.call(base, key);
    const inOurs = Object.prototype.hasOwnProperty.call(ours, key);
    const inTheirs = Object.prototype.hasOwnProperty.call(theirs, key);
    if (!inOurs && !inTheirs)
      continue;
    if (!inOurs) {
      if (!inBase || !sameJson(base[key], theirs[key]))
        next[key] = theirs[key];
      continue;
    }
    if (!inTheirs) {
      if (!inBase || !sameJson(base[key], ours[key]))
        next[key] = ours[key];
      continue;
    }
    next[key] = mergeValue(file, inBase ? base[key] : undefined, ours[key], theirs[key], conflicts, meta);
  }
  return next;
}

function mergeIdArray(
  file: string,
  base: readonly unknown[],
  ours: readonly unknown[],
  theirs: readonly unknown[],
  conflicts: CollabReview[],
  meta: { readonly author?: string | null; readonly at?: string | null } | undefined,
): unknown[] {
  const baseMap = indexById(base);
  const oursMap = indexById(ours);
  const theirsMap = indexById(theirs);
  const order: string[] = [];
  const seen = new Set<string>();
  for (const item of [...ours, ...theirs, ...base]) {
    const id = recordId(item);
    if (!id || seen.has(id))
      continue;
    seen.add(id);
    order.push(id);
  }
  const next: unknown[] = [];
  for (const id of order) {
    const baseItem = baseMap.get(id);
    const ourItem = oursMap.get(id);
    const theirItem = theirsMap.get(id);
    const hasBase = baseMap.has(id);
    const hasOurs = oursMap.has(id);
    const hasTheirs = theirsMap.has(id);
    if (!hasOurs && !hasTheirs)
      continue;
    if (!hasOurs) {
      if (hasBase && theirItem !== undefined && !sameJson(baseItem, theirItem))
        conflicts.push(reviewFor(file, null, theirItem, meta, id));
      else if (!hasBase)
        next.push(theirItem);
      continue;
    }
    if (!hasTheirs) {
      if (hasBase && !sameJson(baseItem, ourItem))
        conflicts.push(reviewFor(file, ourItem, null, meta, id));
      if (!hasBase || !sameJson(baseItem, ourItem))
        next.push(ourItem);
      continue;
    }
    if (sameJson(ourItem, theirItem) || sameJson(theirItem, baseItem)) {
      next.push(ourItem);
      continue;
    }
    if (sameJson(ourItem, baseItem)) {
      next.push(theirItem);
      continue;
    }
    const nested = mergeValue(file, baseItem, ourItem, theirItem, conflicts, meta);
    if (conflicts.some((item) => item.itemId === id))
      next.push(ourItem);
    else
      next.push(nested);
  }
  return next;
}

function reviewFor(
  file: string,
  ours: unknown,
  theirs: unknown,
  meta: { readonly author?: string | null; readonly at?: string | null } | undefined,
  itemId = recordId(ours) ?? recordId(theirs) ?? '*',
): CollabReview {
  return {
    id: `${file}:${itemId}`,
    itemId,
    label: recordLabel(ours) || recordLabel(theirs) || file.replace(/\.json$/, ''),
    file,
    summary: summarizeChange(ours, theirs),
    author: meta?.author ?? null,
    at: meta?.at ?? null,
    ours,
    theirs,
  };
}

function summarizeChange(ours: unknown, theirs: unknown): string {
  if (!isRecord(ours) || !isRecord(theirs))
    return 'Details changed';
  const keys = new Set([...Object.keys(ours), ...Object.keys(theirs)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (!sameJson(ours[key], theirs[key]))
      changed.push(key);
  }
  if (changed.includes('url') || changed.includes('rawUrl'))
    return 'URL changed';
  if (changed.includes('method'))
    return 'Method changed';
  if (changed.includes('children') || changed.includes('steps') || changed.includes('nodes'))
    return 'Steps changed';
  if (changed.includes('variables'))
    return 'Variables changed';
  if (changed.includes('value'))
    return 'Value changed';
  if (changed.length === 1)
    return `${labelize(changed[0]!)} changed`;
  return 'Details changed';
}

function labelize(key: string): string {
  if (key === 'name')
    return 'Name';
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function removeById(value: unknown, itemId: string): unknown {
  if (Array.isArray(value))
    return value.filter((entry) => recordId(entry) !== itemId).map((entry) => removeById(entry, itemId));
  if (!isRecord(value))
    return value;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value))
    next[key] = removeById(child, itemId);
  return next;
}

function upsertById(
  value: unknown,
  itemId: string,
  chosen: unknown,
): { readonly value: unknown; readonly placed: boolean } {
  if (Array.isArray(value)) {
    let placed = false;
    const next = value.map((entry) => {
      const result = upsertById(entry, itemId, chosen);
      placed = placed || result.placed;
      return result.value;
    });
    if (placed)
      return { value: next, placed };
    const identified = value.some((entry) => recordId(entry));
    if (identified && recordId(chosen) === itemId)
      return { value: [...next, chosen], placed: true };
    return { value: next, placed: false };
  }
  if (!isRecord(value))
    return { value, placed: false };
  if (value['id'] === itemId)
    return { value: chosen, placed: true };
  let placed = false;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const result = upsertById(child, itemId, chosen);
    next[key] = result.value;
    placed = placed || result.placed;
  }
  return { value: next, placed };
}

function allIdentified(...lists: readonly (readonly unknown[])[]): boolean {
  return lists.every((list) => list.every((item) => recordId(item)));
}

function indexById(list: readonly unknown[]): Map<string, unknown> {
  const map = new Map<string, unknown>();
  for (const item of list) {
    const id = recordId(item);
    if (id)
      map.set(id, item);
  }
  return map;
}

function recordId(value: unknown): string | null {
  if (!isRecord(value) || typeof value['id'] !== 'string' || !value['id'])
    return null;
  return value['id'];
}

function recordLabel(value: unknown): string {
  if (!isRecord(value))
    return '';
  if (typeof value['name'] === 'string' && value['name'].trim())
    return value['name'].trim();
  if (typeof value['key'] === 'string' && value['key'].trim())
    return value['key'].trim();
  return '';
}

function sameJson(left: unknown, right: unknown): boolean {
  return stable(left) === stable(right);
}

function stable(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map((entry) => sortValue(entry));
  if (!isRecord(value))
    return value;
  const next: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort())
    next[key] = sortValue(value[key]);
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
