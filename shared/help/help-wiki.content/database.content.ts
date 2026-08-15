import { wikiSection } from '../help-wiki.builders';
import type { HelpWikiSection } from '../help-wiki.schema';

/** Help wiki pages for the Database sidebar and workbench. */
export const HELP_WIKI_DATABASE_SECTIONS: readonly HelpWikiSection[] = [
  wikiSection({
    id: 'database-workspace',
    groupId: 'database',
    label: 'Database sidebar',
    icon: 'database',
    title: 'Database sidebar',
    description: 'Connections, saved queries, and catalog browsing.',
    blocks: [
      {
        type: 'paragraph',
        text: 'The Database rail (icon labeled Database) opens a split panel: Connections on top and Queries below. Use it to save database connections, browse schemas, tables, and collections, and keep SQL, Redis, or MongoDB queries next to the workbench.',
      },
      {
        type: 'subheading',
        text: 'Panel layout',
      },
      {
        type: 'list',
        items: [
          'Connections and Queries each collapse independently. Both start expanded.',
          'Search filters connection and query names. Filter and sort menus refine the Queries list.',
          'Right-click a connection → Schemas… to search and choose which schemas appear (useful when a database has hundreds of schemas). Only selected schemas show under the connection; Hide schema removes one from the tree.',
          'Right-click empty space in a section to create a folder or item at the root.',
          'Double-click a folder, connection, or query name to rename it inline.',
          'Drag connections to reorder them or drop them onto a folder.',
        ],
      },
      {
        type: 'note',
        title: 'Where data is stored',
        text: 'Connections are shared in settings.json (all profiles). Saved queries are profile-local in queries.json. Export both from Settings → Data & Config → Export, under the Database section.',
      },
    ],
  }),
  wikiSection({
    id: 'database-connections',
    groupId: 'database',
    label: 'Connections',
    icon: 'folder',
    title: 'Database connections',
    description: 'Connection folders, editor, catalog, and test.',
    blocks: [
      {
        type: 'paragraph',
        text: 'A connection is a saved profile for PostgreSQL, MySQL, MariaDB, SQL Server, Oracle, SQLite, CockroachDB, ClickHouse, MongoDB, or Redis. Click a connection to expand its catalog (schemas, tables, views, or collections). Open Connection settings from the context menu to edit host, credentials, and TLS.',
      },
      {
        type: 'list',
        items: [
          'New folder / New connection — right-click the Connections list or a folder. The connection editor can also move a connection into an existing folder.',
          'Connection settings — host, port, user, password, database name, Oracle service name / SID, SQLite file path, TLS, and timeouts (context menu).',
          'Test connection — probes the server without running a query.',
          'Connect on boot — Testrix probes the connection when the app starts.',
          'Open catalog — expands schemas and objects. Refresh reloads the catalog.',
          'New query — creates a saved query already pointed at this connection.',
          'Open data — opens a table data tab for the selected table or view.',
          'Duplicate, rename, or delete from the context menu.',
        ],
      },
      {
        type: 'tip',
        title: 'Local Docker databases',
        text: 'From the repo, run docker compose up -d. Add PostgreSQL on localhost:5432 (user, password, and database testrix) or Redis on localhost:6379.',
      },
      {
        type: 'note',
        title: 'Oracle and MongoDB',
        text: 'Oracle matches DataGrip JDBC: host, port 1521, and a service name (Use SID off → SERVICE_NAME) or SID (Use SID on). Paste a jdbc:oracle:thin:@… URL into Service name if needed. DataGrip’s JDBC driver accepts old 10G password hashes; Testrix’s Thin driver does not. For those accounts, install Oracle Instant Client and set Instant Client folder (oci.dll). For MongoDB Atlas, paste a mongodb+srv:// URI into Host.',
      },
    ],
  }),
  wikiSection({
    id: 'database-queries',
    groupId: 'database',
    label: 'Saved queries',
    icon: 'fileText',
    title: 'Saved queries',
    description: 'SQL, Redis, and MongoDB editors, run, and result export.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Saved queries live in the Queries section. Click a query to open its editor. Pick a connection on the tab, then write SQL, Redis commands, or MongoDB shell snippets. Results appear in a spreadsheet-style grid below the editor.',
      },
      {
        type: 'list',
        items: [
          'Press Ctrl+Enter (⌘Enter on macOS) to run the statement at the caret, or the selected text.',
          'The result grid shows row numbers and NULL cells. Select a range to copy or export a slice.',
          'Export the grid as CSV, TSV, JSON, Markdown, or HTML.',
          'Drag the split between editor and results, or hide the result pane. Height is remembered per query.',
          'Right-click a query to open, rename, duplicate, or delete it. Folders can nest.',
          'A Test Suite DATABASE step can select a saved query instead of writing SQL on the step.',
        ],
      },
      {
        type: 'note',
        text: 'Test suite DATABASE steps can write SQL inline or select a saved query from this list. The flow uses the query text at run time, so edits here apply on the next run.',
      },
    ],
  }),
  wikiSection({
    id: 'database-table-data',
    groupId: 'database',
    label: 'Table data',
    icon: 'play',
    title: 'Table data',
    description: 'Browse rows, filter with WHERE, and edit in place.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Click a table or view to open a data tab. Columns, indexes, and foreign keys stay collapsed until you choose Table information from the context menu. Testrix loads a paged SELECT so you can inspect and edit rows without writing SQL first.',
      },
      {
        type: 'list',
        items: [
          'The WHERE bar suggests column names at the start of a predicate. Press Enter on an empty filter to load all rows.',
          'Double-click a cell to edit it. Submit writes the pending DML; Revert discards unsaved cell edits.',
          'Table information on a table or view expands Columns, Indexes, and related objects.',
          'Show DDL on a table or view copies or displays the object definition when the driver supports it.',
        ],
      },
      {
        type: 'tip',
        text: 'For ad-hoc SQL that is not tied to one table, create a saved query instead of a table data tab.',
      },
    ],
  }),
];
