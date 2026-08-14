/**
 * Mirrors `src/app/core/placeholders/dynamic-placeholders.ts` for the main process
 * (HTTP intercept body / headers resolved in Electron).
 */

const SIMPLE_NAMES = 'uuid|timestamp|isoTimestamp|isoDate';
const AFTER_DOLLAR = `(?:(?:randomInt|randomLong)\\(\\d+\\)|(?:${SIMPLE_NAMES})\\b|(?:randomInt|randomLong)\\b)`;
const DYNAMIC_BARE_RE = new RegExp(`\\$(${AFTER_DOLLAR})`, 'g');
const DYNAMIC_BRACED_RE = new RegExp(`\\{\\{\\s*\\$(${AFTER_DOLLAR})\\s*\\}\\}`, 'g');
const PARAM_FORM = /^(randomInt|randomLong)\((\d+)\)$/;

function randomUuid() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function randomDigitsOfLength(n) {
  const len = Math.min(Math.max(1, Math.floor(n)), 20);
  let s = '';
  for (let i = 0; i < len; i++) {
    s += String(Math.floor(Math.random() * 10));
  }
  return s;
}

function valueForSimpleName(name) {
  switch (name) {
    case 'uuid':
      return randomUuid();
    case 'timestamp':
      return String(Date.now());
    case 'isoTimestamp':
    case 'isoDate':
      return new Date().toISOString();
    case 'randomInt':
    case 'randomLong':
      return String(Math.floor(Math.random() * 900000000) + 100000000);
    default:
      return null;
  }
}

function valueForBareDynamic(afterDollar) {
  const trimmed = String(afterDollar || '').trim();
  const pm = PARAM_FORM.exec(trimmed);
  if (pm) {
    const digits = parseInt(pm[2], 10);
    if (digits < 1 || digits > 20) return null;
    return randomDigitsOfLength(digits);
  }
  return valueForSimpleName(trimmed);
}

/**
 * Replaces `{{$token}}` and `$token` (known names only) with generated values.
 * @param {string} input
 * @returns {string}
 */
function applyDynamicPlaceholders(input) {
  if (!input || typeof input !== 'string') return input;
  let s = input.replace(DYNAMIC_BRACED_RE, (full, afterDollar) => {
    const v = valueForBareDynamic(String(afterDollar).trim());
    return v != null ? v : full;
  });
  s = s.replace(DYNAMIC_BARE_RE, (full, afterDollar) => {
    const v = valueForBareDynamic(afterDollar);
    return v != null ? v : full;
  });
  return s;
}

module.exports = { applyDynamicPlaceholders };
