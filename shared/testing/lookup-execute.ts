import type { DatabaseConnection } from '../config/database-settings.schema';
import {
  collectEnvironmentVariables,
  environmentVariablesToMap,
  getEnvironmentDefinition,
} from '../config/environment-variables';
import type { EnvironmentsFile } from '../config/environments.schema';
import type { SavedQueryTreeItem } from '../database/saved-queries.schema';
import { isDatabaseQueryEnvelope } from '../database/database-introspect.schema';
import { resolveTemplateVariables } from '../dynamic-variables/template-variables';
import { extractFlowCachedValue } from './validation-value-extract';
import { evaluateLookupWhen } from './lookup-conditions';
import {
  resolveDatabaseStepQueryBinding,
  type ResolvedDatabaseStepQuery,
} from './flow-database-step-query';
import type { DatabaseStepConfig } from './test-suite-steps.schema';
import type { LookupDefinition, LookupExtract, LookupStep } from './lookups.schema';

export const LOOKUP_STEP_LOG_STATUS_IDS = ['ran', 'skipped', 'failed'] as const;
export type LookupStepLogStatus = (typeof LOOKUP_STEP_LOG_STATUS_IDS)[number];

export interface LookupStepLog {
  readonly stepId: string;
  readonly name: string;
  readonly status: LookupStepLogStatus;
  readonly message: string;
  readonly connectionId?: string;
  readonly connectionName?: string;
}

export interface LookupRenderedResult {
  readonly id: string;
  readonly label: string;
  readonly value: string;
}

export interface LookupRunResult {
  readonly ok: boolean;
  readonly environmentId: string | null;
  readonly variables: Readonly<Record<string, string>>;
  readonly results: readonly LookupRenderedResult[];
  readonly stepLog: readonly LookupStepLog[];
}

export interface LookupExecuteRequest {
  readonly environmentId: string | null;
  readonly inputs: Readonly<Record<string, string>>;
}

export interface LookupExecuteDeps {
  readonly connections: readonly DatabaseConnection[];
  readonly savedQueryNodes: readonly SavedQueryTreeItem[];
  readonly environments: EnvironmentsFile;
  readonly query: (connection: DatabaseConnection, sql: string) => Promise<unknown>;
}

/** Builds `{{env}}` context from a lookup environment id. */
export function buildLookupEnvironmentMap(
  environmentId: string | null | undefined,
  environments: EnvironmentsFile,
): Record<string, string> {
  const id = environmentId?.trim() || null;
  const environment = getEnvironmentDefinition(environments.environments, id);
  if (!environment) {
    return {};
  }
  return { ...environmentVariablesToMap(collectEnvironmentVariables(environment.nodes)) };
}

/** Serializes a query envelope so JSONPath `$[0].id` reads the first row. */
export function serializeLookupQueryResult(envelope: unknown): string {
  if (isDatabaseQueryEnvelope(envelope)) {
    return JSON.stringify(envelope.rows ?? [], null, 2);
  }
  if (typeof envelope === 'string') {
    return envelope;
  }
  return JSON.stringify(envelope ?? null, null, 2);
}

/** True when serialized query text contains at least one result row. */
export function lookupQueryHasRows(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.length > 0;
    }
    if (parsed && typeof parsed === 'object' && 'rows' in parsed) {
      const rows = (parsed as { rows?: unknown }).rows;
      return Array.isArray(rows) ? rows.length > 0 : rows != null;
    }
    return parsed != null;
  } catch {
    return true;
  }
}

/** Applies JSONPath extracts from a query result into the variable map. */
export function applyLookupExtracts(
  variables: Record<string, string>,
  extracts: readonly LookupExtract[],
  queryText: string,
): void {
  for (const extract of extracts) {
    const name = extract.variableName.trim();
    if (!name) {
      continue;
    }
    const value = extractFlowCachedValue(queryText, {
      source: 'cached_value',
      extractKind: extract.extractKind === 'full' ? 'full' : extract.extractKind,
      extract: extract.extract,
    });
    if (value != null) {
      variables[name] = value;
    }
  }
}

function stepToDatabaseConfig(step: LookupStep): DatabaseStepConfig {
  return {
    connectionId: step.connectionId,
    query: step.query,
    querySource: step.querySource,
    savedQueryId: step.savedQueryId,
  };
}

