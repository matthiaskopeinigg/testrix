import {
  COLLECTIONS_FILE_NAME,
  ENVIRONMENTS_FILE_NAME,
} from '../config/constants';

export interface EntityJsonMergeResult {
  readonly merged: unknown;
  readonly conflictedIds: readonly string[];
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function asIdRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const id = (value as { id?: unknown }).id;
  if (typeof id !== 'string' || !id.trim()) {
    return null;
  }
  return value as Record<string, unknown>;
}

function indexById(items: readonly unknown[]): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const item of items) {
    const rec = asIdRecord(item);
    if (rec) {
      map.set(String(rec['id']), rec);
    }
  }
  return map;
}

function cloneJson<T>(value: T): T {
  return structuredClone(value);
}

function mergeIdArray(
  base: readonly unknown[],
  ours: readonly unknown[],
  theirs: readonly unknown[],
  childrenKey: string | null,
): { readonly items: unknown[]; readonly conflictedIds: string[] } {
  const baseMap = indexById(base);
  const oursMap = indexById(ours);
  const theirsMap = indexById(theirs);
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const item of ours) {
    const rec = asIdRecord(item);
    if (rec && !seen.has(String(rec['id']))) {
      ids.push(String(rec['id']));
      seen.add(String(rec['id']));
    }
  }
  for (const item of theirs) {
    const rec = asIdRecord(item);
    if (rec && !seen.has(String(rec['id']))) {
      ids.push(String(rec['id']));
      seen.add(String(rec['id']));
    }
  }

  const items: unknown[] = [];
  const conflictedIds: string[] = [];

  for (const id of ids) {
    const b = baseMap.get(id);
    const o = oursMap.get(id);
    const t = theirsMap.get(id);

    if (o && t && jsonEqual(o, t)) {
      items.push(cloneJson(o));
      continue;
    }
    if (o && !t) {
      if (!b || jsonEqual(o, b)) {
        if (!b) {
          items.push(cloneJson(o));
        }
      } else {
        conflictedIds.push(id);
        items.push(cloneJson(o));
      }
      continue;
    }
    if (t && !o) {
      if (!b || jsonEqual(t, b)) {
        if (!b) {
          items.push(cloneJson(t));
        }
      } else {
        conflictedIds.push(id);
        items.push(cloneJson(t));
      }
      continue;
    }
    if (!o || !t) {
      continue;
    }
    if (b && jsonEqual(o, b)) {
      items.push(cloneJson(t));
      continue;
    }
    if (b && jsonEqual(t, b)) {
      items.push(cloneJson(o));
      continue;
    }

    if (childrenKey && Array.isArray(o[childrenKey]) && Array.isArray(t[childrenKey])) {
      const baseChildren = Array.isArray(b?.[childrenKey]) ? (b[childrenKey] as unknown[]) : [];
      const nested = mergeIdArray(baseChildren, o[childrenKey] as unknown[], t[childrenKey] as unknown[], childrenKey);
      conflictedIds.push(...nested.conflictedIds);
      const oursMeta = { ...o, [childrenKey]: undefined };
      const theirsMeta = { ...t, [childrenKey]: undefined };
      const baseMeta = b ? { ...b, [childrenKey]: undefined } : null;
      let meta = oursMeta;
      if (baseMeta && jsonEqual(oursMeta, baseMeta)) {
        meta = theirsMeta;
      } else if (baseMeta && jsonEqual(theirsMeta, baseMeta)) {
        meta = oursMeta;
      } else if (!jsonEqual(oursMeta, theirsMeta)) {
        conflictedIds.push(id);
      }
      items.push({ ...cloneJson(meta), [childrenKey]: nested.items });
      continue;
    }

    conflictedIds.push(id);
    items.push(cloneJson(o));
  }

  return { items, conflictedIds };
}

/**
 * 3-way entity merge for `collections.json` (nodes by id, including folder children).
 */
