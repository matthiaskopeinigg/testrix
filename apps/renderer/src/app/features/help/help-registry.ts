export type HelpSectionId =
  | 'start'
  | 'workbench'
  | 'collections'
  | 'environments'
  | 'database'
  | 'workspaces'
  | 'tools'
  | 'shortcuts'
  | 'settings'
  | 'network'
  | 'data'
  | 'tips';

export interface HelpNavItem {
  readonly id: HelpSectionId;
  readonly label: string;
  readonly group: string;
  readonly summary: string;
}

export interface HelpArticle {
  readonly id: string;
  readonly section: HelpSectionId;
  readonly title: string;
  readonly summary: string;
  readonly body: readonly string[];
  readonly tips: readonly string[];
  readonly keywords: string;
}

export const HELP_NAV: readonly HelpNavItem[] = [
  { id: 'start', label: 'Getting started', group: 'Basics', summary: 'What Testrix is and how the shell is laid out.' },
  { id: 'workbench', label: 'Workbench', group: 'Workspace', summary: 'Tabs, splits, and request editors.' },
  { id: 'collections', label: 'Collections', group: 'Workspace', summary: 'Folders, HTTP, and WebSocket requests.' },
  { id: 'environments', label: 'Environments', group: 'Workspace', summary: 'Variables, secrets, and the environment picker.' },
  { id: 'database', label: 'Database', group: 'Workspace', summary: 'Connections, saved queries, and table data.' },
  { id: 'workspaces', label: 'Workspaces', group: 'Workspace', summary: 'Separate collections and environments on disk.' },
  { id: 'tools', label: 'Tools', group: 'Workspace', summary: 'Local utilities such as UUID, Base64, JWT, and Cron.' },
  { id: 'shortcuts', label: 'Shortcuts', group: 'Controls', summary: 'Palette, settings, sidebar, and Help.' },
  { id: 'settings', label: 'Settings', group: 'Controls', summary: 'Theme, type, logging, and keyboard chords.' },
  { id: 'network', label: 'Network', group: 'Controls', summary: 'Proxy, DNS, and certificates.' },
  { id: 'data', label: 'Data & privacy', group: 'Controls', summary: 'Local JSON files and config folders.' },
  { id: 'tips', label: 'Tips', group: 'Tips', summary: 'Small habits that speed up daily work.' },
];

export const HELP_NAV_GROUPS: readonly {
  readonly label: string;
  readonly ids: readonly HelpSectionId[];
}[] = [
  { label: 'Basics', ids: ['start'] },
  { label: 'Workspace', ids: ['workbench', 'collections', 'environments', 'database', 'workspaces', 'tools'] },
  { label: 'Controls', ids: ['shortcuts', 'settings', 'network', 'data'] },
  { label: 'Tips', ids: ['tips'] },
];

