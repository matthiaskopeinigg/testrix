const fsp = require('fs').promises;
const { applyDynamicPlaceholders } = require('./apply-dynamic-placeholders');

const INTERCEPT_REPLACE_BODY_TYPES = new Set([
  'none',
  'json',
  'xml',
  'text',
  'graphql',
  'form-data',
  'urlencoded',
  'binary',
]);

/**
 * Applies query-param mutations to an absolute URL (replace/remove keys). Names match without regard to current casing.
 * @param {string} urlStr
 * @param {Array<{ key?: string; value?: string; enabled?: boolean; mode?: string }>} rows
 * @returns {string}
 */
function applyInterceptQueryMutations(urlStr, rows) {
  if (!urlStr || !Array.isArray(rows) || rows.length === 0) return urlStr;
  let u;
  try {
    u = new URL(urlStr);
  } catch {
    return urlStr;
  }
  for (const row of rows) {
    if (!row || row.enabled === false) continue;
    const k = String(row.key || '').trim();
    if (!k) continue;
    const mode = row.mode === 'remove' ? 'remove' : 'set';
    if (mode === 'remove') {
      u.searchParams.delete(k);
      continue;
    }
    u.searchParams.set(k, String(row.value ?? ''));
  }
  return u.toString();
}

/**
 * Computes base64 postData for Fetch.continueRequest, or SKIP when the outgoing body must stay unchanged.
 * @param {object} reg normalized intercept registration
 * @returns {Promise<'SKIP'|string>}
 */
async function resolveInterceptPostDataBase64(reg) {
  const btRaw = String(reg.replaceBodyType || 'none').trim();
  const bt = INTERCEPT_REPLACE_BODY_TYPES.has(btRaw) ? btRaw : 'none';
  if (bt === 'none') return 'SKIP';

  if (bt === 'binary') {
    const fp = String(reg.replaceBinaryFilePath || '').trim();
    if (!fp) return 'SKIP';
    try {
      const buf = await fsp.readFile(fp);
      return buf.toString('base64');
    } catch (err) {
      console.warn('[HTTP intercept] binary body read failed:', err.message || err);
      return 'SKIP';
    }
  }

  const raw = String(reg.replacePostBody ?? '');
  const resolved = applyDynamicPlaceholders(raw);
  return Buffer.from(resolved, 'utf8').toString('base64');
}

module.exports = {
  INTERCEPT_REPLACE_BODY_TYPES,
  applyInterceptQueryMutations,
  resolveInterceptPostDataBase64,
};
