import type { DatabaseType } from '../config/database-settings.schema';

import type { DatabaseQueryCompletionItem } from './database-query-editor';
import { databaseQueryEditorCompletions } from './database-query-editor';
import type {
  DatabaseCatalogColumn,
  DatabaseCatalogSchemaItem,
  DatabaseCatalogTable,
} from './database-introspect.schema';

export interface DatabaseCatalogCompletionSource {
  readonly schemas?: readonly DatabaseCatalogSchemaItem[];
  readonly tables?: readonly DatabaseCatalogTable[];
  readonly columnsByTable?: Readonly<Record<string, readonly DatabaseCatalogColumn[]>>;
}

/** What the caret is completing, for ranking and ghost text. */
export type SqlCompletionContextKind =
  | 'table-ref'
  | 'schema-dot'
  | 'table-dot'
  | 'column'
  | 'general';

export interface SqlCompletionContext {
  readonly kind: SqlCompletionContextKind;
  /** Schema or table qualifier before `.`. */
  readonly qualifier: string | null;
  /** Table from the nearest FROM/JOIN for column suggestions. */
  readonly fromTable: string | null;
}

/** Max schema / table rows offered without a typed prefix (avoids UI freezes). */
const MAX_UNPREFIXED_CATALOG_ITEMS = 24;

/** Max filtered catalog rows returned for a given caret context. */
const MAX_CATALOG_COMPLETION_ITEMS = 48;

/**
 * Classifies SQL completion context at the caret (FROM → tables, schema. → tables, …).
 */
