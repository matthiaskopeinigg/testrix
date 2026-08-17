import {
  executeLookupPlaybook,
  findLookup,
  lookupRunRequestSchema,
  type LookupRunRequest,
  type LookupRunResult,
} from '../../../shared/testing';
import { ErrorCodes, TestrixError } from '../../../shared/errors';

import type { ConfigFileService } from '../config/config-file.service';
import { databaseQueryService } from '../database/database-query.service';

/**
 * Runs a saved lookup playbook against Database sidebar connections.
 */
export class LookupRunnerService {
  constructor(private readonly files: ConfigFileService) {}

  /**
   * Executes a lookup by id using environment vars, form inputs, and SQL extracts.
   */
  async run(raw: unknown): Promise<LookupRunResult> {
    const parsed = lookupRunRequestSchema.safeParse(raw);
    if (!parsed.success) {
      throw new TestrixError(ErrorCodes.CONFIG_VALIDATION_FAILED, 'Invalid lookup run payload.');
    }
    const request: LookupRunRequest = parsed.data;
    const file = await this.files.readLookups();
    const lookup = findLookup(file.lookups, request.lookupId);
    if (!lookup) {
      throw new TestrixError(ErrorCodes.CONFIG_VALIDATION_FAILED, 'Lookup not found.');
    }
    const [settings, queries, environments] = await Promise.all([
      this.files.readSettings(),
      this.files.readSavedQueries(),
      this.files.readEnvironments(),
    ]);
    return executeLookupPlaybook(
      lookup,
      {
        environmentId: request.environmentId ?? lookup.environmentId ?? null,
        inputs: request.inputs,
      },
      {
        connections: settings.databases.connections,
        savedQueryNodes: queries.nodes,
        environments,
        query: (connection, sql) => databaseQueryService.query(connection, sql),
      },
    );
  }
}

const runners = new WeakMap<ConfigFileService, LookupRunnerService>();

/** Returns a lookup runner bound to the active config file service. */
export function getLookupRunner(files: ConfigFileService): LookupRunnerService {
  const existing = runners.get(files);
  if (existing) {
    return existing;
  }
  const created = new LookupRunnerService(files);
  runners.set(files, created);
  return created;
}
