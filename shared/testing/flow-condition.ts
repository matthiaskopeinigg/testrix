import { z } from 'zod';

/** Operators shared by IF / skip-unless / WHILE conditions. */
export const FLOW_CONDITION_OPERATORS = [
  'equals',
  'not_equals',
  'contains',
  'matches_regex',
  'greater_than',
  'less_than',
  'is_empty',
  'is_not_empty',
] as const;

export const flowConditionOperatorSchema = z.enum(FLOW_CONDITION_OPERATORS);
export type FlowConditionOperator = z.infer<typeof flowConditionOperatorSchema>;

export const flowConditionClauseSchema = z.object({
  left: z.string().default(''),
  operator: flowConditionOperatorSchema.default('equals'),
  right: z.string().default(''),
});

export type FlowConditionClause = z.infer<typeof flowConditionClauseSchema>;

/** AND-combined clauses. Empty `clauses` is treated as unmatched. */
export const flowConditionSchema = z.object({
  clauses: z.array(flowConditionClauseSchema).max(8).default([]),
});

export type FlowCondition = z.infer<typeof flowConditionSchema>;

export function createDefaultFlowCondition(): FlowCondition {
  return flowConditionSchema.parse({
    clauses: [{ left: '', operator: 'equals', right: '' }],
  });
}

function compareClause(
  clause: FlowConditionClause,
  resolve: (raw: string) => string,
): boolean {
  const left = resolve(clause.left);
  const right = resolve(clause.right);
  switch (clause.operator) {
    case 'equals':
      return left === right;
    case 'not_equals':
      return left !== right;
    case 'contains':
      return left.includes(right);
    case 'matches_regex': {
      try {
        return new RegExp(right).test(left);
      } catch {
        return false;
      }
    }
    case 'greater_than':
      return Number(left) > Number(right);
    case 'less_than':
      return Number(left) < Number(right);
    case 'is_empty':
      return left.trim().length === 0;
    case 'is_not_empty':
      return left.trim().length > 0;
    default:
      return false;
  }
}

/** True when every clause matches after `{{placeholder}}` resolution. */
export function evaluateFlowCondition(
  condition: FlowCondition | null | undefined,
  resolve: (raw: string) => string,
): boolean {
  const clauses = condition?.clauses ?? [];
  if (clauses.length === 0) {
    return false;
  }
  return clauses.every((clause) => compareClause(clause, resolve));
}

/** True when skip-unless is unset or the condition matches. */
export function shouldRunSkipUnless(
  condition: FlowCondition | null | undefined,
  resolve: (raw: string) => string,
): boolean {
  const clauses = condition?.clauses ?? [];
  if (clauses.length === 0 || clauses.every((clause) => !clause.left.trim())) {
    return true;
  }
  return evaluateFlowCondition(condition, resolve);
}

/**
 * Parses a FOR_EACH source after template resolution into string items.
 * Accepts a JSON array, a JSON object (values), or a comma-separated list.
 */
export function parseForEachSource(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => (typeof item === 'string' ? item : JSON.stringify(item)));
    }
    if (parsed && typeof parsed === 'object') {
      return Object.values(parsed as Record<string, unknown>).map((item) =>
        typeof item === 'string' ? item : JSON.stringify(item),
      );
    }
  } catch {
    /* fall through to CSV */
  }
  return trimmed
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
