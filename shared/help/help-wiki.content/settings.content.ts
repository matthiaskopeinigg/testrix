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
    description: 'Tooltips, sidebar, and workspace chrome.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Control icon tooltips, sidebar panel close-on-outside-click, entrance stagger animations, and related UI preferences.',
      },
    ],
  }),
  wikiSection({
    id: 'settings-keyboard',
    groupId: 'settings',
    label: 'Keyboard',
    icon: 'code',
    title: 'Settings — Keyboard',
    description: 'Editor shortcuts and autocomplete toggles.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Enable or disable editor keyboard shortcuts, autocomplete sources (JSON snippets, pm.* API, template variables), and smart editing behaviors.',
      },
    ],
  }),
  wikiSection({
    id: 'settings-collections',
    groupId: 'settings',
    label: 'Collections',
    icon: 'folder',
    title: 'Settings — Collections',
    description: 'Tree behavior and editor layout.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Configure folder click behavior, sibling sort order, HTTP method display in the tree, and request tab layout (sidebar vs stacked).',
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
    description: 'Test suite sidebar and run defaults.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Defaults for test suite tree sorting, tags, and flow run behavior.',
      },
    ],
  }),
  wikiSection({
    id: 'settings-general',
    groupId: 'settings',
    label: 'General',
    icon: 'folder',
    title: 'Settings — General',
    description: 'App-wide general preferences.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Miscellaneous application options not covered by other settings groups.',
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
        text: 'Create/rename/delete profiles, change config root directory, import/export settings, and reset session data.',
      },
    ],
  }),
  wikiSection({
    id: 'settings-privacy',
    groupId: 'settings',
    label: 'Privacy',
    icon: 'shield',
    title: 'Settings — Privacy',
    description: 'Telemetry and privacy-related options.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Control privacy-related preferences for the desktop application.',
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
        text: 'View app version, Electron/Chromium versions, check for updates, and open release notes.',
      },
    ],
  }),
];
