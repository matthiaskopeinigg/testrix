/**
 * Removes trailing statement terminators Oracle (and some drivers) reject.
 *
 * `node-oracledb` raises ORA-00911 when SQL ends with `;` (or a fullwidth `；`).
 *
 * @param sql SQL text from the editor or an introspect helper.
 */
export function stripTrailingSqlSemicolons(sql: string): string {
  let out = sql.replace(/^\uFEFF/, '').trimEnd();
  // ASCII `;`, fullwidth `；`, and trailing whitespace / blank lines after them.
  out = out.replace(/(?:[;；]+\s*)+$/u, '').trimEnd();
  // SQL*Plus style terminator: a lone `/` on the last line.
  out = out.replace(/(?:\r?\n)\s*\/\s*$/u, '').trimEnd();
  return out;
}
