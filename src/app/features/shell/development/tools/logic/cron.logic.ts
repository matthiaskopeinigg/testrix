import { CronExpressionParser } from 'cron-parser';
import cronstrue from 'cronstrue';

export interface CronFields {
  readonly minute: string;
  readonly hour: string;
  readonly dayOfMonth: string;
  readonly month: string;
  readonly dayOfWeek: string;
}

export function buildCronExpression(fields: CronFields): string {
  return `${fields.minute.trim() || '*'} ${fields.hour.trim() || '*'} ${fields.dayOfMonth.trim() || '*'} ${fields.month.trim() || '*'} ${fields.dayOfWeek.trim() || '*'}`;
}

export function describeCron(expression: string): string {
  try {
    return cronstrue.toString(expression, { throwExceptionOnParseError: true });
  } catch {
    return 'Invalid cron expression.';
  }
}

export function nextCronRuns(expression: string, count = 5): readonly string[] {
  try {
    const interval = CronExpressionParser.parse(expression);
    const runs: string[] = [];
    for (let i = 0; i < count; i++) {
      runs.push(interval.next().toDate().toLocaleString());
    }
    return runs;
  } catch {
    return [];
  }
}

export const CRON_PRESETS: readonly {
  readonly id: string;
  readonly label: string;
  readonly fields: CronFields;
}[] = [
  { id: 'every-minute', label: 'Every minute', fields: { minute: '*', hour: '*', dayOfMonth: '*', month: '*', dayOfWeek: '*' } },
  { id: 'hourly', label: 'Every hour', fields: { minute: '0', hour: '*', dayOfMonth: '*', month: '*', dayOfWeek: '*' } },
  { id: 'daily-midnight', label: 'Daily at midnight', fields: { minute: '0', hour: '0', dayOfMonth: '*', month: '*', dayOfWeek: '*' } },
  { id: 'weekdays-9', label: 'Weekdays 9:00', fields: { minute: '0', hour: '9', dayOfMonth: '*', month: '*', dayOfWeek: '1-5' } },
  { id: 'monthly', label: 'Monthly (1st)', fields: { minute: '0', hour: '0', dayOfMonth: '1', month: '*', dayOfWeek: '*' } },
];
