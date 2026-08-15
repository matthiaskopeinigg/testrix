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

/**
 * Merges keyword snippets with live catalog names, preferring columns of the FROM/JOIN table.
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
  const tableRef = tableReferenceBeforeCaret(source, caret);
  const dotted = dottedPrefix(source, caret);
  const columnItems: DatabaseQueryCompletionItem[] = [];
  if (dotted || tableRef) {
    const table = resolveTable(catalog, dotted?.table ?? tableRef);
    const columns = table ? catalog.columnsByTable?.[tableKey(table)] ?? [] : [];
    for (const column of columns) {
      const insert = dotted ? `${dotted.table}.${column.name}` : column.name;
      columnItems.push({
        label: dotted ? `${dotted.table}.${column.name}` : column.name,
        insert,
        detail: column.primaryKey ? `${column.type} PK` : column.type,
      });
    }
  }
  const schemaItems = (catalog.schemas ?? [])
    .filter((schema) => !schema.system)
    .map((schema) => ({
      label: schema.name,
      insert: schema.name,
      detail: 'Schema',
    }));
  const tableItems = (catalog.tables ?? []).map((table) => ({
    label: table.schema && table.schema !== 'main' ? `${table.schema}.${table.name}` : table.name,
    insert: table.name,
    detail: table.kind === 'view' ? 'View' : 'Table',
  }));
  const allColumns: DatabaseQueryCompletionItem[] = [];
  for (const columns of Object.values(catalog.columnsByTable ?? {})) {
    for (const column of columns) {
      if (columnItems.some((item) => item.label === column.name)) {
        continue;
      }
      allColumns.push({
        label: column.name,
        insert: column.name,
        detail: column.primaryKey ? `${column.type} PK` : column.type,
      });
    }
  }
  return [...columnItems, ...tableItems, ...schemaItems, ...allColumns, ...keywords];
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
  const matches = [...before.matchAll(/\b(?:from|join)\s+([A-Za-z_][\w$."`]*)/gi)];
  const last = matches.at(-1)?.[1];
  return last ? last.replace(/["`]/g, '') : null;
}
