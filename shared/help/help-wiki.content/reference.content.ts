import { wikiSection } from '../help-wiki.builders';
import type { HelpWikiSection } from '../help-wiki.schema';

export const HELP_WIKI_REFERENCE_SECTIONS: readonly HelpWikiSection[] = [
  wikiSection({
    id: 'ref-keyboard-shortcuts',
    groupId: 'reference',
    label: 'Keyboard shortcuts',
    icon: 'code',
    title: 'Keyboard shortcuts',
    description: 'App chrome and editor bindings.',
    blocks: [
      {
        type: 'paragraph',
        text: 'App shortcuts listed below are defaults — rebind them in Settings → Keyboard → App shortcuts. Editor shortcuts inside code fields are documented in the same section (read-only reference).',
      },
      {
        type: 'list',
        items: [
          'Ctrl+, (Cmd+,) — open Settings.',
          'Ctrl+K (Cmd+K) — toggle command palette (search commands and quick-open workspace items).',
          'Ctrl+Shift+T (Cmd+Shift+T) — toggle Teams panel.',
          'Ctrl+W (Cmd+W) — close active workspace tab.',
          'Ctrl+Tab / Ctrl+Shift+Tab — next / previous tab in the focused pane.',
          'Escape — close modals, settings, help, and the command palette.',
        ],
      },
    ],
  }),
  wikiSection({
    id: 'ref-command-palette',
    groupId: 'reference',
    label: 'Command palette',
    icon: 'search',
    title: 'Command palette',
    description: 'Quick search for commands and workspace items.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Press Ctrl+K (Cmd+K) to open the command palette. Type to fuzzy-search static shell commands and dynamically indexed workspace targets (requests, environments, test flows, dev tools, and more).',
      },
      {
        type: 'list',
        items: [
          'Arrow keys — move selection up or down.',
          'Enter — run the selected command or open the selected item.',
          'Escape — close the palette.',
          'Result rows show contextual hints (method + URL, match URL, start URL, etc.) to distinguish similar names.',
        ],
      },
    ],
  }),
  wikiSection({
    id: 'ref-dynamic-variables',
    groupId: 'reference',
    label: 'Dynamic variables',
    icon: 'hash',
    title: 'Dynamic variables',
    description: '$ placeholders resolved at send time.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Type $ in header, URL, and body fields to open the dynamic variable catalog. Common entries include $uuid, $timestamp, $randomInt, and $guid.',
      },
      {
        type: 'note',
        text: 'Dynamic variables resolve when a request is sent, not when you save the collection.',
      },
    ],
  }),
  wikiSection({
    id: 'ref-local-first-paths',
    groupId: 'reference',
    label: 'Local-first & paths',
    icon: 'folder',
    title: 'Local-first & paths',
    description: 'Where Testrix stores data on disk.',
    blocks: [
      {
        type: 'list',
        items: [
          'Windows — %USERPROFILE%\\Documents\\Testrix',
          'macOS — ~/Documents/Testrix',
          'Linux — $XDG_CONFIG_HOME/testrix or ~/.config/testrix',
          'Main-process logs — beside Electron userData (see Settings → Logging).',
        ],
      },
    ],
  }),
  wikiSection({
    id: 'ref-desktop-updates',
    groupId: 'reference',
    label: 'Desktop & updates',
    icon: 'cloud',
    title: 'Desktop & updates',
    description: 'Electron shell and update banner.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Run npm start or npm run dev for the full Electron desktop with window.testrix IPC bridge. Browser-only ng serve lacks the bridge — config falls back to defaults.',
      },
      {
        type: 'list',
        items: [
          'Update banner appears when a newer release is available (packaged builds).',
          'Settings → About → Check for updates shows checking, available, error, or disabled states.',
          'Dev and unpackaged builds show “Updates apply to the installed desktop app.” when the updater is unavailable.',
          'Splash screen shows during boot; disable with TESTRIX_NO_SPLASH=1 for local iteration.',
        ],
      },
    ],
  }),
  wikiSection({
    id: 'ref-tips-troubleshooting',
    groupId: 'reference',
    label: 'Tips & troubleshooting',
    icon: 'info',
    title: 'Tips & troubleshooting',
    description: 'Common gotchas and fixes.',
    blocks: [
      {
        type: 'list',
        items: [
          'Renderer-only mode — if IPC is unavailable, use npm start instead of ng serve alone.',
          'Profile switch — ensure the correct profile is active before editing collections.',
          'Settings vs profile data — theme and keyboard bindings are global; collections are per profile.',
          'Editor layout — each workspace tab type has its own layout setting under Settings (Sidebar vs Tabs).',
          'Reload config — welcome screen or restart app if files changed on disk externally.',
        ],
      },
      {
        type: 'tip',
        text: 'Use Help anytime from the sidebar footer when you need a feature refresher.',
      },
    ],
  }),
];
