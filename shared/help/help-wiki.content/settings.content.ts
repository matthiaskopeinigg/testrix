import { wikiSection } from '../help-wiki.builders';
import type { HelpWikiSection } from '../help-wiki.schema';

export const HELP_WIKI_SETTINGS_SECTIONS: readonly HelpWikiSection[] = [
  wikiSection({
    id: 'settings-appearance',
    groupId: 'settings',
    label: 'Appearance',
    icon: 'settings',
    title: 'Settings — Appearance',
    description: 'Themes, fonts, and motion.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Pick from many color themes, UI font/size/weight/line-height, and animation speed (including disable animations).',
      },
    ],
  }),
  wikiSection({
    id: 'settings-ui',
    groupId: 'settings',
    label: 'User Interface',
    icon: 'sliders',
    title: 'Settings — User Interface',
    description: 'Motion and chrome preferences.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Control global animation speed, icon tooltips, and translucent titlebar chrome. Startup and sidebar close behavior live under Settings → General.',
      },
    ],
  }),
  wikiSection({
    id: 'settings-keyboard',
    groupId: 'settings',
    label: 'Keyboard',
    icon: 'code',
    title: 'Settings — Keyboard',
    description: 'App shortcuts, editor behavior, and reference.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Rebind app shortcuts (command palette, Settings, tab close/cycle, Teams panel) in the App shortcuts table. Toggle editor autocomplete, smart editing, and related behaviors below. The editor shortcut reference lists VS Code-style bindings inside code fields (not rebindable in this release).',
      },
    ],
  }),
  wikiSection({
    id: 'settings-collections',
    groupId: 'settings',
    label: 'Collections',
    icon: 'folder',
    title: 'Settings — Collections',
    description: 'Tree behavior and collection tab layout.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Configure folder click behavior, sibling sort order, HTTP method display in the tree, and Editor layout for collection workspace tabs only (HTTP requests, folders, WebSockets). Choose Sidebar (section list in a left panel) or Tabs (sections under the editor bar).',
      },
    ],
  }),
  wikiSection({
    id: 'settings-environments',
    groupId: 'settings',
    label: 'Environments',
    icon: 'globe',
    title: 'Settings — Environments',
    description: 'Environment list defaults.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Sidebar sort and display options for the environments panel.',
      },
    ],
  }),
  wikiSection({
    id: 'settings-test-suite',
    groupId: 'settings',
    label: 'Test Suite',
    icon: 'testing',
    title: 'Settings — Test Suite',
    description: 'Test suite sidebar, layout, and flow tabs.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Tree sorting, tags, and descriptions for the test suite sidebar. Editor layout controls how flow tabs show Overview vs Steps sections (sidebar list or tabs under the bar).',
      },
    ],
  }),
  wikiSection({
    id: 'settings-regression',
    groupId: 'settings',
    label: 'Regression',
    icon: 'testing',
    title: 'Settings — Regression',
    description: 'Regression workspace tab layout.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Editor layout for regression workspace tabs (overview, flows, runs, and related sections). Sidebar or Tabs under the editor bar.',
      },
    ],
  }),
  wikiSection({
    id: 'settings-load-test',
    groupId: 'settings',
    label: 'Load Test',
    icon: 'zap',
    title: 'Settings — Load Test',
    description: 'Load test workspace tab layout.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Editor layout for load test workspace tabs. Sidebar or Tabs under the editor bar.',
      },
    ],
  }),
  wikiSection({
    id: 'settings-mock-server',
    groupId: 'settings',
    label: 'Mock Server',
    icon: 'cloud',
    title: 'Settings — Mock Server',
    description: 'Mock server endpoint tab layout.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Editor layout for mock server endpoint tabs (overview, matchers, response, advanced). Sidebar or Tabs under the editor bar.',
      },
    ],
  }),
  wikiSection({
    id: 'settings-capture',
    groupId: 'settings',
    label: 'Capture',
    icon: 'monitor',
    title: 'Settings — Capture',
    description: 'Capture session tab layout.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Editor layout for capture session tabs (Overview and Traffic sections). Sidebar or Tabs under the editor bar.',
      },
    ],
  }),
  wikiSection({
    id: 'settings-interceptor',
    groupId: 'settings',
    label: 'Interceptor',
    icon: 'shield',
    title: 'Settings — Interceptor',
    description: 'Interceptor rule tab layout.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Editor layout for interceptor rule tabs (Overview, Match, and Action sections). Sidebar or Tabs under the editor bar.',
      },
    ],
  }),
  wikiSection({
    id: 'settings-general',
    groupId: 'settings',
    label: 'General',
    icon: 'folder',
    title: 'Settings — General',
    description: 'Startup and workbench behavior.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Startup options (open last project on launch, restore last sidebar panel) and workbench behavior (close sidebar panel when clicking outside).',
      },
    ],
  }),
  wikiSection({
    id: 'settings-http-request',
    groupId: 'settings',
    label: 'HTTP Request',
    icon: 'api',
    title: 'Settings — HTTP Request',
    description: 'Global request defaults.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Default timeout, redirect limit, SSL verification, and body encoding behavior for outbound HTTP.',
      },
    ],
  }),
  wikiSection({
    id: 'settings-http-retries',
    groupId: 'settings',
    label: 'HTTP Retries',
    icon: 'refresh',
    title: 'Settings — HTTP Retries',
    description: 'Automatic retry policy.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Configure retry count, delay, and which status codes or errors trigger a retry.',
      },
    ],
  }),
  wikiSection({
    id: 'settings-http-testing',
    groupId: 'settings',
    label: 'HTTP Testing',
    icon: 'testing',
    title: 'Settings — HTTP Testing',
    description: 'HTTP behavior during test runs.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Options that apply when test suite or load test steps send HTTP traffic.',
      },
    ],
  }),
  wikiSection({
    id: 'settings-http-headers',
    groupId: 'settings',
    label: 'HTTP Headers',
    icon: 'layers',
    title: 'Settings — HTTP Headers',
    description: 'Default headers merged into requests.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Enable default headers (User-Agent, Accept, etc.) applied to every send when the toggle is on. Preview resolved values before saving.',
      },
    ],
  }),
  wikiSection({
    id: 'settings-http-certificates',
    groupId: 'settings',
    label: 'Certificates',
    icon: 'shield',
    title: 'Settings — Certificates',
    description: 'Client TLS certificates.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Manage client certificate files and passwords for mutual TLS requests.',
      },
    ],
  }),
  wikiSection({
    id: 'settings-http-dns',
    groupId: 'settings',
    label: 'DNS',
    icon: 'globe',
    title: 'Settings — DNS',
    description: 'Custom hosts and DNS overrides.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Map hostnames to IPs for local testing without changing system hosts files globally.',
      },
    ],
  }),
  wikiSection({
    id: 'settings-http-proxy',
    groupId: 'settings',
    label: 'Proxy',
    icon: 'cloud',
    title: 'Settings — Proxy',
    description: 'HTTP/HTTPS proxy configuration.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Route outbound HTTP through a proxy server with optional authentication bypass rules.',
      },
    ],
  }),
  wikiSection({
    id: 'settings-logging',
    groupId: 'settings',
    label: 'Logging',
    icon: 'terminal',
    title: 'Settings — Logging',
    description: 'Log level and log file paths.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Adjust main-process log verbosity and view log file locations. Clear logs from this section when troubleshooting.',
      },
    ],
  }),
  wikiSection({
    id: 'settings-databases',
    groupId: 'settings',
    label: 'Databases',
    icon: 'database',
    title: 'Settings — Databases',
    description: 'Saved database connections.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Define SQLite, PostgreSQL, MySQL, Redis, and SQL Server connections used by test suite DATABASE steps and database tools.',
      },
    ],
  }),
  wikiSection({
    id: 'settings-data-config',
    groupId: 'settings',
    label: 'Data & Config',
    icon: 'folder',
    title: 'Settings — Data & Config',
    description: 'Profiles, config directory, import/export.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Create/rename/delete profiles, change config root directory, import/export workspace data (with format auto-detect and selection), view per-file schema versions, and reset session data.',
      },
    ],
  }),
  wikiSection({
    id: 'settings-about',
    groupId: 'settings',
    label: 'About',
    icon: 'info',
    title: 'Settings — About',
    description: 'Version, updates, and runtime info.',
    blocks: [
      {
        type: 'paragraph',
        text: 'View the app version prominently in the hero, check for updates (with visible checking/available/error/disabled feedback), and inspect Electron/Chromium runtime details.',
      },
    ],
  }),
];
