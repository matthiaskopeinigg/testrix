import { wikiSection } from '../help-wiki.builders';
import type { HelpWikiSection } from '../help-wiki.schema';

export const HELP_WIKI_OVERVIEW_SECTIONS: readonly HelpWikiSection[] = [
  wikiSection({
    id: 'getting-started',
    groupId: 'overview',
    label: 'Getting started',
    icon: 'info',
    title: 'Getting started',
    description: 'Profiles, workspace tabs, and opening Settings.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Testrix is a local-first API workbench. Your collections, environments, and testing data live in profile folders on disk; appearance and HTTP defaults live in shared settings.',
      },
      {
        type: 'subheading',
        text: 'Quick start',
      },
      {
        type: 'list',
        items: [
          'Pick a profile from the title bar menu (or create one in Settings → Data & Config).',
          'Open Collections in the sidebar, expand a folder, and select a request.',
          'Edit URL, headers, and body, then click Send to run the request.',
          'Open Settings with the gear icon in the title bar or Ctrl+, (Cmd+, on macOS).',
        ],
      },
      {
        type: 'tip',
        title: 'Welcome screen',
        text: 'When no workspace tabs are open, the welcome screen shows shortcuts for debug tools, config reload, and runtime info.',
      },
    ],
  }),
  wikiSection({
    id: 'workspace-tabs',
    groupId: 'overview',
    label: 'Workspace & tabs',
    icon: 'layers',
    title: 'Workspace & tabs',
    description: 'Tab bar, splits, pinning, and editor layout.',
    blocks: [
      {
        type: 'paragraph',
        text: 'The main workspace shows one or more editor tabs: HTTP requests, environments, test flows, mock servers, and other resources you open from the sidebar.',
      },
      {
        type: 'list',
        items: [
          'Click a tab to focus it; use the close control or middle-click to close.',
          'Pin tabs to keep them at the front of the tab bar.',
          'Drag tabs to reorder; drop on split zones to open a side-by-side editor pane.',
          'Recent resources are tracked so you can reopen items quickly.',
        ],
      },
      {
        type: 'note',
        text: 'Editor layout (sidebar vs stacked sections) for collection requests is configured in Settings → Collections.',
      },
    ],
  }),
  wikiSection({
    id: 'sidebar-navigation',
    groupId: 'overview',
    label: 'Sidebar navigation',
    icon: 'folder',
    title: 'Sidebar navigation',
    description: 'Icon rail and contextual panels.',
    blocks: [
      {
        type: 'paragraph',
        text: 'The left icon rail switches between major areas. Each icon opens a contextual panel beside the rail except Help, which opens this wiki.',
      },
      {
        type: 'list',
        items: [
          'Collections — HTTP/WebSocket trees and collection management.',
          'Environments — environment definitions and variables.',
          'Testing — test suites, load tests, regression, mock server, capture, interceptor.',
          'Development — built-in utilities (JWT, regex, OpenAPI, etc.).',
          'History — sent request log (footer rail).',
          'Help — this guide (footer rail).',
        ],
      },
      {
        type: 'tip',
        text: 'Resize the sidebar panel by dragging the handle on its right edge.',
      },
    ],
  }),
  wikiSection({
    id: 'profiles-data',
    groupId: 'overview',
    label: 'Profiles & data',
    icon: 'globe',
    title: 'Profiles & data',
    description: 'What is stored per profile vs shared settings.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Profiles isolate workspace data. Switching profiles loads a different collections file, environments file, testing artifacts, and session state.',
      },
      {
        type: 'list',
        items: [
          'Per profile: collections, environments, test suites, load tests, regressions, mock server, capture, interceptor, session/history.',
          'Shared: settings.json (appearance, HTTP defaults, logging, databases list).',
          'Config root defaults to Documents/Testrix on Windows/macOS; see Reference → Local-first & paths.',
        ],
      },
      {
        type: 'note',
        title: 'Backup',
        text: 'Copy your profile folder or entire config directory to back up all workspace data.',
      },
    ],
  }),
];
