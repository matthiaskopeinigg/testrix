export type HelpSectionId =
  | 'start'
  | 'workbench'
  | 'collections'
  | 'environments'
  | 'database'
  | 'workspaces'
  | 'services'
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
  { id: 'services', label: 'Services', group: 'Workspace', summary: 'Scenarios and Traffic services in the Services rail.' },
  { id: 'tools', label: 'Tools', group: 'Workspace', summary: 'Local utilities such as UUID, Base64, JWT, Cron, URL codec, Password Generator, and PlantUML.' },
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
  { label: 'Workspace', ids: ['workbench', 'collections', 'environments', 'database', 'workspaces', 'services', 'tools'] },
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
      'The left rail switches Collections, Services, Database, Environments, Tools, and History. Help sits under History at the bottom of the rail.',
    ],
    tips: ['Open Help anytime with F1 or the question-mark icon at the bottom of the rail.'],
    keywords: 'local offline privacy start intro desktop electron history',
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
      'Ctrl + scroll wheel zooms the whole shell. Ctrl 0 restores 100%.',
    ],
    tips: ['Ctrl B toggles the sidebar without changing the active rail.'],
    keywords: 'rail sidebar titlebar canvas layout chrome collapse zoom',
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
      'HTTP tabs hold method, URL, Overview, Params, Headers, Body, Auth, Scripts, Settings, and Docs. Folder settings and workspace default headers apply on Send. Ctrl+Enter sends; Send becomes Cancel while a request is in flight. If the URL has no scheme, Send uses https:// internally (http:// for localhost and IPs) without changing the URL bar. If that hostname does not resolve, Send retries with www. for the fetch only and leaves the URL bar as typed. Paste a cURL command into the URL bar to import method, headers, and body. Body JSON, HTML, XML, and GraphQL use a local code editor with syntax highlighting: Ctrl+Space completes $placeholders and {{variables}} from the folder chain and active environment, and Shift+Alt+F formats the document. Auth, form fields, and scripts take the same tokens. Hover a highlighted {{variable}} for its source; Shift+click opens the folder Variables tab or environment that defines it and selects that key; Shift+click a :path token opens Params.',
      'WebSocket tabs match that editor chrome: identity path, URL bar, and Messages, Params, Headers, Auth, Settings, and Docs. Connect opens a real socket from the desktop host (the renderer never talks to the network). Handshake headers, query params, subprotocols, inherited folder auth, and {{variables}} apply on Connect. Incoming frames stream in Messages; Ctrl+Enter sends the composer. Hide of HTTP responses is separate — Disconnect closes the socket.',
      'Save mode in Settings → Appearance controls when collection and flow edits write to disk. Save on change writes every edit. Save manually keeps a draft until Save or Ctrl+S; Discard reverts. Send and Connect always use what is on screen, even if the draft is unsaved.',
      'The response pane has Pretty (syntax-highlighted JSON, HTML, XML, JS, CSS, GraphQL), Raw, Preview (HTML/XML/SVG), Headers, Cookies, Timeline, Redirects, Diff, and Runs (last 20 for this request). Timeline shows DNS, TCP, TLS, TTFB, download, and redirect hops. Cookies lists this response and the workspace jar in cookies.json. Open jar opens the Cookie & auth popup to search, edit, clear cookies, and inspect folder/request auth. Hide collapses it like query results; Open brings the last response back. Reopening a request keeps a prior run collapsed until you Open or Send. Preview in the URL bar shows the resolved request. Code copies cURL, Fetch, or HTTPie. History snapshots open as read-only tabs from the History rail.',
      'Environment tabs edit variables for the selected environment. Database tabs edit connections, run SQL, and preview table data. Tool tabs host local utilities such as UUID, Base64, JWT, Cron, URL codec, Regex, and Password Generator. PlantUML is a Tools drill-in: open it from the catalog to edit saved diagrams in a workbench tab. Service tabs open Regression, Flows, Emulator, Load, Mock, Listener, and Interceptor editors.',
    ],
    tips: ['The welcome screen can open a collection or the command palette if the canvas is empty.'],
    keywords: 'request editor websocket params headers body auth scripts docs history runs curl preview cancel abort placeholder ctrl space format syntax highlight pretty json html https www scheme hostname timeline redirects diff cookies jar shift click variable origin connect handshake subprotocol save mode manual draft discard ctrl s',
  },
  {
    id: 'workbench-history',
    section: 'workbench',
    title: 'Request history',
    summary: 'Per-request Runs and a dedicated History rail.',
    body: [
      'Each HTTP request keeps the last 20 Runs in the session. Click a run to restore that response in the viewer. Save as example stores a named snapshot on the request node.',
      'History is its own rail at the bottom, above Help. Search, group by day, method, or status, and filter by method or status class. Click a row to open a History inspector tab with method, URL, timing, headers, query params, and bodies. Shift-click and Ctrl/Cmd-click select multiple rows; Ctrl+A selects all visible; Delete removes the selection. Clear history empties history.json and closes those tabs. Authorization, Cookie, and other secret headers are masked, and bodies are truncated.',
    ],
    tips: [
      'Use Replay to open an editable HTTP tab prefilled from the snapshot. Delete removes selected entries; Clear removes all.',
    ],
    keywords: 'history runs examples snapshot rail redaction filter group clear replay inspector multi select shift ctrl',
  },
  {
    id: 'collections-tree',
    section: 'collections',
    title: 'Collection tree',
    summary: 'Nested folders of HTTP and WebSocket requests.',
    body: [
      'Collections live in the Collections rail. Folders can nest. Drag a node to reorder it or drop it into another folder. A drag switches sort to Saved order, so the new order stays. Shift-click and Ctrl/Cmd-click select multiple rows; dragging a selected row moves the whole selection in tree order.',
      'Search, filter, and sort sit in the collections toolbar. Collapse all folds the tree so you can scan names.',
    ],
    tips: ['Right-click a row for Open, Rename, and Delete. Right-click the space left of a row, empty space, or the toolbar beside search, filter, and sort for New folder or New request. Right-click a folder and choose Open for tags, auth, headers, and docs. Click a folder row to expand or collapse it.'],
    keywords: 'collections folders tree drag drop search filter sort http websocket folder settings oauth multi select shift ctrl',
  },
  {
    id: 'collection-folder',
    section: 'collections',
    title: 'Folder settings',
    summary: 'Shared headers, auth, scripts, and docs for nested requests.',
    body: [
      'Open a folder from its context menu. Tree click still expands or collapses. The Overview section holds tags, description, and a summary of inherited settings. Other tabs store variables, headers, auth, JavaScript scripts, TLS/redirect settings, and docs. With Save manually enabled, folder edits stay local until Save or Ctrl+S; Discard reverts.',
      'Scripts are JavaScript, like Postman: Pre-request runs before Send, Tests run after the response. Use tx or the pm alias. There is no Node, disk, or network API besides that object.',
      'On Send, Testrix walks from the workspace root down to the request, merges workspace default headers then those folder values, substitutes {{variables}} from the folder chain and the active environment, expands $uuid and $randomEmail placeholders, then executes through the local HTTP engine. Cookies belong to the workspace jar in cookies.json, not the folder. Manage the jar and inspect collection auth from Cookie & auth jar (command palette, Settings → HTTP, or Open jar on the response Cookies pane).',
      'OAuth 2 can get a token from this tab: authorization code with PKCE (S256) via a loopback redirect, device code with an on-pane user code, client credentials, or password. Refresh runs on demand and again on Send when the access token is expired.',
    ],
    tips: [
      'Enter inserts a variable or header row. Delete removes the focused row. Header cells show gray inline completions; Ctrl+Space opens the list. $ and {{ open the placeholder menu as you type. Inherited rows stay gray and read-only.',
      'Request Auth can stay on Inherit folder, or override with Bearer, Basic, API key, or Digest. Docs support Write, Split, and Preview with a markdown toolbar.',
    ],
    keywords: 'folder oauth pkce device code digest markdown scripts inherit headers pre-request tests uuid placeholder ctrl space',
  },
  {
    id: 'environments-vars',
    section: 'environments',
    title: 'Environments and variables',
    summary: 'Named sets of variables, including secrets.',
    body: [
      'The Environments rail lists environments for the active workspace. Open one to edit keys, values, folders, and secret flags.',
      'A variable inside a folder is used by its key, so url in folder ms.folder is {{url}}. {{ms.folder.url}} names that same variable when another url exists. A value can reference another variable, such as {{baseUrl}}/test.',
      'Select variables or folders, then Ctrl+C and Ctrl+V to paste them into another environment. Keys stay the same, so {{url}} still works.',
      'The titlebar environment picker chooses which environment requests should use. You can choose None when you want no active set.',
    ],
    tips: ['Right-click an environment for Open, Rename, Duplicate, and Delete. Drag the list to change order.'],
    keywords: 'environments variables secrets env picker duplicate rename paste copy',
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
      'A query tab binds SQL, Redis, or Mongo text to a connection. Results use the same grid as a table tab and stay on the query until you hide them. Hide collapses the pane; Open brings it back, including the last saved result. SQL engines run in a held transaction: Commit or Push applies it, Rollback undoes it. Ctrl+Space completes catalog names; a ghost suffix follows the current token. Ctrl+Enter and Run share the same execute path. A selection runs immediately. One statement runs at the caret. Several statements open Run query from cursor or Run all queries, and hovering highlights the matching range.',
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
      'The titlebar workspace switcher changes workspaces. It lists This PC first, then one group for each connected repository. A workspace stays on this PC until you publish it to a repository from Manage workspaces or the Collab dock. Manage workspaces from the same menu to create, rename, duplicate, delete, publish, or remove a repository workspace from this PC.',
      'The default workspace cannot be deleted. Switching workspaces reloads that folder’s collections and environments files.',
      'A Testing workspace is created on first launch with Flows against public e2e sites (the-internet, Sauce Demo, DemoQA, Practice Test Automation) and API labs (httpbin, JSONPlaceholder). Bumping the seed version rewrites that workspace; delete it and restart to reseed manually.',
    ],
    tips: ['Pin the workspace you use most so it stays easy to find in the switcher.'],
    keywords: 'workspaces switcher manage create rename duplicate delete default testing seed flows e2e local shared collab sync',
  },
  {
    id: 'collab-share',
    section: 'workspaces',
    title: 'Collab: shared repositories',
    summary: 'Connect a repository once and pick which of its workspaces to keep on this PC.',
    body: [
      'Collab is the titlebar button next to Settings. It opens a dock on the right. A repository can hold many workspaces. Connect it once, then pick which of its workspaces to add to this PC; everyone using that repository keeps the same collections, flows, environments, and database definitions. Sync runs in the background after a save settles: no push, pull, or commit messages.',
      'Paste an https address and add a username and access token, or paste an SSH address to use the keys already on this PC. SSH addresses, a workspace proxy, and a custom CA all run through the system Git binary, so corporate setups keep working. Everything else uses the Git built into Testrix.',
      'Connect as many repositories as you need. Opening Collab follows the workspace you have open. The dock header shows the repository name, a switcher only when this PC has more than one repository, Sync and Pause, and the status line. Below it, tabs split the dock: Overview (what needs you, yours not sent yet, just arrived — click a row to open it), Workspaces (on this PC, also in the repository, and publish from this PC), Activity (filtered to All, Changes, Runs, or People, for this workspace or the whole repository), People (who is around, and which workspace they last reported), and Runs.',
      'Publish a local workspace from the Workspaces tab, from Manage workspaces, or while connecting. Remove from this PC leaves it in the repository for everyone else; Remove from repository removes it for the team and keeps a local copy here.',
      'Secrets move into a local file when a workspace is published or added and never leave. History, cookies, emulator paths, and run logs also stay on this PC. Teammates fill in their own secrets.',
      'Settings → Collab sets the name on your changes, hides you from presence, and lists every connected repository with its own pause, branch, Update access token, Forget, and Disconnect. Disconnecting a repository keeps local copies of its workspaces.',
    ],
    tips: [
      'The status glyph sits next to the workspace name in the titlebar. Offline work stays on this PC and syncs when the network returns.',
      'Repositories created before multi-workspace support are reorganized on first sync into a workspaces folder. Teammates on the same repository pick up the new layout automatically.',
    ],
    keywords: 'collab shared workspace repository repositories multiple publish add remove git ssh https token sync presence activity dock tabs review conflict secrets pause offline branch',
  },
  {
    id: 'collab-runs',
    section: 'workspaces',
    title: 'Team regression runs',
    summary: 'One person runs a pack at a time, and everyone sees the result.',
    body: [
      'In a connected workspace, starting a regression pack claims it for you. Anyone else opening that pack sees who is running it, the live count, and a Watch action instead of a Run button. Different packs still run side by side.',
      'When a run finishes, its summary is published to the team: pack, who ran it, environment, pass and fail counts, duration, and the names of failing entries. The Runs tab lists those failing names. Click a run or a live row to open the pack. Metrics, timelines, and logs stay on the PC that produced them. Turn this off with Share regression results in Settings → Collab.',
      'If a run stops reporting for three minutes, the claim goes stale and the pack or the Runs tab offers Take over. Taking over confirms first, then claims the pack for you.',
    ],
    tips: ['Watch on a teammate’s run raises one toast when it finishes, pass or fail.'],
    keywords: 'regression lock run team watch take over shared results pack collab',
  },
  {
    id: 'services-catalog',
    section: 'services',
    title: 'Services hub',
    summary: 'Drill into Flows, Load, Regression, Emulator, Mock, Listener, and Interceptor.',
    body: [
      'Services sits on the activity rail after Collections. Click a catalog tile to slide into that service’s sidebar. Back returns to the hub. The shell title becomes the service name.',
      'The catalog splits into Scenarios (Regression, Flows, Emulator, Load) and Traffic (Mock, Listener, Interceptor). Each service except Emulator opens artifact tabs with section strips like folders.',
      'Regression packs run selected flows and scenarios as a local suite, with environment select, suite metrics, and a promote-to-golden baseline.',
      'Secondary sidebars have search and sort only. Right-click empty space to create an item or folder. Right-click a row to open, rename, duplicate, or delete. There is no Add button. Shift-click and Ctrl/Cmd-click select multiple rows; when the tree supports drag, moving a selected row relocates the whole selection.',
      'Workspace files are local JSON next to collections.json: flows.json, emulator.json, load.json, regressions.json, mocks.json, listeners.json, and intercept.json.',
    ],
    tips: [
      'Delete removes the selected or open item; a toast offers Undo for a few seconds (Ctrl+Z also undoes the last delete when focus is not in an editor). Ctrl+A selects all visible rows; Ctrl+D duplicates; Ctrl+C copies the selection and Ctrl+V pastes it, including after you switch workspace. Escape clears the selection.',
      'Right-click empty space in a service sidebar to create. Tools stay on their own rail.',
    ],
    keywords: 'services hub catalog drill sidebar regression flows emulator load mock listener intercept interceptor json delete undo select all duplicate multi select drag',
  },
  {
    id: 'services-flows',
    section: 'services',
    title: 'Flows',
    summary: 'A node graph with scenarios, data rows, and parallel branches.',
    body: [
      'A flow opens on a node canvas. Design, Data, History, Settings, and Docs swipe like folder tabs. Drag a node to move it, drag an output port onto another node to link them, and drop a link on empty canvas to pick the next node. Drag empty canvas to marquee-select, middle-drag to pan, Delete removes, Ctrl+D duplicates, Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) undo and redo, and Tidy lays the graph out in run order. With Save manually enabled, graph edits stay local until Save (Ctrl+S); Discard reverts. Save on change writes each edit immediately. Run uses the on-screen graph, including an unsaved draft. The outline lists the same graph in run order when shown.',
      'One node can feed several nodes from the same port. That is a split, and the branches run at the same time. Each branch that drives the browser forks its own window on the shared session, seeded at the page the parent left open, so two paths can click different buttons without fighting over one page. A node with several incoming links waits for all of them, which makes it a join.',
      'A flow holds named scenarios, each with its own graph. The chip bar above the canvas adds, renames, duplicates, and skips them. Data gives a scenario a table of rows; columns become placeholders and the scenario runs once per row. Tutorial scenarios Data rows: status codes, Data rows: query + capture, and Data rows: POST bodies demonstrate the pattern. History keeps the last 20 runs per scenario; Apply restores statuses and Exchange buttons on Design.',
      'Nodes cover the browser (open, click, type, select, hover, press, wait for, screenshot, run script), Device (Start Device, Launch, Tap, Type, Press, Swipe, Wait for element, Screenshot, Validate text/visible), validation (html text, visible, URL, status, value), API and data (HTTP request with Params / Headers / Body like the request tab, database query with connection-aware SQL editor, set variable, Capture, cache, HTTP listener, HTTP interceptor, Validate HTTP), and control (if, for each, while, retry, group, wait, join, run flow, manual step with text prompt). A Group is a documentation frame only: nest steps inside for readability — no ports and no run logic; wires still follow the outer path.',
      'Capture reads the last HTTP exchange (from HTTP request or a Validate node after Listen): whole body, status, a response header (for example authorization → token), or a JSON path such as replicas[0].entries[0].otp. Tutorial scenarios Capture JSON field, Capture header, and Capture multi-rule demonstrate each pattern against httpbin. Validators always check the previous connected node: Listen/Intercept arm and continue; wire Validate status or Validate value after them (often on a parallel branch), then join.',
      'HTTP listener observes matching traffic without changing it. HTTP interceptor matches then passthrough (edit headers/body), mock, or block. On Device flows both use a local HTTPS MITM proxy (emulator http_proxy → host, with a best-effort CA install). Certificate-pinned apps will not decrypt. When no device session is active, Listen can fall back to browser CDP network capture.',
      'Text, URL, and selector fields substitute {{name}} from the active environment when the flow runs or when Pick loads a page. $randomEmail and %randomEmail become a generated address; Settings → HTTP sets the domain. The saved node keeps the token. Pick does not replace {{name}} in the Open URL with the loaded address.',
      'For browser nodes with a Selector field, use Pick next to the field. The E2E window opens (or reuses the scenario Open URL); click an element to fill a CSS selector, or press Esc to cancel.',
      'For Device nodes with a Selector field, Pick is disabled until the emulator is running. Optionally turn on Previous to run earlier steps on the path from Start to this node (Launch, Tap, Type, Wait, …). Disconnected / orphan branches are skipped. Start Device never boots or presses Home during Pick. Install APKs from Services → Emulator, not from the flow graph.',
      'When a flow has E2E nodes, Settings includes Display E2E window. When it has Device nodes, Settings includes Display emulator (off runs the AVD headless).',
    ],
    tips: [
      'Right-click a node and choose Split to add a second branch on the same port. Both branches then run at once.',
      'Click Tutorial in the Flows toolbar to upsert the Tutorial folder: Basics (Node reference and Control flow), plus API, E2E, and Device Showcase with Simple, Advanced, and Complex flows.',
      'Basics → Node reference gives every node kind its own documented scenario, filed under Canvas, Control, API and data, Validation, Browser, and Device. Basics → Control flow walks through branching, parallel lanes, loops, retries, and Join with labelled wires.',
      'Click Templates next to Tutorial to manage saved graph snippets. Select nodes on the canvas, right-click, and choose Save selection as template. Insert them from the Add node overlay (right-click empty canvas), grouped by tags.',
      'Older flows migrate on open: the old step list becomes the first scenario graph.',
    ],
    keywords:
      'flows node graph canvas scenarios split parallel branch join group documentation frame undo redo ctrl z data rows browser click type validate html text pick selector css device emulator tap uiautomator pick on device tutorial templates tags e2e outline capture json path header basics node reference control flow if else for each while retry listen intercept mitm proxy pinning environment variable {{name}} $randomEmail %randomEmail',
  },
  {
    id: 'services-emulator',
    section: 'services',
    title: 'Emulator',
    summary: 'Device profiles and the sidecar Android emulator window.',
    body: [
      'Services → Emulator lists app-created device profiles and Android Studio AVDs in the sidebar. Single-click a device to open its Emulator tab (Start / Cold boot / Stop, Image switch between Google APIs and Google Play Store for app devices, device settings). Double-click or use the context menu to start. Drag to reorder. Multi-select with Shift or Ctrl/Cmd, then Delete to remove app devices (AVD rows stay until you remove the AVD outside Testrix). Drive the running device from Flows using Device nodes (launch, tap, wait for element, pick on device).',
      'On Windows, Start renames the official emulator window to Testrix and keeps a dark system titlebar so you can move and resize it. The emulator stays a sidecar window — not inside Angular.',
    ],
    tips: [
      'Add a device from the sidebar. Start installs Android tools after the SDK license, with a progress bar on the device tab, when they are not already on disk.',
      'Add at least one device profile, then click it to open its tab. Double-click to start the emulator.',
    ],
    keywords: 'emulator adb device pixel titlebar chrome windows avd testrix activate home screen stop cold boot snapshot sdk detect drag drop reorder multi select delete',
  },
  {
    id: 'services-load',
    section: 'services',
    title: 'Load',
    summary: 'Virtual users against a collection request or manual HTTP target.',
    body: [
      'Load opens a dedicated tab with Overview, Target, Profile, and Thresholds. Results stay in a resizable bottom dock with live metrics, history, and compare.',
      'Target can be a collection HTTP request (method, URL, headers, and body) or a manual call. Pick an environment or use the app active environment for variable resolution.',
      'Profile includes smoke, load, stress, spike, and soak presets plus virtual users, duration, and ramp. Thresholds fail the run on max error %, max p95, optional min success %, or min RPS. The Docs tab holds description, tags, and markdown with Write / Split / Preview.',
    ],
    tips: [
      'Keep virtual users modest on first runs. Each VU loops executeHttp until the duration ends.',
      'Hide or reveal the Results dock from the sash; starting a run opens it automatically.',
    ],
    keywords: 'load virtual users p95 rps thresholds results dock collection preset smoke stress',
  },
  {
    id: 'services-regression',
    section: 'services',
    title: 'Regression',
    summary: 'Flow packs with environment, suite metrics, and a golden run.',
    body: [
      'A regression suite links flows and optional scenarios, then runs them against a chosen environment (or the app active environment). Overview summarizes linked flows and the last run. Flows picks flows and scenarios from the services tree — search, tag filter, and sort included — with optional folder sync. Results live in the bottom dock with pass rate, failed entries, duration, history, and per-entry detail.',
      'Promote any suite run to golden to compare later pass rate and duration deltas. Settings holds the environment, parallel workers (up to 16), retries, delay, shuffle, stop-on-first-failure, fail threshold (0% fails on any entry error), release, description, and tags. When Parallel is on, Device flows still run one at a time on the shared emulator while API and E2E entries use the worker pool. The Docs tab uses Write / Split / Preview markdown like HTTP requests. Regression runs keep the E2E window hidden and use fast replay.',
      'Results persist in regressions.json on this machine. Hide or reveal the Results dock from the sash; starting a run opens it automatically. Cancel stops the suite mid-run.',
    ],
    tips: [
      'Check a flow for all enabled scenarios, or expand it and check individual scenarios.',
      'Promote a known-good suite run to golden before changing flows.',
    ],
    keywords: 'regression pack suite golden environment scenario threshold pass rate flows filter sort dock',
  },
  {
    id: 'services-mock',
    section: 'services',
    title: 'Mock',
    summary: 'Local HTTP mock server with matched canned responses.',
    body: [
      'Mock endpoints live under Services → Mock and persist in mocks.json. Open an endpoint to edit Matching (method, path/URL mode, optional header and body filters), Response (status, headers, body), Advanced (priority, description), and Activity (matched request/response exchanges).',
      'Start and Stop the loopback server from the Mock sidebar chrome. Host, port, CORS, global delay, and auto-start-on-launch live in the collapsible Server options there. Matched hits stream into the Activity tab with full request and response detail.',
      'Path, match filters, header values, and response bodies accept {{name}} placeholders from the active Environment. The host interpolates them before matching or serving.',
    ],
    tips: [
      'Higher priority endpoints win when several rules match the same request.',
      'Use {{baseUrl}}-style variables the same way you do on the HTTP request tab.',
    ],
    keywords: 'mock mocks.json endpoint matching response delay priority cors placeholders environment',
  },
  {
    id: 'services-listener',
    section: 'services',
    title: 'Listener',
    summary: 'Capture browser or emulator HTTP traffic like DevTools Network.',
    body: [
      'Listener sessions persist in listeners.json. Choose browser or device mode. Browser opens the E2E window (persist:testrix-e2e) and streams CDP Network hits. Device arms observe-only rules on the shared emulator MITM proxy — select a running Emulator device first.',
      'The tab is a full-width Network surface: mode, start URL or device, method/URL/status filters, and Chrome-style resource chips (Fetch/XHR, Doc, CSS, JS, …). Hits list method, type, status, URL, and time — persisted on the listener in listeners.json (newest 200).',
      'Start and Stop capture from the tab. Flow http-listener nodes continue to use the same backends for scenario automation.',
    ],
    tips: [
      'Device mode needs the emulator running with a selected serial.',
      'Plain hostnames like magenta.at open as https; DNS miss retries with www (URL field stays as typed).',
      'Browser start URL can use {{baseUrl}} from Environments.',
    ],
    keywords: 'listener listeners.json network capture browser device mitm cdp emulator placeholders hostname www fetch xhr doc filter',
  },
  {
    id: 'services-intercept',
    section: 'services',
    title: 'Interceptor',
    summary: 'Match and rewrite browser or emulator HTTP.',
    body: [
      'Interceptor rules persist in intercept.json. Sections are Match, Action, and Activity. Matching covers stage, method, URL mode, and optional header/body filters. Manipulate supports passthrough (edit headers/body), mock, or block — the same controls as Flow HTTP interceptor.',
      'Choose Browser to open a window at the Start URL, or Device to arm the selected Emulator via the local MITM proxy. Disable a rule to keep it in the tree without arming.',
      'Match and manipulate string fields accept {{placeholders}} from the active Environment. Live hits stream into Activity and persist with the rule.',
    ],
    tips: [
      'Certificate-pinned apps will not decrypt through the local MITM.',
      'Flow http-interceptor nodes remain for graph automation; workbench Interceptor is the authoring and live UI.',
    ],
    keywords: 'intercept interceptor intercept.json mitm mock block passthrough browser device emulator placeholders activity',
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
    id: 'tools-plantuml',
    section: 'tools',
    title: 'PlantUML',
    summary: 'Save UML diagrams in a Tools tree and preview them offline.',
    body: [
      'Open PlantUML from the Tools rail to drill into a folder tree of saved diagrams. Create diagrams and folders from the context menu, then open an item to edit it in a workbench tab. Changes write to plantuml.json in the workspace.',
      'Pick a diagram type and edit it on the grid. The preview renders locally with no server. In Source, use Copy source, Copy SVG, or Download SVG.',
    ],
    tips: [
      'Scroll to zoom the preview and drag to pan. Fit resets the view.',
      'Back in the Tools sidebar returns to the tool catalog without closing open diagram tabs.',
    ],
    keywords: 'tools plantuml uml sequence class activity svg diagram offline copy download tree save',
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
      'Settings is the gear in the titlebar. Use it for appearance, keyboard, logging, network, Android emulator tools, and data folders.',
    ],
    tips: ['Search inside Help or Settings when you remember a word but not the page.'],
    keywords: 'f1 help settings ctrl comma titlebar rail',
  },
  {
    id: 'shortcuts-sidebar-selection',
    section: 'shortcuts',
    title: 'Sidebar selection',
    summary: 'Delete, select all, duplicate, and copy between workspaces in sidebar lists.',
    body: [
      'Focus a sidebar list (not an editor field), then Delete or Backspace removes the selected rows after confirmation. A toast offers Undo for several seconds before the delete is written to disk.',
      'Ctrl+A selects every visible row in the active sidebar. Ctrl+D duplicates the current selection. Ctrl+C copies collections, environments, database items, flows, and the other service, tool, and template lists. Ctrl+V pastes that copy into the same list, including after you switch workspace.',
      'History uses the same Delete and Ctrl+A pattern on its rail. Flow canvases keep their own Delete, Ctrl+D, and undo stack when the canvas has focus.',
    ],
    tips: ['Click empty space in a sidebar first so URL or SQL fields do not steal the shortcut.'],
    keywords: 'delete backspace ctrl a select all ctrl d duplicate sidebar collections environments undo toast keyboard',
  },
  {
    id: 'settings-wizard',
    section: 'settings',
    title: 'Settings wizard',
    summary: 'Step through Look & feel, Workspace, Network, and System—or finish the first-run essentials.',
    body: [
      'Settings opens as a stepped wizard. The left rail shows Look & feel, Workspace, Network, and System. Each step lists its categories as segments above the pane. Back and Continue move through the flow; Done on the last step marks setup complete.',
      'The first time you open Settings, a short Get started path covers theme, save mode, motion, and proxy plus TLS essentials. Show all settings or Skip jumps to the full category wizard without marking setup done.',
      'Search still jumps to any control. Command palette and in-app links open the matching group and flash the row you asked for.',
    ],
    tips: [
      'Deep links from the workbench or palette land in the full wizard even when first-run mode is available.',
      'Data → Reset all settings restores defaults but does not replay the first-run wizard unless settingsWizardCompleted is false in settings.json.',
    ],
    keywords: 'settings wizard steps first run get started theme save motion proxy tls continue back done',
  },
  {
    id: 'settings-appearance',
    section: 'settings',
    title: 'Appearance and logging',
    summary: 'Theme, motion, type, and local log files.',
    body: [
      'Appearance covers theme, animation speed, close animation, save mode, interface font, monospace font, type scale, icon scale, and zoom. Save on change writes collection and flow edits immediately. Save manually shows Discard and Save (Ctrl+S) until you commit; Send and Connect still use the open tab as shown.',
      'Ctrl + scroll wheel scales chrome, text, and columns. Ctrl 0 resets zoom to 100%.',
      'Logging sets the minimum level, optional testrix.log, the logs folder, rotation size, and a tail of recent lines.',
    ],
    tips: ['Reset to default on a Settings page restores only that page. Data → Reset all settings restores appearance, keyboard, logging, and network.'],
    keywords: 'theme motion font zoom ctrl scroll logging log file rotate settings save mode auto manual draft',
  },
  {
    id: 'settings-android',
    section: 'settings',
    title: 'Android emulator',
    summary: 'Activate downloads a managed SDK so Testrix can start an emulator.',
    body: [
      'Android tools install from a device tab when you Start, after the SDK license. API level and the Google Play image are chosen on that tab. An existing Android Studio SDK is detected automatically. The first download is about 2–3 GB.',
      'The emulator is a sidecar window, not inside the workbench. When you start it, Windows renames the official window to Testrix and keeps a dark caption so you can drag it.',
      'Windows needs Windows Hypervisor Platform. Linux needs KVM. macOS already has Hypervisor.framework. The first managed Activate needs the network; later starts reuse the files on disk.',
    ],
    tips: [
      'Deactivate removes managed tools. Activate again to reinstall. An existing Studio SDK is not deleted.',
    ],
    keywords: 'android emulator activate emulator deactivate adb avd sdk hypervisor platform-tools install download titlebar chrome fdroid detect studio play store google play',
  },
  {
    id: 'settings-http',
    section: 'settings',
    title: 'HTTP defaults',
    summary: 'Default headers, API key header name, and $randomEmail domain.',
    body: [
      'Settings → HTTP holds default request headers (User-Agent, Accept, Accept-Encoding, Connection). They are the lowest merge layer on Send: folders and the request override the same key. gzip and deflate bodies are inflated before Pretty and Raw so HTML and JSON show as text.',
      'API key header is the default name for API key auth, for example X-Api-Key. A folder or request can still set its own name. Random email domain is the host for $randomEmail. $randomEmail(other.at) overrides it for that token.',
    ],
    tips: [
      'Disable a default header to skip it without deleting the row. Reset to default restores the seeded headers, X-Api-Key, and example.test.',
      'Typing in a header cell shows a gray completion. Ctrl+Space opens the full list. $ and {{ still open the placeholder menu as you type.',
    ],
    keywords: 'settings http default headers user-agent accept connection api key x-api-key random email placeholder uuid',
  },
  {
    id: 'settings-updates',
    section: 'settings',
    title: 'Updates',
    summary: 'Stable or Beta releases, checked and downloaded in the background.',
    body: [
      'Settings → Updates picks the release channel. Stable only gets releases that finished beta. Beta gets new features first. A beta build that switches to Stable stays on its version until the next stable release is newer.',
      'Testrix looks on GitHub at most every six hours. A restart does not check again if the last check is still fresh. GitHub rate-limits release downloads; a 429 backs off and reuses the last signed manifest. New versions download in the background. The file is checked against that manifest and its SHA-512 digest before it can be installed.',
      'When an update is ready, the Settings button in the titlebar shows a dot and a toast offers Install. If background download is off, that toast still appears and offers Download & Install. Install closes Testrix, Setup replaces the install folder, and the new version opens with what changed. If anything fails, the previous version opens again and the reason is written to last-update.log in the app data folder.',
    ],
    tips: [
      'Turn off background downloads to decide per release. Check now and Download & Install stay in Settings → Updates.',
      'Command palette → Download & Install update appears while a release is waiting; Install update appears after it downloads.',
      'Development builds, previews, and all-users installs under Program Files do not update themselves.',
    ],
    keywords: 'update updates upgrade auto updater stable beta channel prerelease restart install version download whats new release notes',
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
    tips: ['Proxy and TLS preferences apply to HTTP Send and OAuth token requests from the desktop process.'],
    keywords: 'proxy socks http dns certificates tls ca mtls pem pfx',
  },
  {
    id: 'data-files',
    section: 'data',
    title: 'Files on this PC',
    summary: 'Versioned JSON under the app data folder.',
    body: [
      'Global files include settings.json and session.json. Each workspace has collections.json, environments.json, history.json, cookies.json, and the Services files: flows.json, emulator.json, load.json, and regressions.json.',
      'Settings → Data shows the app folder, configs folder, workspaces folder, and each file’s schema version. You can change folders or reveal them in Explorer.',
    ],
    tips: ['A workspace connected through Collab syncs team files after you save. Secrets, history, cookies, and run logs stay on this PC. Keep a backup of the config folder if the collections matter.'],
    keywords: 'data json settings session collections environments history folder local',
  },
  {
    id: 'data-export',
    section: 'data',
    title: 'Export workspace',
    summary: 'Portable .testrix packs with checksums.',
    body: [
      'Settings → Data → Export workspace opens a pack builder. Toggle categories (collections, flows, mocks, environments, database, and the rest) and drill into collections, flows, and mocks with checkboxes.',
      'The desktop app writes a .testrix zip with manifest checksum verification so you can hand off a workspace without Git.',
    ],
    tips: ['Leave every item checked in a deep tree to include the full category. Uncheck folders to prune what lands in the pack.'],
    keywords: 'export workspace pack testrix checksum backup portable categories',
  },
  {
    id: 'data-import',
    section: 'data',
    title: 'Import workspace',
    summary: 'Merge, replace, or create a workspace from a pack or API file.',
    body: [
      'Settings → Data → Import runs a short wizard: format summary, merge / replace / new workspace, then category and tree selection.',
      'After Apply, Testrix writes JSON on disk and reloads the active workspace snapshot.',
    ],
    tips: ['Use Merge to append Postman or OpenAPI collections without overwriting existing folders.'],
    keywords: 'import workspace merge replace new wizard apply',
  },
  {
    id: 'data-import-postman',
    section: 'data',
    title: 'Postman import',
    summary: 'Collections and environments from Postman JSON.',
    body: [
      'Choose a Postman Collection v2.1 JSON file or a Postman environment export. Testrix converts collections into the internal tree and environments into environments.json when you import with Merge or Replace.',
    ],
    tips: ['Inspect warnings on step one before continuing — unsupported auth or scripts are called out there.'],
    keywords: 'postman collection environment import json v2.1',
  },
  {
    id: 'data-import-bruno',
    section: 'data',
    title: 'Bruno import',
    summary: 'Import a Bruno collection folder.',
    body: [
      'Pick a Bruno folder in the import dialog. Testrix reads .bru files and builds a collection tree preview before you apply.',
    ],
    tips: ['Folder imports work the same as dragging the folder onto the main window.'],
    keywords: 'bruno folder bru import collection',
  },
  {
    id: 'data-import-openapi',
    section: 'data',
    title: 'OpenAPI import',
    summary: 'Generate collections (and optional environments) from OpenAPI 3.',
    body: [
      'OpenAPI 3.x YAML or JSON is detected automatically. The wizard shows generated collections and, when present, an environments category from server variables.',
    ],
    tips: ['Large specs can produce deep trees — use the selection step to import only the operations you need.'],
    keywords: 'openapi swagger yaml json import collection environment',
  },
  {
    id: 'data-import-drag-drop',
    section: 'data',
    title: 'Drag and drop import',
    summary: 'Drop a .testrix, JSON, YAML, or Bruno folder on the shell.',
    body: [
      'While the desktop app is focused, drag a file onto the window. A scrim appears when the drop target accepts Files; releasing opens the same import wizard as Settings → Import.',
      'Electron resolves the absolute path from the dropped File object so inspect works without a manual picker.',
    ],
    tips: ['Drop works for .testrix packs, Postman/OpenAPI JSON, and Bruno directories.'],
    keywords: 'drag drop import scrim shell file testrix',
  },
  {
    id: 'workspaces-export-import',
    section: 'workspaces',
    title: 'Move workspaces between PCs',
    summary: 'Export and import tie into workspace folders on disk.',
    body: [
      'Each workspace is a folder under the workspaces directory. Export packs slice that folder by category; import Merge appends into the active workspace while New creates another folder entry in the switcher.',
      'Replace overwrites selected categories in the active workspace — use it when you want the pack to become the source of truth for those files.',
    ],
    tips: ['After import into a new workspace, use the titlebar switcher to rename or duplicate it like any other workspace.'],
    keywords: 'workspaces export import merge replace new folder switcher pack',
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
      'Open a second workbench with File → New Window or Ctrl+Shift+N when you need another set of tabs on the same workspace.',
      'Mark environment values as secret when they should be redacted in logs.',
      'Collapse the sidebar when you need the full editor width; the rail stays put.',
    ],
    keywords: 'tips speed productivity palette split secret sidebar window',
  },
  {
    id: 'palette-jump',
    section: 'shortcuts',
    title: 'Command palette jumps',
    summary: 'Open pinned favorites, requests, tabs, and failed history from one search.',
    body: [
      'The command palette lists pinned favorites first, then every HTTP and WebSocket request, every open tab, and recent failed history entries.',
      'Right-click a request or flow and choose Pin to palette. Pins travel with the workspace (max 20). Missing pins show as muted until you open them (then they prune).',
      'Type part of a method, URL, or tab title. Arrow keys move the highlight; Enter runs the selected command.',
    ],
    tips: ['Use Close inactive tabs or Close all but current tab to tame large tab strips.'],
    keywords: 'palette command jump tab request history pin pinned favorite',
  },
  {
    id: 'collection-health',
    section: 'collections',
    title: 'Collection health',
    summary: 'Empty URLs and unresolved variables show on the collection row.',
    body: [
      'Testrix marks HTTP and WebSocket requests as you edit them, using the active environment. The check stays on this machine and does not send a request.',
      'A request shows the problem next to its name, such as an empty URL or a leftover variable placeholder in the URL, headers, params, body, or auth. A folder shows how many issues sit inside it.',
      'Click the mark to open the list, then click a row to open that request. The mark clears when the URL or variable is fixed.',
    ],
    tips: ['Switch the active environment to recheck the same requests against a different variable set.'],
    keywords: 'health broken request missing variable url validate collection scan',
  },
  {
    id: 'multi-window',
    section: 'workbench',
    title: 'Multiple windows',
    summary: 'Open another workbench on the same workspace files.',
    body: [
      'File → New Window or Ctrl+Shift+N opens another workbench window on the same user data. Each window keeps its own tabs and layout; collections, environments, and service trees stay shared on disk.',
      'Saving in one window refreshes the tree in the others without wiping unsaved tab drafts. A second OS launch focuses the existing primary window instead of starting a duplicate app.',
      'The workspace switcher is per window, so each window can stay on a different workspace if you need that.',
    ],
    tips: ['Use the command palette “New window” command when the File menu is hidden (frameless chrome).'],
    keywords: 'window multi monitor dual screen new ctrl shift n session',
  },
  {
    id: 'tab-hygiene',
    section: 'workbench',
    title: 'Tab hygiene',
    summary: 'Close stale tabs and watch the soft tab-count warning.',
    body: [
      'Closing a tab disconnects WebSockets and cancels in-flight HTTP for that editor.',
      'Settings → Appearance sets when the status strip warns about too many open tabs (default 24).',
      'Settings → Data shows workspace footprint and offers trim history and close inactive tabs.',
    ],
    tips: ['The dirty status strip under the titlebar jumps between unsaved tabs and opens History filters.'],
    keywords: 'tabs close inactive hygiene warning footprint strip',
  },
  {
    id: 'response-compare',
    section: 'workbench',
    title: 'Compare responses',
    summary: 'Diff runs in the request editor and history viewer.',
    body: [
      'After two or more sends on an HTTP request, open the response Diff tab to compare headers and body side by side.',
      'History tabs can compare the current snapshot response body with the previous run for the same request id.',
    ],
    tips: ['Pick Before and After sources in the request editor when you kept an earlier run in the run list.'],
    keywords: 'compare diff response headers body history runs split',
  },
  {
    id: 'run-recovery',
    section: 'services',
    title: 'Flow and load recovery',
    summary: 'Session checkpoints after interrupted runs.',
    body: [
      'While a flow or load run is active, Testrix throttles a checkpoint into session.json every couple of seconds.',
      'Reopening the flow or load tab offers to restore the last checkpoint or discard it.',
    ],
    tips: ['Finished runs clear their checkpoint automatically.'],
    keywords: 'flow load checkpoint recovery crash session restore',
  },
  {
    id: 'perf-footprint',
    section: 'settings',
    title: 'Perf budget',
    summary: 'Watch workspace size, history, and tab count.',
    body: [
      'Settings → Data → Workspace footprint measures JSON size and history entry count on disk.',
      'The status strip warns when tabs exceed the Appearance tab warning threshold or footprint looks heavy.',
    ],
    tips: ['Trim history or close inactive tabs from Data when footprint grows.'],
    keywords: 'perf budget footprint tabs warn history bytes data settings',
  },
  {
    id: 'settings-focus-mode',
    section: 'settings',
    title: 'Focus mode',
    summary: 'Collapse the sidebar while you edit a request.',
    body: [
      'Settings → Appearance → Focus while editing hides the sidebar after you open a collection request (or when the window is narrow). The activity rail stays visible so you can switch sections without losing canvas width.',
    ],
    tips: ['Toggle the sidebar anytime with Ctrl B.'],
    keywords: 'focus mode sidebar collapse editing appearance focusWhileEditing',
  },
  {
    id: 'workbench-response-tabs',
    section: 'workbench',
    title: 'Progressive response tabs',
    summary: 'Response sections appear as data arrives.',
    body: [
      'Pretty, Raw, Preview, Headers, Cookies, Timeline, Redirects, Diff, and Runs share one tab strip. Count badges on Headers, Cookies, Redirects, and Runs show when those panes have content without forcing you to open them first.',
      'Hide collapses the whole response dock; Open restores the last tab you used on that request.',
    ],
    tips: ['Timeline lists DNS, TCP, TLS, TTFB, and download when the desktop host captured timing.'],
    keywords: 'response tabs pretty raw preview headers cookies timeline redirects diff runs badge hide open',
  },
  {
    id: 'workbench-url-ingest',
    section: 'workbench',
    title: 'URL ingest',
    summary: 'Paste cURL into the URL bar to import a request.',
    body: [
      'When the URL field looks like a cURL command, Testrix imports method, URL, headers, and body into the open HTTP tab. Preview in the URL bar still shows the resolved request before Send.',
    ],
    tips: ['Use Code in the URL bar to copy cURL back out after editing.'],
    keywords: 'curl paste url bar ingest import preview code snippet',
  },
  {
    id: 'keyboard-grids',
    section: 'database',
    title: 'Keyboard grids',
    summary: 'Arrow keys in query results and flow nodes.',
    body: [
      'Database result grids use arrow keys to move the cell focus, Enter to edit, and Ctrl+C to copy as before.',
      'On a flow canvas, Tab cycles nodes, arrows move selection, and Shift+arrow still nudges selected nodes.',
    ],
    tips: ['Focus the grid or canvas first so typing shortcuts are not captured by URL fields.'],
    keywords: 'keyboard grid flow canvas database arrows tabindex accessibility',
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
