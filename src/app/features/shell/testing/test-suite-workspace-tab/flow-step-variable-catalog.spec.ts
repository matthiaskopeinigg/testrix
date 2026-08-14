import { describe, expect, it } from 'vitest';

import type { EnvironmentDefinition } from '@shared/config';
import { DYNAMIC_VARIABLES } from '@shared/dynamic-variables';
import type { TestSuiteFlow } from '@shared/testing';

import { collectPriorFlowPlaceholderKeys } from './flow-step-variable-catalog';

const baseFlow = (nodes: TestSuiteFlow['nodes'] = []): TestSuiteFlow => ({
  id: 'flow-1',
  name: 'Flow',
  description: '',
  tags: [],
  environmentId: 'env-1',
  lastRunStatus: 'never',
  lastRunAt: null,
  nodes,
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const testEnvironment: EnvironmentDefinition = {
  id: 'env-1',
  name: 'Local',
  nodes: [
    {
      id: 'var-1',
      kind: 'variable',
      key: 'baseUrl',
      value: 'https://api.example.com',
    },
  ],
};

describe('collectPriorFlowPlaceholderKeys', () => {
  it('includes dynamic variables and environment placeholders', () => {
    const catalog = collectPriorFlowPlaceholderKeys(baseFlow(), 'step-2', testEnvironment);

    expect(catalog.some((item) => item.id === 'uuid')).toBe(true);
    expect(catalog.some((item) => item.label === '{{baseUrl}}')).toBe(true);
    expect(catalog.indexOf(DYNAMIC_VARIABLES[0]!)).toBeLessThan(
      catalog.findIndex((item) => item.label === '{{baseUrl}}'),
    );
  });

  it('includes manual step placeholders from prior steps only', () => {
    const flow = baseFlow([
      {
        id: 'step-1',
        type: 'step',
        parentId: null,
        stepType: 'MANUAL',
        name: 'Set token',
        enabled: true,
        config: { variableName: 'authToken' },
      },
      {
        id: 'step-2',
        type: 'step',
        parentId: null,
        stepType: 'REQUEST',
        name: 'Call API',
        enabled: true,
        config: {},
      },
    ]);

    const catalog = collectPriorFlowPlaceholderKeys(flow, 'step-2', null);

    expect(catalog.some((item) => item.label === '{{authToken}}')).toBe(true);
  });

  it('excludes manual step placeholders after the current step', () => {
    const flow = baseFlow([
      {
        id: 'step-1',
        type: 'step',
        parentId: null,
        stepType: 'REQUEST',
        name: 'First',
        enabled: true,
        config: {},
      },
      {
        id: 'step-2',
        type: 'step',
        parentId: null,
        stepType: 'MANUAL',
        name: 'Later manual',
        enabled: true,
        config: { variableName: 'laterVar' },
      },
    ]);

    const catalog = collectPriorFlowPlaceholderKeys(flow, 'step-1', null);

    expect(catalog.some((item) => item.label === '{{laterVar}}')).toBe(false);
  });

  it('includes cache step placeholders from prior steps only', () => {
    const flow = baseFlow([
      {
        id: 'step-1',
        type: 'step',
        parentId: null,
        stepType: 'CACHE',
        name: 'Extract user id',
        enabled: true,
        config: {
          refStepId: 'req-1',
          entries: [
            {
              variableName: 'userId',
              source: 'response_body',
              expression: '',
              extractKind: 'jsonpath',
              extract: '$[0].id',
            },
          ],
        },
      },
      {
        id: 'step-2',
        type: 'step',
        parentId: null,
        stepType: 'REQUEST',
        name: 'Follow-up',
        enabled: true,
        config: {},
      },
    ]);

    const catalog = collectPriorFlowPlaceholderKeys(flow, 'step-2', null);

    expect(catalog.some((item) => item.label === '{{userId}}')).toBe(true);
  });
});
