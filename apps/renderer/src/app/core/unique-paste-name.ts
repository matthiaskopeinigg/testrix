/**
 * Keeps `name` when the destination does not already use it.
 * Otherwise appends "copy", then "copy 2", and so on.
 */
export function uniquePasteName(name: string, existing: readonly string[], fallback = 'Item'): string {
  const used = new Set(existing)
  const base = name.trim() || fallback
  if (!used.has(base))
    return base
  const copy = `${base} copy`
  if (!used.has(copy))
    return copy
  let index = 2
  while (used.has(`${copy} ${index}`))
    index += 1
  return `${copy} ${index}`
}
