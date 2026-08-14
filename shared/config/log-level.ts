/** Main-process log verbosity (`settings.logging.level`). */
export const LOG_LEVEL_IDS = ['trace', 'debug', 'info', 'warn', 'error'] as const;

export type LogLevel = (typeof LOG_LEVEL_IDS)[number];

const LOG_LEVEL_RANK: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
};

/** Returns true when `level` should be emitted given the configured minimum. */
export function isLogLevelEnabled(configured: LogLevel, level: LogLevel): boolean {
  return LOG_LEVEL_RANK[level] >= LOG_LEVEL_RANK[configured];
}

export const LOG_LEVEL_OPTIONS: readonly {
  readonly id: LogLevel;
  readonly label: string;
}[] = [
  { id: 'trace', label: 'Trace' },
  { id: 'debug', label: 'Debug' },
  { id: 'info', label: 'Info' },
  { id: 'warn', label: 'Warn' },
  { id: 'error', label: 'Error' },
];
