export type SettingsCategory =
  | 'appearance'
  | 'keyboard'
  | 'collections'
  | 'environments'
  | 'database'
  | 'proxy'
  | 'dns'
  | 'certificates'
  | 'logging'
  | 'data'
  | 'about';

export interface SettingsNavItem {
  readonly id: SettingsCategory;
  readonly label: string;
  readonly group: string;
}

export interface SettingsSearchHit {
  readonly id: string;
  readonly category: SettingsCategory;
  readonly label: string;
  readonly keywords: string;
}

export const SETTINGS_NAV: readonly SettingsNavItem[] = [
  { id: 'appearance', label: 'Appearance', group: 'Look & feel' },
  { id: 'keyboard', label: 'Keyboard', group: 'Look & feel' },
  { id: 'collections', label: 'Collections', group: 'Workspace' },
  { id: 'environments', label: 'Environments', group: 'Workspace' },
  { id: 'database', label: 'Database', group: 'Workspace' },
  { id: 'proxy', label: 'Proxy', group: 'Network' },
  { id: 'dns', label: 'DNS', group: 'Network' },
  { id: 'certificates', label: 'Certificates', group: 'Network' },
  { id: 'logging', label: 'Logging', group: 'System' },
  { id: 'data', label: 'Data', group: 'System' },
  { id: 'about', label: 'About', group: 'System' },
];

export const SETTINGS_NAV_GROUPS: readonly { readonly label: string; readonly ids: readonly SettingsCategory[] }[] = [
  { label: 'Look & feel', ids: ['appearance', 'keyboard'] },
  { label: 'Workspace', ids: ['collections', 'environments', 'database'] },
  { label: 'Network', ids: ['proxy', 'dns', 'certificates'] },
  { label: 'System', ids: ['logging', 'data', 'about'] },
];

export const SETTINGS_SEARCH_INDEX: readonly SettingsSearchHit[] = [
  {
    id: 'theme',
    category: 'appearance',
    label: 'Theme',
    keywords: 'dark light system appearance color',
  },
  {
    id: 'motion',
    category: 'appearance',
    label: 'Animation speed',
    keywords: 'motion animation speed reduced open enter',
  },
  {
    id: 'motion-leave',
    category: 'appearance',
    label: 'Close animation',
    keywords: 'motion close leave dismiss overlay menu sidebar pane',
  },
  {
    id: 'font-ui',
    category: 'appearance',
    label: 'Interface font',
    keywords: 'font typeface segoe system',
  },
  {
    id: 'font-mono',
    category: 'appearance',
    label: 'Monospace font',
    keywords: 'font mono cascadia consolas code',
  },
  {
    id: 'font-scale',
    category: 'appearance',
    label: 'Type scale',
    keywords: 'font size scale text',
  },
  {
    id: 'icon-scale',
    category: 'appearance',
    label: 'Icon scale',
    keywords: 'icons size density',
  },
  {
    id: 'shortcuts',
    category: 'keyboard',
    label: 'Shortcuts',
    keywords: 'keyboard hotkeys chords palette settings sidebar',
  },
  {
    id: 'collections-soon',
    category: 'collections',
    label: 'Collections',
    keywords: 'collections tree empty coming soon',
  },
  {
    id: 'environments-soon',
    category: 'environments',
    label: 'Environments',
    keywords: 'environments list empty coming soon',
  },
  {
    id: 'db-startup',
    category: 'database',
    label: 'Connect on startup',
    keywords: 'connect startup idle disconnect boot pool minutes rollback uncommitted push commit preview database',
  },
  {
    id: 'db-idle',
    category: 'database',
    label: 'Disconnect idle connections',
    keywords: 'idle disconnect minutes pool unused',
  },
  {
    id: 'db-rollback',
    category: 'database',
    label: 'Rollback uncommitted queries',
    keywords: 'rollback uncommitted push commit preview timer seconds minutes',
  },
  {
    id: 'db-boot-list',
    category: 'database',
    label: 'Connect on boot',
    keywords: 'boot connect per connection startup',
  },
  {
    id: 'proxy-mode',
    category: 'proxy',
    label: 'Proxy mode',
    keywords: 'proxy system off none http socks socks5 network',
  },
  {
    id: 'proxy-host',
    category: 'proxy',
    label: 'Proxy host',
    keywords: 'proxy host hostname address port',
  },
  {
    id: 'proxy-auth',
    category: 'proxy',
    label: 'Proxy authentication',
    keywords: 'proxy username password auth login',
  },
  {
    id: 'proxy-bypass',
    category: 'proxy',
    label: 'Proxy bypass',
    keywords: 'proxy bypass exclude localhost no proxy',
  },
  {
    id: 'dns-mode',
    category: 'dns',
    label: 'DNS mode',
    keywords: 'dns system custom resolver nameserver',
  },
  {
    id: 'dns-servers',
    category: 'dns',
    label: 'DNS servers',
    keywords: 'dns servers nameservers 1.1.1.1 8.8.8.8',
  },
  {
    id: 'tls-verify',
    category: 'certificates',
    label: 'Verify TLS',
    keywords: 'tls ssl verify certificate trust https',
  },
  {
    id: 'extra-ca',
    category: 'certificates',
    label: 'Extra CA',
    keywords: 'ca certificate pem crt corporate trust store',
  },
  {
    id: 'client-certs',
    category: 'certificates',
    label: 'Client certificates',
    keywords: 'client certificate mtls pfx p12 pem key passphrase',
  },
  {
    id: 'log-level',
    category: 'logging',
    label: 'Log level',
    keywords: 'logging error warn info debug',
  },
  {
    id: 'log-file',
    category: 'logging',
    label: 'Write log file',
    keywords: 'logging file disk logs',
  },
  {
    id: 'log-folder',
    category: 'logging',
    label: 'Logs folder',
    keywords: 'logging folder directory path change',
  },
  {
    id: 'log-max',
    category: 'logging',
    label: 'Max log file',
    keywords: 'logging size rotate megabyte mb slider',
  },
  {
    id: 'log-recent',
    category: 'logging',
    label: 'Last logs',
    keywords: 'logging recent tail history lines',
  },
  {
    id: 'config-folder',
    category: 'data',
    label: 'App folder',
    keywords: 'data files versions reveal explorer change directory app',
  },
  {
    id: 'configs-folder',
    category: 'data',
    label: 'Configs folder',
    keywords: 'configs settings.json session.json change directory',
  },
  {
    id: 'reset-all',
    category: 'data',
    label: 'Reset all settings',
    keywords: 'reset defaults settings.json',
  },
  {
    id: 'version',
    category: 'about',
    label: 'App version',
    keywords: 'about version update local offline',
  },
];

export function filterSettingsHits(query: string): readonly SettingsSearchHit[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [];
  }
  return SETTINGS_SEARCH_INDEX.filter((item) =>
    `${item.label} ${item.keywords} ${item.category}`.toLowerCase().includes(needle),
  );
}
