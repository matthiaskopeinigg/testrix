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
        type: 'list',
        items: [
          'Ctrl+, (Cmd+,) — open Settings.',
          'Escape — close modals, settings, and this help wiki.',
          'Editor shortcuts — see Settings → Keyboard for the full VS Code-style reference.',
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
          'Settings vs profile data — theme changes are global; collections are per profile.',
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
