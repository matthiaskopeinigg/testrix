/**
 * Tokenizes a Redis command line, preserving quoted strings with spaces.
 *
 * @example
 * tokenizeRedisQuery('SET key "hello world"')
 * // => ['SET', 'key', 'hello world']
 */
export function tokenizeRedisQuery(query: string): readonly string[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const tokens: string[] = [];
  let i = 0;

  while (i < trimmed.length) {
    while (i < trimmed.length && /\s/.test(trimmed[i]!)) {
      i += 1;
    }
    if (i >= trimmed.length) {
      break;
    }

    const quote = trimmed[i];
    if (quote === '"' || quote === "'") {
      i += 1;
      let value = '';
      while (i < trimmed.length && trimmed[i] !== quote) {
        if (trimmed[i] === '\\' && i + 1 < trimmed.length) {
          i += 1;
          value += trimmed[i];
        } else {
          value += trimmed[i];
        }
        i += 1;
      }
      if (i >= trimmed.length || trimmed[i] !== quote) {
        throw new Error('Unclosed quoted string in Redis query');
      }
      i += 1;
      tokens.push(value);
      continue;
    }

    let token = '';
    while (i < trimmed.length && !/\s/.test(trimmed[i]!)) {
      token += trimmed[i];
      i += 1;
    }
    tokens.push(token);
  }

  return tokens;
}
