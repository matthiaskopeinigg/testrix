/**
 * After {@link JSON.stringify}(…, null, 2), expands inline `: []` / `: {}` so empty collections
 * stay multiline — easier to add entries and avoids collapsing layouts like `"k": [\n\n]` to `"k": []`.
 */
export function expandPrettyJsonEmptyCollections(prettyJson: string): string {
  const indentOfLineContaining = (s: string, idx: number): string => {
    const ls = s.lastIndexOf('\n', idx - 1);
    const lineStart = ls === -1 ? 0 : ls + 1;
    let j = lineStart;
    while (j < s.length && (s[j] === ' ' || s[j] === '\t')) {
      j++;
    }
    return s.slice(lineStart, j);
  };

  const matchColonThenEmptyCollection = (
    s: string,
    colonIdx: number,
  ): { kind: 'arr' | 'obj'; endExclusive: number } | null => {
    if (s[colonIdx] !== ':') {
      return null;
    }
    let j = colonIdx + 1;
    while (j < s.length && (s[j] === ' ' || s[j] === '\t')) {
      j++;
    }
    if (j < s.length && s[j] === '[') {
      let k = j + 1;
      while (k < s.length && (s[k] === ' ' || s[k] === '\t')) {
        k++;
      }
      if (k < s.length && s[k] === ']') {
        return { kind: 'arr', endExclusive: k + 1 };
      }
      return null;
    }
    if (j < s.length && s[j] === '{') {
      let k = j + 1;
      while (k < s.length && (s[k] === ' ' || s[k] === '\t')) {
        k++;
      }
      if (k < s.length && s[k] === '}') {
        return { kind: 'obj', endExclusive: k + 1 };
      }
      return null;
    }
    return null;
  };

  let out = '';
  let i = 0;
  let inString = false;
  let escapeNext = false;
  const n = prettyJson.length;

  while (i < n) {
    const c = prettyJson[i]!;
    if (inString) {
      out += c;
      if (escapeNext) {
        escapeNext = false;
      } else if (c === '\\') {
        escapeNext = true;
      } else if (c === '"') {
        inString = false;
      }
      i++;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      i++;
      continue;
    }
    if (c === ':') {
      const m = matchColonThenEmptyCollection(prettyJson, i);
      if (m) {
        const base = indentOfLineContaining(prettyJson, i);
        const inner = `${base}  `;
        out += m.kind === 'arr' ? `: [\n${inner}\n${base}]` : `: {\n${inner}\n${base}}`;
        i = m.endExclusive;
        continue;
      }
    }
    out += c;
    i++;
  }
  return out;
}