export const HELP_ARTICLES: readonly HelpArticle[] = [
  {
    id: 'start-local',
    section: 'start',
    title: 'Local-first workbench',
    summary: 'Collections, environments, and session state stay on this PC.',
    body: [
      'Testrix is a desktop API workbench. It does not create a cloud account, and the workbench does not call a Testrix backend, CDN, or telemetry endpoint.',
      'The left rail switches Collections, Environments, Database, and Tools. Services is a placeholder for later 2.0 work.',
    ],
    tips: ['Open Help anytime with F1 or the question-mark icon at the bottom of the rail.'],
    keywords: 'local offline privacy start intro desktop electron',
  },
  {
    id: 'start-chrome',
    section: 'start',
    title: 'Shell chrome',
    summary: 'Titlebar, rail, sidebar, and canvas.',
    body: [
      'The titlebar holds the workspace switcher, environment picker, Settings, and window controls.',
      'The activity rail is always visible. Click a section to show its sidebar. Click the active section again to collapse the sidebar.',
      'The canvas is the workbench: tab groups, editors, and the welcome screen when nothing is open.',
    ],
    tips: ['Ctrl B toggles the sidebar without changing the active rail.'],
    keywords: 'rail sidebar titlebar canvas layout chrome collapse',
  },
  {
    id: 'workbench-tabs',
    section: 'workbench',
    title: 'Tabs and splits',
    summary: 'HTTP, WebSocket, environment, and tool tabs share one workbench.',
    body: [
      'Open a collection request, environment, or tool to add a tab. Tabs can sit in more than one group so you can compare editors side by side.',
      'Drag a tab onto the right edge of a group to split. Drag tabs to reorder them. Each group keeps its own active tab.',
    ],
    tips: ['New tabs open with a short spring so you can see which panel just appeared.'],
    keywords: 'tabs split group drag workbench editor http websocket',
  },
  {
    id: 'workbench-editors',
    section: 'workbench',
    title: 'Editors',
    summary: 'Request, WebSocket, environment, and tool surfaces.',
    body: [
      'HTTP tabs hold method, URL, params, headers, body, and auth. WebSocket tabs hold a connection URL and message composer.',
      'Environment tabs edit variables for the selected environment. Database tabs edit connections, run SQL, and preview table data. Tool tabs host local utilities such as UUID, Base64, JWT, Cron, URL codec, Regex, and Password Generator.',
    ],
    tips: ['The welcome screen can open a collection or the command palette if the canvas is empty.'],
    keywords: 'request editor websocket params headers body auth uuid base64 jwt cron regex password',
  },
  {
    id: 'collections-tree',
    section: 'collections',
    title: 'Collection tree',
    summary: 'Nested folders of HTTP and WebSocket requests.',
    body: [
      'Collections live in the Collections rail. Folders can nest. Drag a node to reorder it or drop it into another folder.',
      'Search, filter, and sort sit in the collections toolbar. Collapse all folds the tree so you can scan names.',
    ],
    tips: ['Right-click empty space for New folder or New request. Right-click a row to rename, duplicate, or delete.'],
    keywords: 'collections folders tree drag drop search filter sort http websocket',
  },
  {
    id: 'environments-vars',
    section: 'environments',
    title: 'Environments and variables',
    summary: 'Named sets of variables, including secrets.',
    body: [
      'The Environments rail lists environments for the active workspace. Open one to edit keys, values, folders, and secret flags.',
      'The titlebar environment picker chooses which environment requests should use. You can choose None when you want no active set.',
    ],
    tips: ['Right-click an environment for Open, Rename, Duplicate, and Delete. Drag the list to change order.'],
    keywords: 'environments variables secrets env picker duplicate rename',
  },
  {
    id: 'database-sidebar',
    section: 'database',
    title: 'Database sidebar',
    summary: 'Connections and saved queries in one rail.',
    body: [
      'The Database rail has two sections: Connections and Queries, each taking half the sidebar. Search, filter, and sort sit in the toolbar. Right-click empty space to add a folder, a connection, or a query. Pick the engine on the connection tab.',
      'Folders and leaves can be renamed inline and dragged when sort is Saved order. Catalog rows under a connection are not draggable. Connections and queries persist in database.json and queries.json in the workspace folder.',
    ],
    tips: [
      'Choose schemas on a connection to control which tables appear in the tree.',
      'Click a connection to expand it. Click a table or query to open it. Connection settings are on the right-click menu.',
    ],
    keywords: 'database sidebar connections queries search filter sort drag rename schema picker files',
  },
  {
    id: 'database-connections',
    section: 'database',
    title: 'Connections',
    summary: 'Engines, catalog, Test, and Connect on boot.',
    body: [
      'Testrix talks to PostgreSQL, MySQL, MariaDB, SQL Server, SQLite, Oracle, MongoDB, and Redis. Expand a connection to load schemas, tables, views, routines, triggers, sequences, users, columns, indexes, and foreign keys. Long lists show the first 50 items with Load more; Filter on the group or Search in the toolbar finds names without scrolling.',
      'Connection settings open a workbench tab. Paste a connection string to fill host, port, user, password, and database, then Save. Test probes the driver. Refresh reloads the catalog. Connect on boot is per connection; Settings → Database has the global startup switch.',
    ],
    tips: ['Right-click a schema and choose Show diagram to open an ER tab of foreign keys.'],
    keywords: 'connections postgres mysql sqlite redis mongo test refresh boot catalog ddl diagram erd foreign keys search load more',
  },
  {
    id: 'database-queries',
    section: 'database',
    title: 'Saved queries',
    summary: 'Ctrl+Enter, result preview, Commit, Push, and auto-rollback.',
    body: [
      'A query tab binds SQL, Redis, or Mongo text to a connection. Results use the same grid as a table tab and stay on the query until you hide them. Hide collapses the pane; Show results brings it back, including the last saved result. SQL engines run in a held transaction: Commit or Push applies it, Rollback undoes it. Ctrl+Space completes catalog names; a ghost suffix follows the current token. Ctrl+Enter and Run share the same execute path. A selection runs immediately. One statement runs at the caret. Several statements open Run query from cursor or Run all queries, and hovering highlights the matching range.',
      'Reads preview in the result grid. Writes on transactional SQL engines stay uncommitted until Commit or Push. Rollback undoes them. If you never push, the query rolls back after the Settings delay and the grid stays as a snapshot labeled rolled back. Redis and MongoDB run immediately.',
    ],
    tips: ['The shortcut is local to a focused query tab, so it does not fire on HTTP tabs.'],
    keywords: 'saved queries ctrl enter run from cursor run all preview commit push rollback hide results last result transaction folders',
  },
  {
    id: 'database-table',
    section: 'database',
    title: 'Table data',
    summary: 'Paged SELECT, draft edits, Submit then Push.',
    body: [
      'Open data loads a paged SELECT for a table. WHERE and ORDER BY sit in the toolbar; Enter reloads. Foreign-key cells have a jump button that opens the referenced table and selects the matching row. Edit cells as a local draft. Submit starts a held transaction with the DML. Push commits and reloads. Revert discards the draft, or rolls back if a session is already open.',
      'Views, tables without a primary key, Redis, and MongoDB stay read-only. Table information and Show DDL open the definition in a query tab.',
    ],
    tips: ['Closing a tab with an uncommitted transaction asks you to roll back.'],
    keywords: 'table data open data select where order by submit push revert ddl primary key foreign key relation',
  },
  {
    id: 'database-settings',
    section: 'database',
    title: 'Database settings',
    summary: 'Startup connect, idle disconnect, and rollback delay.',
    body: [
      'Connect on startup probes every connection with Connect on boot. Idle disconnect closes unused pools after a number of minutes; 0 keeps them until quit. Uncommitted sessions are never treated as idle.',
      'Rollback uncommitted queries after stores seconds (0–600). The settings page can show minutes, but the file still stores seconds. 0 waits until Push, Rollback, or tab close.',
    ],
    tips: ['Reset on the Database page restores only these prefs, not database.json.'],
    keywords: 'database settings connect startup idle disconnect rollback uncommitted push commit preview',
  },
  {
    id: 'workspaces-switch',
    section: 'workspaces',
    title: 'Workspaces',
    summary: 'Each workspace has its own collections and environments.',
    body: [
      'The titlebar workspace switcher changes workspaces. Manage workspaces from that menu to create, rename, duplicate, or delete them.',
      'The default workspace cannot be deleted. Switching workspaces reloads that folder’s collections and environments files.',
    ],
    tips: ['Pin the workspace you use most so it stays easy to find in the switcher.'],
    keywords: 'workspaces switcher manage create rename duplicate delete default',
  },
  {
    id: 'tools-uuid',
    section: 'tools',
    title: 'UUID Generator',
    summary: 'Create RFC 4122 version 4 identifiers locally.',
    body: [
      'Tools live in the Tools rail. UUID Generator creates RFC 4122 version 4 identifiers with uppercase and hyphen options.',
      'Generate & copy creates a new value and puts it on the clipboard. Copy sends the current value again. Order of tools is stored in settings.',
    ],
    tips: ['Drag tools in the sidebar to change their order. That order is per app, not per workspace.'],
    keywords: 'tools uuid generator copy clipboard hyphen uppercase',
  },
  {
    id: 'tools-base64',
    section: 'tools',
    title: 'Base64',
    summary: 'Encode and decode UTF-8 text as Base64.',
    body: [
      'Open Base64 from the Tools rail to convert UTF-8 text to Base64, or Base64 back to text. URL-safe swaps +/ for -_ and drops padding.',
      'Invalid decode input shows an inline error. Copy, Swap, and Clear stay in the footer. Nothing leaves this machine.',
    ],
    tips: ['Swap sends the output back into the input and toggles Encode / Decode.'],
    keywords: 'tools base64 encode decode url-safe utf-8 clipboard',
  },
  {
    id: 'tools-jwt',
    section: 'tools',
    title: 'JWT Toolkit',
    summary: 'Decode compact tokens and sign HS256 locally.',
    body: [
      'Decode splits a JWT into header and payload JSON. Encode builds an HS256 token with a local secret via Web Crypto. Other algorithms are not offered.',
      'Paste a secret in Decode to verify HS256 signatures. Copy token or payload JSON from the footer. The secret is not saved.',
    ],
    tips: ['Swap moves an encoded token into Decode, or a decoded payload into Encode.'],
    keywords: 'tools jwt hs256 decode encode verify secret hmac',
  },
  {
    id: 'tools-cron',
    section: 'tools',
    title: 'Cron Builder',
    summary: 'Build five-field expressions and preview the next local runs.',
    body: [
      'Cron Builder has minute, hour, day-of-month, month, and day-of-week selects plus a raw expression. The preview shows a human summary and the next five local fire times.',
      'If the raw field is invalid, it stays editable and the error is shown inline. Copy writes the current expression.',
    ],
    tips: ['Use the raw field for lists, ranges, and steps that are not in the select presets.'],
    keywords: 'tools cron schedule expression minute hour weekday next run',
  },
  {
    id: 'tools-url',
    section: 'tools',
    title: 'URL Encode / Decode',
    summary: 'Percent-encode components, full URIs, and query pairs.',
    body: [
      'Component mode uses encodeURIComponent / decodeURIComponent. Full URI mode uses encodeURI / decodeURI so reserved separators stay intact.',
      'The query table round-trips with the encoded string. Add or remove pairs, then Copy the output.',
    ],
    tips: ['Use Component when encoding a single query value. Use Full URI when the whole URL should stay a URL.'],
    keywords: 'tools url encode decode percent query string uri component',
  },
  {
    id: 'tools-regex',
    section: 'tools',
    title: 'Regex Tester',
    summary: 'Match a JavaScript regular expression against a haystack.',
    body: [
      'Enter a pattern, toggle flags g i m s u y, and paste a haystack. Matches list index, span, text, and capture groups. The preview highlights without injecting HTML.',
      'If the pattern is invalid, the engine message stays inline. Copy writes the pattern.',
    ],
    tips: ['Turn on g to list every match. Leave it off to inspect only the first.'],
    keywords: 'tools regex regular expression flags match capture groups',
  },
  {
    id: 'tools-password',
    section: 'tools',
    title: 'Password Generator',
    summary: 'Create a local secret with Web Crypto. It is not persisted.',
    body: [
      'Choose length from 8 to 128 and the character sets to include. Look-alikes (0, O, 1, l, I) stay off unless you turn them on.',
      'Secrets come from crypto.getRandomValues, never Math.random. Generate & copy puts a new value on the clipboard. The secret is not written to session.json or disk.',
    ],
    tips: ['Clear hides the current secret from the tab. Closing the tab drops it from memory.'],
    keywords: 'tools password secret generator entropy crypto look-alikes',
  },
  {
    id: 'shortcuts-palette',
    section: 'shortcuts',
    title: 'Command palette',
    summary: 'Jump to settings, sidebar, help, or reload without leaving the keyboard.',
    body: [
      'Open the palette from anywhere with the Command palette shortcut. Type to filter commands, then Enter to run one.',
      'Esc closes the palette, Help, Settings, and other overlays.',
    ],
    tips: ['Rebind palette, settings, and sidebar chords in Settings → Keyboard.'],
    keywords: 'command palette ctrl k shortcuts hotkeys keyboard',
  },
  {
    id: 'shortcuts-help',
    section: 'shortcuts',
    title: 'Help and settings',
    summary: 'F1 opens Help. Ctrl , opens Settings by default.',
    body: [
      'Help is the question-mark icon at the bottom of the activity rail. F1 opens or closes this window.',
      'Settings is the gear in the titlebar. Use it for appearance, keyboard, logging, network, and data folders.',
    ],
    tips: ['Search inside Help or Settings when you remember a word but not the page.'],
    keywords: 'f1 help settings ctrl comma titlebar rail',
  },
  {
    id: 'settings-appearance',
    section: 'settings',
    title: 'Appearance and logging',
    summary: 'Theme, motion, type, and local log files.',
    body: [
      'Appearance covers theme, animation speed, close animation, interface font, monospace font, type scale, and icon scale.',
      'Logging sets the minimum level, optional testrix.log, the logs folder, rotation size, and a tail of recent lines.',
    ],
    tips: ['Reset to default on a Settings page restores only that page. Data → Reset all settings restores appearance, keyboard, logging, and network.'],
    keywords: 'theme motion font logging log file rotate settings',
  },
  {
    id: 'network-proxy',
    section: 'network',
    title: 'Proxy, DNS, and certificates',
    summary: 'Network preferences stored in settings.json.',
    body: [
      'Proxy can follow the OS, stay off, or use HTTP / SOCKS5 with host, port, optional auth, and a bypass list.',
      'DNS can use OS resolvers or a custom server list. Certificates can verify TLS, add an extra CA, and store client certificates for later mTLS.',
    ],
    tips: ['These values persist locally. Outgoing request sending does not apply them yet.'],
    keywords: 'proxy socks http dns certificates tls ca mtls pem pfx',
  },
  {
    id: 'data-files',
    section: 'data',
    title: 'Files on this PC',
    summary: 'Versioned JSON under the app data folder.',
    body: [
      'Global files include settings.json and session.json. Each workspace has collections.json and environments.json.',
      'Settings → Data shows the app folder, configs folder, workspaces folder, and each file’s schema version. You can change folders or reveal them in Explorer.',
    ],
    tips: ['Nothing syncs unless you copy the files yourself. Keep backups of the config folder if the collections matter.'],
    keywords: 'data json settings session collections environments folder local',
  },
  {
    id: 'tips-speed',
    section: 'tips',
    title: 'Move faster',
    summary: 'A short list of habits that pay off every day.',
    body: [
      'Use the palette when you forget where a command lives. Use Help search for feature names such as proxy, UUID, or split.',
      'Keep one environment active from the titlebar so variable names stay consistent across tabs.',
    ],
    tips: [
      'Drag a tab to the right to split instead of opening a second window.',
      'Mark environment values as secret when they should be redacted in logs.',
      'Collapse the sidebar when you need the full editor width; the rail stays put.',
    ],
    keywords: 'tips speed productivity palette split secret sidebar',
  },
];

export function filterHelpHits(query: string): readonly HelpArticle[] {
  const needle = query.trim().toLowerCase();
  if (!needle)
    return [];
  return HELP_ARTICLES.filter((item) =>
    `${item.title} ${item.summary} ${item.body.join(' ')} ${item.tips.join(' ')} ${item.keywords} ${item.section}`
      .toLowerCase()
      .includes(needle),
  );
}

export function articlesForSection(id: HelpSectionId): readonly HelpArticle[] {
  return HELP_ARTICLES.filter((item) => item.section === id);
}
