import { describe, expect, it, vi } from 'vitest';

import type { DatabaseConnection } from '../config/database-settings.schema';
import { createDefaultEnvironments } from '../config/defaults';
import { applyLookupExtracts, executeLookupPlaybook, lookupQueryHasRows } from './lookup-execute';
import { createLookupDefinition, createLookupResultField, createLookupStep } from './lookups.schema';

const CONNECTION: DatabaseConnection = {
  id: 'db-1',
  kind: 'connection',
  name: 'Profiles',
  type: 'postgresql',
  host: 'localhost',
  port: 5432,
  user: 'app',
  password: '',
  database: 'app',
  connectOnBoot: false,
};

describe('lookup-execute', () => {
  it('treats empty arrays as no rows', () => {
    expect(lookupQueryHasRows('[]')).toBe(false);
    expect(lookupQueryHasRows('[{"id":1}]')).toBe(true);
  });

  it('extracts JSONPath from the first row', () => {
    const variables: Record<string, string> = {};
    applyLookupExtracts(
      variables,
      [{ variableName: 'uuid', extract: '$[0].id', extractKind: 'jsonpath' }],
      JSON.stringify([{ id: 'u-1' }]),
    );
    expect(variables['uuid']).toBe('u-1');
  });

  it('skips a step when the input is not an email', async () => {
    const lookup = createLookupDefinition('lk-1', 'Customer');
    const step = createLookupStep('st-1', 'By email');
    step.when = { kind: 'isEmail', source: 'input.identifier' };
    step.connectionId = 'db-1';
    step.query = 'select 1';
    lookup.steps = [step];
    lookup.results = [createLookupResultField('r1', 'UUID')];
    lookup.results[0].template = '{{uuid}}';

    const query = vi.fn();
    const result = await executeLookupPlaybook(
      lookup,
      { environmentId: null, inputs: { identifier: 'not-email' } },
      {
        connections: [CONNECTION],
        savedQueryNodes: [],
        environments: createDefaultEnvironments(),
        query,
      },
    );
    expect(query).not.toHaveBeenCalled();
    expect(result.stepLog[0]?.status).toBe('skipped');
  });

  it('runs a query and renders results', async () => {
    const lookup = createLookupDefinition('lk-1', 'Customer');
    const step = createLookupStep('st-1', 'By email');
    step.connectionId = 'db-1';
    step.query = "select * from users where email = '{{identifier}}'";
    step.extracts = [{ variableName: 'uuid', extract: '$[0].id', extractKind: 'jsonpath' }];
    lookup.steps = [step];
    lookup.results = [{ id: 'r1', label: 'UUID', template: '{{uuid}}' }];

    const query = vi.fn().mockResolvedValue({ rows: [{ id: 'u-9' }] });
    const result = await executeLookupPlaybook(
      lookup,
      { environmentId: null, inputs: { identifier: 'a@b.com' } },
      {
        connections: [CONNECTION],
        savedQueryNodes: [],
        environments: createDefaultEnvironments(),
        query,
      },
    );
    expect(query).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.results[0]?.value).toBe('u-9');
    expect(result.stepLog[0]?.connectionName).toBe('Profiles');
  });
});
