import { findSavedQuery, type SavedQueryTreeItem } from '../database/saved-queries.schema';

import type { DatabaseStepConfig } from './test-suite-steps.schema';

export type FlowDatabaseStepQuerySource = 'manual' | 'saved';

/** Resolves whether a DATABASE step writes SQL inline or references a saved query. */
export function resolveDatabaseStepQuerySource(
  cfg: DatabaseStepConfig,
): FlowDatabaseStepQuerySource {
  if (cfg.querySource === 'manual' || cfg.querySource === 'saved') {
    return cfg.querySource;
  }
  return cfg.savedQueryId ? 'saved' : 'manual';
}

export interface ResolvedDatabaseStepQuery {
  readonly connectionId: string;
  readonly query: string;
}

/**
 * Resolves the connection and query text a DATABASE step should run.
 * Saved queries are read from the Database sidebar tree at execute time.
 */
export function resolveDatabaseStepQueryBinding(
  cfg: DatabaseStepConfig,
  savedQueryNodes: readonly SavedQueryTreeItem[],
): ResolvedDatabaseStepQuery {
  const source = resolveDatabaseStepQuerySource(cfg);
  if (source === 'saved') {
    const savedQueryId = String(cfg.savedQueryId ?? '').trim();
    if (!savedQueryId) {
      throw new Error('DATABASE step needs a saved query.');
    }
    const saved = findSavedQuery(savedQueryNodes, savedQueryId);
    if (!saved) {
      throw new Error(`Unknown saved query id: ${savedQueryId}`);
    }
    const connectionId =
      String(cfg.connectionId ?? '').trim() || String(saved.connectionId ?? '').trim();
    return { connectionId, query: String(saved.query ?? '') };
  }
  return {
    connectionId: String(cfg.connectionId ?? '').trim(),
    query: String(cfg.query ?? ''),
  };
}
