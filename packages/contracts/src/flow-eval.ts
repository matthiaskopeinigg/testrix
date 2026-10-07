import { expandPlaceholders, type ExpandPlaceholderOptions } from './placeholders';
import type { FlowStep } from './flows-file';

export interface FlowEvalContext {
  readonly status: number;
  readonly body: string;
  /** Lowercased response header names from the last HTTP exchange. */
  readonly headers: Record<string, string>;
  readonly vars: Record<string, string>;
  /** Last HTTP method (empty until an exchange lands). */
  readonly method: string;
  /** Last HTTP URL (empty until an exchange lands). */
  readonly url: string;
  /** Last request body when known. */
  readonly requestBody: string;
}

/**
 * Replaces `{{name}}` tokens from the flow variable map.
 */
export function interpolateFlow(text: string, vars: Readonly<Record<string, string>>): string {
  return text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_all, key: string) => lookupFlowVar(vars, key) ?? '');
}

/** Exact key, then a trimmed case-insensitive match so `{{username}}` finds `Username`. */
function lookupFlowVar(vars: Readonly<Record<string, string>>, key: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(vars, key))
    return vars[key];
  const needle = key.trim().toLowerCase();
  for (const name of Object.keys(vars)) {
    if (name.trim().toLowerCase() === needle)
      return vars[name];
  }
  return undefined;
}

/**
 * Substitutes `{{name}}`, then expands `$randomEmail` and `%randomEmail` (and the other catalog tokens).
 * Unknown `$foo` / `%foo` stay as written. Percent-encoding such as `%20` is left alone.
 */
export function resolveFlowText(
  text: string,
  vars: Readonly<Record<string, string>>,
  options: ExpandPlaceholderOptions = {},
): string {
  const interpolated = interpolateFlow(text, vars);
  const dollars = expandPlaceholders(interpolated, options);
  return dollars.replace(/%([A-Za-z][A-Za-z0-9]*)(?:\(([^)]*)\))?/g, (match, name: string, rawArgs: string | undefined) => {
    const dollar = rawArgs === undefined ? `$${name}` : `$${name}(${rawArgs})`;
    const expanded = expandPlaceholders(dollar, options);
    return expanded === dollar ? match : expanded;
  });
}

/**
 * Evaluates a compact comparison used by IF / WHILE / VALIDATION steps.
 */
export function evalFlowCondition(
  expression: string,
  ctx: FlowEvalContext,
  options: ExpandPlaceholderOptions = {},
): boolean {
  const expr = resolveFlowText(expression, ctx.vars, options).trim();
  if (!expr)
    return true;
  if (expr === 'true' || expr === '1')
    return true;
  if (expr === 'false' || expr === '0' || expr === '')
    return false;
  const compare = /^(status|body|[\w.-]+)\s*(==|!=|>=|<=|>|<)\s*(.+)$/.exec(expr);
  if (!compare)
    return expr.length > 0;
  const leftKey = compare[1] ?? '';
  const op = compare[2] ?? '==';
  const rightRaw = (compare[3] ?? '').trim().replace(/^['"]|['"]$/g, '');
  const left =
    leftKey === 'status'
      ? String(ctx.status)
      : leftKey === 'body'
        ? ctx.body
        : (ctx.vars[leftKey] ?? leftKey);
  const leftNum = Number(left);
  const rightNum = Number(rightRaw);
  if (Number.isFinite(leftNum) && Number.isFinite(rightNum)) {
    if (op === '==')
      return leftNum === rightNum;
    if (op === '!=')
      return leftNum !== rightNum;
    if (op === '>')
      return leftNum > rightNum;
    if (op === '<')
      return leftNum < rightNum;
    if (op === '>=')
      return leftNum >= rightNum;
    return leftNum <= rightNum;
  }
  if (op === '!=')
    return left !== rightRaw;
  return left === rightRaw;
}

export function flattenEnabledSteps(steps: readonly FlowStep[]): FlowStep[] {
  const out: FlowStep[] = [];
  const walk = (list: readonly FlowStep[]): void => {
    for (const step of list) {
      if (!step.enabled)
        continue;
      out.push(step);
      if (step.children?.length)
        walk(step.children);
    }
  };
  walk(steps);
  return out;
}
