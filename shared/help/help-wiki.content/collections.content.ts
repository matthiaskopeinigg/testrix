import { wikiSection } from '../help-wiki.builders';
import type { HelpWikiSection } from '../help-wiki.schema';

export const HELP_WIKI_COLLECTIONS_SECTIONS: readonly HelpWikiSection[] = [
  wikiSection({
    id: 'collections-tree',
    groupId: 'collections',
    label: 'Collections tree',
    icon: 'folder',
    title: 'Collections tree',
    description: 'Folders, requests, WebSockets, search, and context menus.',
    blocks: [
      {
        type: 'paragraph',
        text: 'The Collections panel shows a hierarchical tree of folders, HTTP requests, and WebSocket entries for the active profile.',
      },
      {
        type: 'list',
        items: [
          'Search filters the tree by name, method, URL, and tags.',
          'Filter and sort menus refine visible items (method, kind, tags).',
          'Right-click for context actions: new folder/request, duplicate, delete, export.',
          'Double-click or use folder click behavior (Settings → Collections) to open tabs.',
          'Use Ctrl+K (Cmd+K) to quick-open collection items from the command palette.',
        ],
      },
    ],
  }),
  wikiSection({
    id: 'http-requests',
    groupId: 'collections',
    label: 'HTTP requests',
    icon: 'api',
    title: 'HTTP requests',
    description: 'Send requests and inspect responses.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Each HTTP request tab combines method, URL, section panels, and a response viewer. Click Send to execute; results appear below with status, timing, headers, and body.',
      },
      {
        type: 'note',
        text: 'Request, folder, and WebSocket tabs use Settings → Collections → Editor layout (Sidebar vs Tabs). Other workspace tab types have their own layout settings.',
      },
      {
        type: 'list',
        items: [
          'Method dropdown supports standard HTTP verbs.',
          'URL field accepts path + query; params panel syncs query string.',
          'Response viewer supports pretty JSON/XML, raw text, and preview modes.',
          'Successful sends are recorded in History unless disabled.',
        ],
      },
    ],
  }),
  wikiSection({
    id: 'request-overview',
    groupId: 'collections',
    label: 'Request: Overview',
    icon: 'info',
    title: 'Request — Overview',
    description: 'Name, description, and tags.',
    blocks: [
      {
        type: 'paragraph',
        text: 'The Overview section holds metadata shown in the collection tree and used for search/filter.',
      },
      {
        type: 'list',
        items: [
          'Name appears on the tab and tree row.',
          'Description is optional subtitle text in the tree.',
          'Tags help filter collections and organize requests.',
        ],
      },
    ],
  }),
  wikiSection({
    id: 'request-params',
    groupId: 'collections',
    label: 'Request: Params',
    icon: 'hash',
    title: 'Request — Params',
    description: 'Query string parameters.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Params build the query string appended to the request URL. Enable/disable rows to include or exclude them at send time.',
      },
      {
        type: 'tip',
        text: 'Use $ dynamic placeholders in values (e.g. $uuid) — they resolve when the request is sent.',
      },
    ],
  }),
  wikiSection({
    id: 'request-headers',
    groupId: 'collections',
    label: 'Request: Headers',
    icon: 'layers',
    title: 'Request — Headers',
    description: 'Request and response header editing.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Add HTTP header rows with autocomplete for common header names and suggested values. Disabled rows are omitted on send.',
      },
      {
        type: 'note',
        text: 'Default headers from Settings → HTTP → Headers merge into every request when enabled.',
      },
    ],
  }),
  wikiSection({
    id: 'request-body',
    groupId: 'collections',
    label: 'Request: Body',
    icon: 'fileText',
    title: 'Request — Body',
    description: 'JSON, form-data, binary, GraphQL, and more.',
    blocks: [
      {
        type: 'list',
        items: [
          'None — no body (typical for GET).',
          'JSON / XML / raw text — syntax-aware editors with format actions.',
          'Form-data — multipart fields and file paths.',
          'Binary — file upload from disk.',
          'GraphQL — query + variables editors.',
        ],
      },
    ],
  }),
  wikiSection({
    id: 'request-auth',
    groupId: 'collections',
    label: 'Request: Auth',
    icon: 'lock',
    title: 'Request — Auth',
    description: 'Authentication attached to the request.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Configure auth mode and credentials on the request. Auth headers or query params are applied when the request is built for send.',
      },
    ],
  }),
  wikiSection({
    id: 'request-scripts',
    groupId: 'collections',
    label: 'Request: Scripts',
    icon: 'code',
    title: 'Request — Scripts',
    description: 'Pre-request and post-response scripts.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Pre-request scripts run before send; post-response scripts run after the response returns. Use the Postman-compatible pm API for variables, requests, and tests.',
      },
      {
        type: 'tip',
        text: 'Enable JavaScript autocomplete for pm.* in Settings → Keyboard.',
      },
    ],
  }),
  wikiSection({
    id: 'request-settings',
    groupId: 'collections',
    label: 'Request: Settings',
    icon: 'sliders',
    title: 'Request — Settings',
    description: 'Per-request HTTP overrides.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Override global HTTP defaults for this request: timeouts, redirect following, SSL verification, and related options.',
      },
    ],
  }),
  wikiSection({
    id: 'request-docs',
    groupId: 'collections',
    label: 'Request: Docs',
    icon: 'fileText',
    title: 'Request — Docs',
    description: 'Inline documentation for the request.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Free-form documentation stored with the request — useful for API notes, examples, and team handoff.',
      },
    ],
  }),
  wikiSection({
    id: 'websockets',
    groupId: 'collections',
    label: 'WebSockets',
    icon: 'link',
    title: 'WebSockets',
    description: 'Connect, send messages, and monitor traffic.',
    blocks: [
      {
        type: 'paragraph',
        text: 'WebSocket collection entries open a dedicated tab with connection URL, message composer, and message log.',
      },
      {
        type: 'list',
        items: [
          'Connect/disconnect controls manage the live socket.',
          'Send text or binary frames from the composer.',
          'Settings panel covers headers and connection options.',
        ],
      },
    ],
  }),
  wikiSection({
    id: 'collection-folders',
    groupId: 'collections',
    label: 'Collection folders',
    icon: 'folder',
    title: 'Collection folders',
    description: 'Folder defaults and overview.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Folders group requests and can inherit default headers or other settings to child requests when enabled at send time.',
      },
      {
        type: 'list',
        items: [
          'Folder Overview tab summarizes contents and metadata.',
          'Folder Settings tab configures inherited defaults.',
        ],
      },
    ],
  }),
  wikiSection({
    id: 'variables-placeholders',
    groupId: 'collections',
    label: 'Variables & placeholders',
    icon: 'hash',
    title: 'Variables & placeholders',
    description: '$ dynamic values and {{environment}} syntax.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Type $ in value fields to insert dynamic placeholders (uuid, timestamp, randomInt, etc.). Environment variables use {{name}} and resolve from the active environment.',
      },
      {
        type: 'tip',
        text: 'See Reference → Dynamic variables for the full catalog.',
      },
    ],
  }),
];
