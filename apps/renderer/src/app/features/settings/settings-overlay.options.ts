import type { DnsMode, FontMono, FontUi, LogLevel, ProxyMode, TypeScale } from '@testrix/contracts';

export const TAB_WARN_THRESHOLD_MIN = 8;
export const TAB_WARN_THRESHOLD_MAX = 200;

export const FONT_UI_LABELS: Record<FontUi, string> = {
  'segoe-variable': 'Segoe UI Variable',
  segoe: 'Segoe UI',
  system: 'System UI',
};

export const FONT_UI_STACKS: Record<FontUi, string> = {
  'segoe-variable':
    "'Segoe UI Variable Text', 'Segoe UI Variable Display', 'Segoe UI Variable', 'Segoe UI', sans-serif",
  segoe: "'Segoe UI', sans-serif",
  system: 'Tahoma, Geneva, Verdana, sans-serif',
};

export const FONT_MONO_LABELS: Record<FontMono, string> = {
  cascadia: 'Cascadia Code',
  consolas: 'Consolas',
  'ui-monospace': 'UI Monospace',
};

export const FONT_MONO_STACKS: Record<FontMono, string> = {
  cascadia: "'Cascadia Code', 'Cascadia Mono', 'Segoe UI Mono', ui-monospace, monospace",
  consolas: "Consolas, 'Courier New', ui-monospace, monospace",
  'ui-monospace': "ui-monospace, 'Courier New', monospace",
};

export const SCALE_LABELS: Record<TypeScale, string> = {
  sm: 'S',
  md: 'M',
  lg: 'L',
};

export const SCALE_PREVIEW: Record<TypeScale, string> = {
  sm: '0.85em',
  md: '1em',
  lg: '1.45em',
};

export const LOG_LEVEL_LABELS: Record<LogLevel, string> = {
  error: 'Error',
  warn: 'Warn',
  info: 'Info',
  debug: 'Debug',
};

export const PROXY_MODE_LABELS: Record<ProxyMode, string> = {
  system: 'System',
  none: 'Off',
  http: 'HTTP',
  socks5: 'SOCKS5',
};

export const DNS_MODE_LABELS: Record<DnsMode, string> = {
  system: 'System',
  custom: 'Custom',
};
