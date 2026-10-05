export type SettingsCategory =
  | 'appearance'
  | 'keyboard'
  | 'http'
  | 'database'
  | 'collab'
  | 'android'
  | 'proxy'
  | 'dns'
  | 'certificates'
  | 'logging'
  | 'data'
  | 'updates'
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
  /** Opens Services instead of a missing settings pane (Android emulator). */
  readonly externalRoute?: 'emulator';
}

export const SETTINGS_NAV: readonly SettingsNavItem[] = [
  { id: 'appearance', label: 'Appearance', group: 'Look & feel' },
  { id: 'keyboard', label: 'Keyboard', group: 'Look & feel' },
  { id: 'http', label: 'HTTP', group: 'Workspace' },
  { id: 'database', label: 'Database', group: 'Workspace' },
  { id: 'collab', label: 'Collab', group: 'Workspace' },
  { id: 'proxy', label: 'Proxy', group: 'Network' },
  { id: 'dns', label: 'DNS', group: 'Network' },
  { id: 'certificates', label: 'Certificates', group: 'Network' },
  { id: 'logging', label: 'Logging', group: 'System' },
  { id: 'data', label: 'Data', group: 'System' },
  { id: 'updates', label: 'Updates', group: 'System' },
  { id: 'about', label: 'About', group: 'System' },
];

export const SETTINGS_NAV_GROUPS: readonly { readonly label: string; readonly ids: readonly SettingsCategory[] }[] = [
  { label: 'Look & feel', ids: ['appearance', 'keyboard'] },
  { label: 'Workspace', ids: ['http', 'database', 'collab'] },
  { label: 'Network', ids: ['proxy', 'dns', 'certificates'] },
  { label: 'System', ids: ['logging', 'data', 'updates', 'about'] },
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
    label: 'Motion',
    keywords: 'motion animation speed reduced normal snappy open enter',
  },
  {
    id: 'motion-leave',
    category: 'appearance',
    label: 'Close animation',
    keywords: 'motion close leave dismiss overlay menu sidebar pane customize',
  },
  {
    id: 'focus-editing',
    category: 'appearance',
    label: 'Focus while editing',
    keywords: 'focus sidebar collapse editing request canvas width narrow',
  },
  {
    id: 'save-mode',
    category: 'appearance',
    label: 'Save mode',
    keywords: 'save auto manual draft discard collections flows ctrl s',
  },
  {
    id: 'icon-scale',
    category: 'appearance',
    label: 'Icon scale',
    keywords: 'icons size density rail tree',
  },
  {
    id: 'font-scale',
    category: 'appearance',
    label: 'Type scale',
    keywords: 'font size type scale text',
  },
  {
    id: 'tab-warn',
    category: 'appearance',
    label: 'Tab count warning',
    keywords: 'tabs open count warning hygiene strip palette close inactive',
  },
  {
    id: 'workspace-footprint',
    category: 'data',
    label: 'Workspace footprint',
    keywords: 'disk size history entries tabs perf budget data trim',
  },
  {
    id: 'trim-history',
    category: 'data',
    label: 'Trim history',
    keywords: 'history old days remove clear perf footprint',
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
    id: 'ui-zoom',
    category: 'appearance',
    label: 'Zoom',
    keywords: 'zoom scale ctrl scroll wheel bigger smaller columns text chrome',
  },
  {
    id: 'shortcuts',
    category: 'keyboard',
    label: 'Shortcuts',
    keywords: 'keyboard hotkeys chords palette settings sidebar help request zoom',
  },
  {
    id: 'http-headers',
    category: 'http',
    label: 'Default headers',
    keywords: 'http default headers user-agent accept encoding connection keep-alive request send collections',
  },
  {
    id: 'http-email',
    category: 'http',
    label: 'Random email domain',
    keywords: 'random email domain placeholder $randomEmail test.at',
  },
  {
    id: 'http-cookies',
    category: 'http',
    label: 'Cookie jar',
    keywords: 'cookies jar cookies.json set-cookie session workspace send store auth oauth bearer manage',
  },
  {
    id: 'http-apikey',
    category: 'http',
    label: 'API key header',
    keywords: 'api key header x-api-key authorization apikey',
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
    id: 'collab-repository',
    category: 'collab',
    label: 'Repository',
    keywords: 'collab repository git remote https ssh token branch connect disconnect update forget',
  },
  {
    id: 'collab-identity',
    category: 'collab',
    label: 'Your name on changes',
    keywords: 'collab identity name email author commits',
  },
  {
    id: 'collab-pause',
    category: 'collab',
    label: 'Pause sync',
    keywords: 'collab pause resume sync workspace shared',
  },
  {
    id: 'collab-presence',
    category: 'collab',
    label: 'Appear offline',
    keywords: 'collab presence offline invisible who is active teammates',
  },
  {
    id: 'collab-runs',
    category: 'collab',
    label: 'Share regression results',
    keywords: 'collab regression runs results share lock team',
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
    keywords: 'data files versions reveal explorer change directory app folders',
  },
  {
    id: 'configs-folder',
    category: 'data',
    label: 'Configs folder',
    keywords: 'configs settings.json session.json change directory folders',
  },
  {
    id: 'export-workspace',
    category: 'data',
    label: 'Export workspace',
    keywords: 'export pack testrix backup portable archive checksum import transfer',
  },
  {
    id: 'import-workspace',
    category: 'data',
    label: 'Import workspace',
    keywords: 'import merge replace postman bruno openapi drag drop export transfer',
  },
  {
    id: 'reset-all',
    category: 'data',
    label: 'Reset all settings',
    keywords: 'reset defaults settings.json',
  },
  {
    id: 'workspace-files',
    category: 'data',
    label: 'Workspace files',
    keywords: 'collections environments flows mocks history cookies workspace json',
  },
  {
    id: 'version',
    category: 'about',
    label: 'App version',
    keywords: 'about version local offline',
  },
  {
    id: 'update-channel',
    category: 'updates',
    label: 'Update channel',
    keywords: 'update channel stable beta prerelease release version upgrade',
  },
  {
    id: 'update-auto',
    category: 'updates',
    label: 'Automatic updates',
    keywords: 'update auto check download background restart install new version',
  },
  {
    id: 'android-activate',
    category: 'android',
    label: 'Android emulator',
    keywords: 'android emulator activate sdk adb avd sidecar download install',
    externalRoute: 'emulator',
  },
  {
    id: 'android-sdk',
    category: 'android',
    label: 'Android SDK',
    keywords: 'android sdk root path platform-tools system image license',
    externalRoute: 'emulator',
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
