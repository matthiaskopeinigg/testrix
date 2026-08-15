import { CronExpressionParser } from 'cron-parser';

import type { MonitorDefinition } from './monitors.schema';

/**
 * Returns the next cron fire time after `from`, or `null` when the expression is invalid.
 */
export function computeNextMonitorRunAt(expression: string, from: Date = new Date()): string | null {
  try {
    const interval = CronExpressionParser.parse(expression, { currentDate: from });
    return interval.next().toISOString();
  } catch {
    return null;
  }
}

/**
 * Returns whether a monitor should fire at `now`.
 */
export function isMonitorDue(monitor: MonitorDefinition, now: Date = new Date()): boolean {
  if (!monitor.enabled) {
    return false;
  }
  const next = monitor.nextRunAt?.trim();
  if (next) {
    const nextMs = Date.parse(next);
    return Number.isFinite(nextMs) && nextMs <= now.getTime();
  }
  const last = monitor.lastRunAt?.trim();
  if (last) {
    const lastDate = new Date(last);
    if (Number.isNaN(lastDate.getTime())) {
      return false;
    }
    const upcoming = computeNextMonitorRunAt(monitor.cron, lastDate);
    if (!upcoming) {
      return false;
    }
    return Date.parse(upcoming) <= now.getTime();
  }
  const first = computeNextMonitorRunAt(monitor.cron, now);
  return first !== null && Date.parse(first) <= now.getTime() + 1_000;
}
