/**
 * Removes trailing statement terminators Oracle (and some drivers) reject.
 *
 * `node-oracledb` raises ORA-00911 when SQL ends with `;`.
 *
 * @param sql SQL text from the editor or an introspect helper.
 */
export function stripTrailingSqlSemicolons(sql: string): string {
  return sql.replace(/;+\s*$/g, '').trimEnd();
}