export function mergeCollectionsJson(base: unknown, ours: unknown, theirs: unknown): EntityJsonMergeResult {
  const oursRec = ours && typeof ours === 'object' ? (ours as Record<string, unknown>) : {};
  const baseNodes = Array.isArray((base as { nodes?: unknown })?.nodes)
    ? ((base as { nodes: unknown[] }).nodes)
    : [];
  const oursNodes = Array.isArray(oursRec['nodes']) ? (oursRec['nodes'] as unknown[]) : [];
  const theirsNodes = Array.isArray((theirs as { nodes?: unknown })?.nodes)
    ? ((theirs as { nodes: unknown[] }).nodes)
    : [];
  const mergedNodes = mergeIdArray(baseNodes, oursNodes, theirsNodes, 'children');
  return {
    merged: {
      ...oursRec,
      nodes: mergedNodes.items,
      meta: {
        ...((oursRec['meta'] as object) ?? {}),
        updatedAt: new Date().toISOString(),
      },
    },
    conflictedIds: mergedNodes.conflictedIds,
  };
}

/**
 * 3-way entity merge for `environments.json` (environments and nested nodes by id).
 */
export function mergeEnvironmentsJson(base: unknown, ours: unknown, theirs: unknown): EntityJsonMergeResult {
  const oursRec = ours && typeof ours === 'object' ? (ours as Record<string, unknown>) : {};
  const baseEnvs = Array.isArray((base as { environments?: unknown })?.environments)
    ? ((base as { environments: unknown[] }).environments)
    : [];
  const oursEnvs = Array.isArray(oursRec['environments']) ? (oursRec['environments'] as unknown[]) : [];
  const theirsEnvs = Array.isArray((theirs as { environments?: unknown })?.environments)
    ? ((theirs as { environments: unknown[] }).environments)
    : [];

  const stripNodes = (list: unknown[]): unknown[] =>
    list.map((item) => {
      const rec = asIdRecord(item);
      return rec ? { ...rec, nodes: [] } : item;
    });
  const envMerge = mergeIdArray(stripNodes(baseEnvs), stripNodes(oursEnvs), stripNodes(theirsEnvs), null);
  const conflictedIds = [...envMerge.conflictedIds];
  const environments = envMerge.items.map((item) => {
    const rec = asIdRecord(item);
    if (!rec) {
      return item;
    }
    const id = String(rec['id']);
    const b = asIdRecord(baseEnvs.find((row) => asIdRecord(row)?.['id'] === id) ?? null);
    const o = asIdRecord(oursEnvs.find((row) => asIdRecord(row)?.['id'] === id) ?? rec);
    const t = asIdRecord(theirsEnvs.find((row) => asIdRecord(row)?.['id'] === id) ?? rec);
    if (!o || !t) {
      return rec;
    }
    const nested = mergeIdArray(
      Array.isArray(b?.['nodes']) ? (b['nodes'] as unknown[]) : [],
      Array.isArray(o['nodes']) ? (o['nodes'] as unknown[]) : [],
      Array.isArray(t['nodes']) ? (t['nodes'] as unknown[]) : [],
      'children',
    );
    conflictedIds.push(...nested.conflictedIds);
    return { ...rec, nodes: nested.items };
  });

  return {
    merged: {
      ...oursRec,
      environments,
      meta: {
        ...((oursRec['meta'] as object) ?? {}),
        updatedAt: new Date().toISOString(),
      },
    },
    conflictedIds,
  };
}

/**
 * Attempts an entity merge for a known workspace JSON file. Returns `null` when the file is not mergeable this way.
 */
export function tryEntityMergeWorkspaceFile(
  fileName: string,
  base: unknown,
  ours: unknown,
  theirs: unknown,
): EntityJsonMergeResult | null {
  if (fileName === COLLECTIONS_FILE_NAME || fileName.endsWith(`/${COLLECTIONS_FILE_NAME}`)) {
    return mergeCollectionsJson(base, ours, theirs);
  }
  if (fileName === ENVIRONMENTS_FILE_NAME || fileName.endsWith(`/${ENVIRONMENTS_FILE_NAME}`)) {
    return mergeEnvironmentsJson(base, ours, theirs);
  }
  return null;
}