function resolveStepBinding(
  step: LookupStep,
  savedQueryNodes: readonly SavedQueryTreeItem[],
): ResolvedDatabaseStepQuery {
  return resolveDatabaseStepQueryBinding(stepToDatabaseConfig(step), savedQueryNodes);
}

function connectionName(
  connections: readonly DatabaseConnection[],
  connectionId: string,
): string {
  return connections.find((entry) => entry.id === connectionId)?.name?.trim() || connectionId;
}

/**
 * Runs a lookup playbook: skip-if conditions, DB queries, extracts, then result templates.
 */
export async function executeLookupPlaybook(
  lookup: LookupDefinition,
  request: LookupExecuteRequest,
  deps: LookupExecuteDeps,
): Promise<LookupRunResult> {
  const environmentId = request.environmentId ?? lookup.environmentId ?? null;
  const envMap = buildLookupEnvironmentMap(environmentId, deps.environments);
  const inputs: Record<string, string> = {};
  for (const field of lookup.inputs) {
    inputs[field.key] = String(request.inputs[field.key] ?? '').trim();
  }
  const variables: Record<string, string> = { ...envMap, ...inputs };
  const stepLog: LookupStepLog[] = [];
  let ok = true;

  for (const step of lookup.steps) {
    if (!step.enabled) {
      continue;
    }
    const passed = evaluateLookupWhen(step.when, { inputs, variables });
    if (!passed) {
      stepLog.push({
        stepId: step.id,
        name: step.name,
        status: 'skipped',
        message: 'Condition was false',
      });
      continue;
    }

    let binding: ResolvedDatabaseStepQuery;
    try {
      binding = resolveStepBinding(step, deps.savedQueryNodes);
    } catch (error: unknown) {
      ok = false;
      stepLog.push({
        stepId: step.id,
        name: step.name,
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
      });
      if (step.required) {
        break;
      }
      continue;
    }

    const connectionId = binding.connectionId.trim();
    if (!connectionId) {
      ok = false;
      stepLog.push({
        stepId: step.id,
        name: step.name,
        status: 'failed',
        message: 'Pick a database connection',
        connectionId,
      });
      if (step.required) {
        break;
      }
      continue;
    }

    const connection = deps.connections.find((entry) => entry.id === connectionId);
    if (!connection) {
      ok = false;
      stepLog.push({
        stepId: step.id,
        name: step.name,
        status: 'failed',
        message: `Unknown database connection`,
        connectionId,
      });
      if (step.required) {
        break;
      }
      continue;
    }

    const sql = resolveTemplateVariables(binding.query, { environment: variables }).trim();
    if (!sql) {
      ok = false;
      stepLog.push({
        stepId: step.id,
        name: step.name,
        status: 'failed',
        message: 'Query is empty',
        connectionId,
        connectionName: connection.name,
      });
      if (step.required) {
        break;
      }
      continue;
    }

    try {
      const envelope = await deps.query(connection, sql);
      const textOut = serializeLookupQueryResult(envelope);
      const hasRows = lookupQueryHasRows(textOut);
      if (!hasRows) {
        if (step.required) {
          ok = false;
          stepLog.push({
            stepId: step.id,
            name: step.name,
            status: 'failed',
            message: 'Query returned no rows',
            connectionId,
            connectionName: connection.name,
          });
          break;
        }
        stepLog.push({
          stepId: step.id,
          name: step.name,
          status: 'ran',
          message: 'No rows',
          connectionId,
          connectionName: connection.name,
        });
        continue;
      }
      applyLookupExtracts(variables, step.extracts, textOut);
      stepLog.push({
        stepId: step.id,
        name: step.name,
        status: 'ran',
        message: connectionName(deps.connections, connectionId),
        connectionId,
        connectionName: connection.name,
      });
    } catch (error: unknown) {
      ok = false;
      stepLog.push({
        stepId: step.id,
        name: step.name,
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
        connectionId,
        connectionName: connection.name,
      });
      if (step.required) {
        break;
      }
    }
  }

  const results = lookup.results.map((field) => ({
    id: field.id,
    label: field.label.trim() || field.id,
    value: resolveTemplateVariables(field.template, { environment: variables }),
  }));

  return { ok, environmentId, variables, results, stepLog };
}
