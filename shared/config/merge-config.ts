/**
 * Plain-object deep merge for settings/session patches (validated after merge).
 */

export type MergeableRecord = Record<string, unknown>;

function isPlainRecord(v: unknown): v is MergeableRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function deepMerge<T extends MergeableRecord>(base: T, patch: MergeableRecord): T {
  const out: MergeableRecord = { ...base };
  for (const [key, val] of Object.entries(patch)) {
    if (val === undefined) {
      continue;
    }
    const existing = out[key];
    if (isPlainRecord(val) && isPlainRecord(existing)) {
      out[key] = deepMerge(existing, val);
      continue;
    }
    out[key] = val;
  }
  return out as T;
}