export function detectSqlCompletionContext(source: string, caret: number): SqlCompletionContext {
  const before = source.slice(0, Math.max(0, Math.min(caret, source.length)));
  const dotted = before.match(/([A-Za-z_][\w$]*)\.([\w$]*)$/);
  const fromTable = tableReferenceBeforeCaret(source, caret);
  if (dotted?.[1]) {
    return {
      kind: 'table-dot',
      qualifier: dotted[1],
      fromTable,
    };
  }
  if (/\b(?:from|join|into|update|table)\s+[\w$."`]*$/i.test(before)) {
    return { kind: 'table-ref', qualifier: null, fromTable };
  }
  if (
    /\b(?:where|having|on|and|or|set|by|select|returning)\s+[\w$."`]*$/i.test(before) ||
    /[,(\s][\w$]*$/i.test(before)
  ) {
    return { kind: 'column', qualifier: null, fromTable };
  }
  return { kind: 'general', qualifier: null, fromTable };
}

/**
 * Merges keyword snippets with live catalog names using caret context.
 *
 * Prefers schemas/tables after FROM/JOIN, tables after `schema.`, columns after
 * `table.` or in WHERE/SELECT, matching DataGrip-style ranking.
 *
 * Large schema directories (Oracle `all_users`) must never dump hundreds of names
 * into the editor on a bare `FROM` — that freezes the UI.
 */
export function mergeDatabaseQueryCompletions(
  type: DatabaseType | null | undefined,
  catalog: DatabaseCatalogCompletionSource | null | undefined,
  source: string,
  caret: number,
): DatabaseQueryCompletionItem[] {
  const keywords = [...databaseQueryEditorCompletions(type)];
  if (type === 'redis' || !catalog) {
    return keywords;
  }

  const ctx = detectSqlCompletionContext(source, caret);
  const dotted = dottedPrefix(source, caret);
  const token = completionToken(source, caret);
  // schema. vs table.: prefer schema when qualifier matches a known schema with tables.
  const schemaQualifier = dotted?.table ?? null;
  const schemaMatch = schemaQualifier
    ? (catalog.schemas ?? []).find(
        (schema) => !schema.system && schema.name.toLowerCase() === schemaQualifier.toLowerCase(),
      )
    : undefined;
  const tablesUnderSchema = schemaMatch
    ? (catalog.tables ?? []).filter(
        (table) => table.schema.toLowerCase() === schemaMatch.name.toLowerCase(),
      )
    : [];
  const effectiveKind: SqlCompletionContextKind =
    dotted && schemaMatch && tablesUnderSchema.length > 0
      ? 'schema-dot'
      : dotted
        ? 'table-dot'
        : ctx.kind;

  if (effectiveKind === 'schema-dot' && schemaMatch) {
    const items = takePrefixed(
      tablesUnderSchema.map((table) => ({
        label: `${schemaMatch.name}.${table.name}`,
        insert: `${schemaMatch.name}.${table.name}`,
        detail: table.kind === 'view' ? 'View' : 'Table',
      })),
      token,
      MAX_CATALOG_COMPLETION_ITEMS,
    );
    return dedupeItems([...items, ...keywords]);
  }

  if (effectiveKind === 'table-dot' && dotted) {
    const table = resolveTable(catalog, dotted.table) ?? resolveTable(catalog, ctx.fromTable);
    const columns = table ? catalog.columnsByTable?.[tableKey(table)] ?? [] : [];
    const items = takePrefixed(
      columns.map((column) => ({
        label: `${dotted.table}.${column.name}`,
        insert: `${dotted.table}.${column.name}`,
        detail: columnDetail(column),
      })),
      token,
      MAX_CATALOG_COMPLETION_ITEMS,
    );
    return dedupeItems([...items, ...keywords]);
  }

  const fromTable = resolveTable(catalog, ctx.fromTable);
  const fromColumns = fromTable ? catalog.columnsByTable?.[tableKey(fromTable)] ?? [] : [];
  const columnItems = fromColumns.map((column) => ({
    label: column.name,
    insert: column.name,
    detail: columnDetail(column),
  }));

  const schemaItems = buildSchemaCompletionItems(catalog.schemas ?? [], token, effectiveKind);
  const tableItems = buildTableCompletionItems(catalog.tables ?? [], token, effectiveKind);

  if (effectiveKind === 'table-ref') {
    // Tables first; schemas only with a typed prefix when the directory is huge.
    // Never attach every column in the catalog after FROM — that freezes large DBs.
    return dedupeItems([
      ...tableItems,
      ...schemaItems,
      ...keywords,
      ...columnItems.slice(0, MAX_UNPREFIXED_CATALOG_ITEMS),
    ]);
  }

  const allColumns = collectOtherColumnItems(catalog, columnItems, token);
  if (effectiveKind === 'column') {
    return dedupeItems([
      ...columnItems,
      ...allColumns,
      ...tableItems.slice(0, MAX_UNPREFIXED_CATALOG_ITEMS),
      ...schemaItems.slice(0, MAX_UNPREFIXED_CATALOG_ITEMS),
      ...keywords,
    ]);
  }
  return dedupeItems([
    ...columnItems,
    ...tableItems.slice(0, MAX_UNPREFIXED_CATALOG_ITEMS),
    ...schemaItems.slice(0, MAX_UNPREFIXED_CATALOG_ITEMS),
    ...allColumns,
    ...keywords,
  ]);
}

/**
 * Schema or table the editor should load so completions stay useful while typing.
 */
export function catalogPrefetchTarget(
  source: string,
  caret: number,
  catalog: DatabaseCatalogCompletionSource | null | undefined,
): { readonly schema?: string; readonly table?: string } | null {
  if (!catalog) {
    return null;
  }
  const ctx = detectSqlCompletionContext(source, caret);
  const dotted = dottedPrefix(source, caret);
  if (dotted?.table) {
    const schema = (catalog.schemas ?? []).find(
      (entry) => entry.name.toLowerCase() === dotted.table.toLowerCase(),
    );
    if (schema) {
      return { schema: schema.name };
    }
    const table = resolveTable(catalog, dotted.table) ?? resolveTable(catalog, ctx.fromTable);
    if (table) {
      return { schema: table.schema, table: table.name };
    }
  }
  if (ctx.kind === 'table-ref') {
    const token = completionToken(source, caret);
    if (token) {
      const schemaHit = (catalog.schemas ?? []).find(
        (entry) => !entry.system && entry.name.toLowerCase().startsWith(token.toLowerCase()),
      );
      if (schemaHit) {
        return { schema: schemaHit.name };
      }
      const table = resolveTable(catalog, ctx.fromTable) ?? resolveTable(catalog, token);
      if (table) {
        return { schema: table.schema, table: table.name };
      }
    }
    // Bare FROM/JOIN: warm the first selected schema so table names can appear.
    const firstSchema = (catalog.schemas ?? []).find((entry) => !entry.system);
    if (firstSchema) {
      return { schema: firstSchema.name };
    }
  }
  return null;
}

function columnDetail(column: DatabaseCatalogColumn): string {
  return column.primaryKey ? `${column.type} PK` : column.type;
}

function buildSchemaCompletionItems(
  schemas: readonly DatabaseCatalogSchemaItem[],
  token: string,
  kind: SqlCompletionContextKind,
): DatabaseQueryCompletionItem[] {
  const candidates = schemas.filter((schema) => !schema.system);
  // After FROM with no typed token, skip schema names when there are many — tables matter more
  // and dumping 200–500 schema rows freezes the editor.
  if (kind === 'table-ref' && !token && candidates.length > MAX_UNPREFIXED_CATALOG_ITEMS) {
    return [];
  }
  const q = token.trim().toLowerCase();
  const matched = q
    ? candidates.filter((schema) => schema.name.toLowerCase().includes(q))
    : candidates;
  // Prefer prefix hits when filtering a large directory.
  const ordered = q
    ? [
        ...matched.filter((schema) => schema.name.toLowerCase().startsWith(q)),
        ...matched.filter((schema) => !schema.name.toLowerCase().startsWith(q)),
      ]
    : matched;
  return ordered.slice(0, MAX_CATALOG_COMPLETION_ITEMS).map((schema) => ({
    label: schema.name,
    insert: schema.name,
    detail: 'Schema',
  }));
}

function buildTableCompletionItems(
  tables: readonly DatabaseCatalogTable[],
  token: string,
  kind: SqlCompletionContextKind,
): DatabaseQueryCompletionItem[] {
  const q = token.trim().toLowerCase();
  const matched = q
    ? tables.filter((table) => {
        const qualified =
          table.schema && table.schema !== 'main'
            ? `${table.schema}.${table.name}`
            : table.name;
        return (
          table.name.toLowerCase().includes(q) ||
          qualified.toLowerCase().includes(q) ||
          table.schema.toLowerCase().includes(q)
        );
      })
    : tables;
  const limited = matched.slice(0, MAX_CATALOG_COMPLETION_ITEMS);
  return takePrefixed(
    limited.map((table) => {
      const qualified =
        table.schema && table.schema !== 'main' ? `${table.schema}.${table.name}` : table.name;
      return {
        label: qualified,
        insert: kind === 'table-ref' ? qualified : table.name,
        detail: table.kind === 'view' ? 'View' : 'Table',
      };
    }),
    token,
    MAX_CATALOG_COMPLETION_ITEMS,
  );
}

function collectOtherColumnItems(
  catalog: DatabaseCatalogCompletionSource,
  preferred: readonly DatabaseQueryCompletionItem[],
  token: string,
): DatabaseQueryCompletionItem[] {
  const seen = new Set(preferred.map((item) => item.label.toLowerCase()));
  const out: DatabaseQueryCompletionItem[] = [];
  for (const columns of Object.values(catalog.columnsByTable ?? {})) {
    for (const column of columns) {
      const key = column.name.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      out.push({
        label: column.name,
        insert: column.name,
        detail: columnDetail(column),
      });
      if (out.length >= MAX_CATALOG_COMPLETION_ITEMS) {
        return takePrefixed(out, token, MAX_CATALOG_COMPLETION_ITEMS);
      }
    }
  }
  return takePrefixed(out, token, MAX_CATALOG_COMPLETION_ITEMS);
}

function takePrefixed(
  items: readonly DatabaseQueryCompletionItem[],
  token: string,
  limit: number,
): DatabaseQueryCompletionItem[] {
  const q = token.trim().toLowerCase();
  if (!q) {
    return items.slice(0, Math.min(limit, MAX_UNPREFIXED_CATALOG_ITEMS));
  }
  const prefix: DatabaseQueryCompletionItem[] = [];
  const substring: DatabaseQueryCompletionItem[] = [];
  for (const item of items) {
    const label = item.label.toLowerCase();
    const insert = item.insert.toLowerCase();
    if (label.startsWith(q) || insert.startsWith(q)) {
      prefix.push(item);
    } else if (label.includes(q) || insert.includes(q)) {
      substring.push(item);
    }
    if (prefix.length >= limit) {
      return prefix.slice(0, limit);
    }
  }
  return [...prefix, ...substring].slice(0, limit);
}

function completionToken(source: string, caret: number): string {
  const before = source.slice(0, caret);
  const match = before.match(/(?:^|[^\w$])([\w$.]*)$/);
  return match?.[1] ?? '';
}

function dedupeItems(items: readonly DatabaseQueryCompletionItem[]): DatabaseQueryCompletionItem[] {
  const seen = new Set<string>();
  const out: DatabaseQueryCompletionItem[] = [];
  for (const item of items) {
    const key = `${item.insert.toLowerCase()}::${item.detail ?? ''}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(item);
  }
  return out;
}

function tableKey(table: DatabaseCatalogTable): string {
  return `${table.schema || 'main'}.${table.name}`;
}

function resolveTable(
  catalog: DatabaseCatalogCompletionSource,
  name: string | null | undefined,
): DatabaseCatalogTable | undefined {
  if (!name) {
    return undefined;
  }
  const bare = name.replace(/["`\[\]]/g, '');
  const parts = bare.split('.');
  const tableName = parts.at(-1)?.toLowerCase();
  const schemaName = parts.length > 1 ? parts[0]?.toLowerCase() : undefined;
  return (catalog.tables ?? []).find((table) => {
    if (table.name.toLowerCase() !== tableName) {
      return false;
    }
    if (schemaName && table.schema.toLowerCase() !== schemaName) {
      return false;
    }
    return true;
  });
}

function dottedPrefix(
  source: string,
  caret: number,
): { readonly table: string; readonly columnPrefix: string } | null {
  const before = source.slice(0, caret);
  const match = before.match(/([A-Za-z_][\w$]*)\.([\w$]*)$/);
  if (!match?.[1]) {
    return null;
  }
  return { table: match[1], columnPrefix: match[2] ?? '' };
}

function tableReferenceBeforeCaret(source: string, caret: number): string | null {
  const before = source.slice(0, caret);
  const matches = [
    ...before.matchAll(/\b(?:from|join|into|update|table)\s+([A-Za-z_][\w$."`]*)/gi),
  ];
  const last = matches.at(-1)?.[1];
  return last ? last.replace(/["`]/g, '') : null;
}
