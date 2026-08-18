import { describe, expect, it } from 'vitest';

import type { EnvironmentDefinition } from '@shared/config';
import { DYNAMIC_VARIABLES } from '@shared/dynamic-variables';
import type { TestSuiteFlow, TestSuiteTreeItem } from '@shared/testing';

import {
  collectPriorFlowPlaceholderKeys,
  findCatalogPlaceholderSource,
} from './flow-step-variable-catalog';

const baseFlow = (
  nodes: TestSuiteFlow['nodes'] = [],
  id = 'flow-1',
  name = 'Flow',
): TestSuiteFlow => ({
  id,
  name,
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

  it('includes enabled dataset column keys', () => {
    const flow = {
      ...baseFlow(),
      dataset: { enabled: true, rows: [{ username: 'admin', password: 'secret' }] },
    };
    const catalog = collectPriorFlowPlaceholderKeys(flow, 'step-2', null);
    expect(catalog.some((item) => item.label === '{{username}}')).toBe(true);
    expect(catalog.some((item) => item.label === '{{password}}')).toBe(true);
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

  it('includes generated cache placeholders from prior steps', () => {
    const flow = baseFlow([
      {
        id: 'step-1',
        type: 'step',
        parentId: null,
        stepType: 'CACHE',
        name: 'Cache email',
        enabled: true,
        config: {
          refStepId: null,
          entries: [
            {
              variableName: 'email',
              source: 'generated',
              expression: '',
              value: 'test-$uuid@gmail.com',
            },
          ],
        },
      },
      {
        id: 'step-2',
        type: 'step',
        parentId: null,
        stepType: 'E2E',
        name: 'Type email',
        enabled: true,
        config: {},
      },
    ]);

    const catalog = collectPriorFlowPlaceholderKeys(flow, 'step-2', null);
    const email = catalog.find((item) => item.label === '{{email}}');

    expect(email).toMatchObject({
      insert: '{{email}}',
      sourceFlowId: 'flow-1',
      sourceStepId: 'step-1',
    });
    expect(findCatalogPlaceholderSource(catalog, 'email')).toEqual({
      flowId: 'flow-1',
      stepId: 'step-1',
    });
  });

  it('includes cache placeholders inherited from a prior TRIGGER flow', () => {
    const flow1 = baseFlow(
      [
        {
          id: 'cache-email',
          type: 'step',
          parentId: null,
          stepType: 'CACHE',
          name: 'Cache email',
          enabled: true,
          config: {
            refStepId: null,
            entries: [
              {
                variableName: 'email',
                source: 'generated',
                expression: '',
                value: 'test-$uuid@gmail.com',
              },
            ],
          },
        },
      ],
      'flow-1',
      'Flow-1',
    );

    const flow2 = baseFlow(
      [
        {
          id: 'trigger-1',
          type: 'step',
          parentId: null,
          stepType: 'TRIGGER',
          name: 'Run Flow-1',
          enabled: true,
          config: { targetType: 'flow', targetId: 'flow-1' },
        },
        {
          id: 'request-1',
          type: 'step',
          parentId: null,
          stepType: 'REQUEST',
          name: 'Use email',
          enabled: true,
          config: {},
        },
      ],
      'flow-2',
      'Flow-2',
    );

    const catalog = collectPriorFlowPlaceholderKeys(flow2, 'request-1', null, undefined, [
      flow1,
      flow2,
    ]);
    const email = catalog.find((item) => item.label === '{{email}}');

    expect(email?.sourceFlowId).toBe('flow-1');
    expect(email?.sourceStepId).toBe('cache-email');
    expect(findCatalogPlaceholderSource(catalog, 'email')).toEqual({
      flowId: 'flow-1',
      stepId: 'cache-email',
    });
  });

  it('includes cache placeholders inherited from a prior TRIGGER folder', () => {
    const nested = baseFlow(
      [
        {
          id: 'cache-email',
          type: 'step',
          parentId: null,
          stepType: 'CACHE',
          name: 'Cache email',
          enabled: true,
          config: {
            refStepId: null,
            entries: [
              { variableName: 'email', source: 'generated', expression: '', value: 'a@b.c' },
            ],
          },
        },
      ],
      'flow-1',
    );

    const folder: TestSuiteTreeItem = {
      id: 'folder-1',
      name: 'Auth',
      description: '',
      tags: [],
      children: [nested],
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const flow2 = baseFlow(
      [
        {
          id: 'trigger-1',
          type: 'step',
          parentId: null,
          stepType: 'TRIGGER',
          name: 'Run folder',
          enabled: true,
          config: { targetType: 'folder', targetId: 'folder-1' },
        },
        {
          id: 'request-1',
          type: 'step',
          parentId: null,
          stepType: 'REQUEST',
          name: 'Use email',
          enabled: true,
          config: {},
        },
      ],
      'flow-2',
    );

    const catalog = collectPriorFlowPlaceholderKeys(flow2, 'request-1', null, undefined, [
      folder,
      flow2,
    ]);

    expect(catalog.some((item) => item.label === '{{email}}')).toBe(true);
  });

  it('excludes TRIGGER-inherited placeholders when the TRIGGER is after the current step', () => {
    const flow1 = baseFlow(
      [
        {
          id: 'cache-email',
          type: 'step',
          parentId: null,
          stepType: 'CACHE',
          name: 'Cache email',
          enabled: true,
          config: {
            refStepId: null,
            entries: [
              { variableName: 'email', source: 'generated', expression: '', value: 'a@b.c' },
            ],
          },
        },
      ],
      'flow-1',
    );

    const flow2 = baseFlow(
      [
        {
          id: 'request-1',
          type: 'step',
          parentId: null,
          stepType: 'REQUEST',
          name: 'Too early',
          enabled: true,
          config: {},
        },
        {
          id: 'trigger-1',
          type: 'step',
          parentId: null,
          stepType: 'TRIGGER',
          name: 'Run Flow-1',
          enabled: true,
          config: { targetType: 'flow', targetId: 'flow-1' },
        },
      ],
      'flow-2',
    );

    const catalog = collectPriorFlowPlaceholderKeys(flow2, 'request-1', null, undefined, [
      flow1,
      flow2,
    ]);

    expect(catalog.some((item) => item.label === '{{email}}')).toBe(false);
  });

  it('includes placeholders from nested TRIGGER targets', () => {
    const flow0 = baseFlow(
      [
        {
          id: 'cache-email',
          type: 'step',
          parentId: null,
          stepType: 'CACHE',
          name: 'Cache email',
          enabled: true,
          config: {
            refStepId: null,
            entries: [
              { variableName: 'email', source: 'generated', expression: '', value: 'a@b.c' },
            ],
          },
        },
      ],
      'flow-0',
    );

    const flow1 = baseFlow(
      [
        {
          id: 'trigger-0',
          type: 'step',
          parentId: null,
          stepType: 'TRIGGER',
          name: 'Run Flow-0',
          enabled: true,
          config: { targetType: 'flow', targetId: 'flow-0' },
        },
      ],
      'flow-1',
    );

    const flow2 = baseFlow(
      [
        {
          id: 'trigger-1',
          type: 'step',
          parentId: null,
          stepType: 'TRIGGER',
          name: 'Run Flow-1',
          enabled: true,
          config: { targetType: 'flow', targetId: 'flow-1' },
        },
        {
          id: 'request-1',
          type: 'step',
          parentId: null,
          stepType: 'REQUEST',
          name: 'Use email',
          enabled: true,
          config: {},
        },
      ],
      'flow-2',
    );

    const catalog = collectPriorFlowPlaceholderKeys(flow2, 'request-1', null, undefined, [
      flow0,
      flow1,
      flow2,
    ]);

    expect(findCatalogPlaceholderSource(catalog, 'email')).toEqual({
      flowId: 'flow-0',
      stepId: 'cache-email',
    });
  });

  it('does not recurse forever when TRIGGER targets form a cycle', () => {
    const flow1 = baseFlow(
      [
        {
          id: 'trigger-2',
          type: 'step',
          parentId: null,
          stepType: 'TRIGGER',
          name: 'Run Flow-2',
          enabled: true,
          config: { targetType: 'flow', targetId: 'flow-2' },
        },
        {
          id: 'cache-email',
          type: 'step',
          parentId: null,
          stepType: 'CACHE',
          name: 'Cache email',
          enabled: true,
          config: {
            refStepId: null,
            entries: [
              { variableName: 'email', source: 'generated', expression: '', value: 'a@b.c' },
            ],
          },
        },
      ],
      'flow-1',
    );

    const flow2 = baseFlow(
      [
        {
          id: 'trigger-1',
          type: 'step',
          parentId: null,
          stepType: 'TRIGGER',
          name: 'Run Flow-1',
          enabled: true,
          config: { targetType: 'flow', targetId: 'flow-1' },
        },
        {
          id: 'request-1',
          type: 'step',
          parentId: null,
          stepType: 'REQUEST',
          name: 'Use email',
          enabled: true,
          config: {},
        },
      ],
      'flow-2',
    );

    const catalog = collectPriorFlowPlaceholderKeys(flow2, 'request-1', null, undefined, [
      flow1,
      flow2,
    ]);

    expect(catalog.some((item) => item.label === '{{email}}')).toBe(true);
  });

  it('includes placeholders cached by an earlier sibling TRIGGER on a caller flow', () => {
    const flow1 = baseFlow(
      [
        {
          id: 'cache-email',
          type: 'step',
          parentId: null,
          stepType: 'CACHE',
          name: 'Cache email',
          enabled: true,
          config: {
            refStepId: null,
            entries: [
              { variableName: 'email', source: 'generated', expression: '', value: 'a@b.c' },
            ],
          },
        },
      ],
      'flow-1',
      'Flow-1',
    );

    const flow2 = baseFlow(
      [
        {
          id: 'request-1',
          type: 'step',
          parentId: null,
          stepType: 'REQUEST',
          name: 'Use email',
          enabled: true,
          config: {},
        },
      ],
      'flow-2',
      'Flow-2',
    );

    const flow3 = baseFlow(
      [
        {
          id: 'trigger-1',
          type: 'step',
          parentId: null,
          stepType: 'TRIGGER',
          name: 'Run Flow-1',
          enabled: true,
          config: { targetType: 'flow', targetId: 'flow-1' },
        },
        {
          id: 'trigger-2',
          type: 'step',
          parentId: null,
          stepType: 'TRIGGER',
          name: 'Run Flow-2',
          enabled: true,
          config: { targetType: 'flow', targetId: 'flow-2' },
        },
        {
          id: 'cache-later',
          type: 'step',
          parentId: null,
          stepType: 'CACHE',
          name: 'After children',
          enabled: true,
          config: {
            refStepId: null,
            entries: [
              { variableName: 'laterVar', source: 'generated', expression: '', value: 'nope' },
            ],
          },
        },
      ],
      'flow-3',
      'Flow-3',
    );

    const catalog = collectPriorFlowPlaceholderKeys(flow2, 'request-1', null, undefined, [
      flow1,
      flow2,
      flow3,
    ]);

    expect(findCatalogPlaceholderSource(catalog, 'email')).toEqual({
      flowId: 'flow-1',
      stepId: 'cache-email',
    });
    expect(catalog.some((item) => item.label === '{{laterVar}}')).toBe(false);
  });

  it('catalogs a CACHE alias that was saved with wrapping braces as {{email}}', () => {
    const flow = baseFlow([
      {
        id: 'cache-email',
        type: 'step',
        parentId: null,
        stepType: 'CACHE',
        name: 'Cache email',
        enabled: true,
        config: {
          refStepId: null,
          entries: [
            { variableName: '{{email}}', source: 'generated', expression: '', value: 'a@b.c' },
          ],
        },
      },
      {
        id: 'request-1',
        type: 'step',
        parentId: null,
        stepType: 'REQUEST',
        name: 'Use email',
        enabled: true,
        config: {},
      },
    ]);

    const catalog = collectPriorFlowPlaceholderKeys(flow, 'request-1', null);
    expect(catalog.some((item) => item.insert === '{{email}}')).toBe(true);
    expect(catalog.some((item) => item.insert === '{{{{email}}}}')).toBe(false);
  });

  it('excludes placeholders from a sibling TRIGGER that runs after this flow', () => {
    const flow1 = baseFlow(
      [
        {
          id: 'cache-email',
          type: 'step',
          parentId: null,
          stepType: 'CACHE',
          name: 'Cache email',
          enabled: true,
          config: {
            refStepId: null,
            entries: [
              { variableName: 'email', source: 'generated', expression: '', value: 'a@b.c' },
            ],
          },
        },
      ],
      'flow-1',
    );

    const flow2 = baseFlow(
      [
        {
          id: 'request-1',
          type: 'step',
          parentId: null,
          stepType: 'REQUEST',
          name: 'Use email',
          enabled: true,
          config: {},
        },
      ],
      'flow-2',
    );

    const flow3 = baseFlow(
      [
        {
          id: 'trigger-2',
          type: 'step',
          parentId: null,
          stepType: 'TRIGGER',
          name: 'Run Flow-2',
          enabled: true,
          config: { targetType: 'flow', targetId: 'flow-2' },
        },
        {
          id: 'trigger-1',
          type: 'step',
          parentId: null,
          stepType: 'TRIGGER',
          name: 'Run Flow-1',
          enabled: true,
          config: { targetType: 'flow', targetId: 'flow-1' },
        },
      ],
      'flow-3',
    );

    const catalog = collectPriorFlowPlaceholderKeys(flow2, 'request-1', null, undefined, [
      flow1,
      flow2,
      flow3,
    ]);

    expect(catalog.some((item) => item.label === '{{email}}')).toBe(false);
  });

  it('includes placeholders from earlier flows in a caller folder TRIGGER', () => {
    const flow1 = baseFlow(
      [
        {
          id: 'cache-email',
          type: 'step',
          parentId: null,
          stepType: 'CACHE',
          name: 'Cache email',
          enabled: true,
          config: {
            refStepId: null,
            entries: [
              { variableName: 'email', source: 'generated', expression: '', value: 'a@b.c' },
            ],
          },
        },
      ],
      'flow-1',
    );

    const flow2 = baseFlow(
      [
        {
          id: 'request-1',
          type: 'step',
          parentId: null,
          stepType: 'REQUEST',
          name: 'Use email',
          enabled: true,
          config: {},
        },
      ],
      'flow-2',
    );

    const folder: TestSuiteTreeItem = {
      id: 'folder-1',
      name: 'Auth',
      description: '',
      tags: [],
      children: [flow1, flow2],
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const flow3 = baseFlow(
      [
        {
          id: 'trigger-folder',
          type: 'step',
          parentId: null,
          stepType: 'TRIGGER',
          name: 'Run folder',
          enabled: true,
          config: { targetType: 'folder', targetId: 'folder-1' },
        },
      ],
      'flow-3',
    );

    const catalog = collectPriorFlowPlaceholderKeys(flow2, 'request-1', null, undefined, [
      folder,
      flow3,
    ]);

    expect(findCatalogPlaceholderSource(catalog, 'email')).toEqual({
      flowId: 'flow-1',
      stepId: 'cache-email',
    });
  });

  it('prefers a flow placeholder over an environment variable with the same key', () => {
    const flow = baseFlow([
      {
        id: 'step-1',
        type: 'step',
        parentId: null,
        stepType: 'CACHE',
        name: 'Cache email',
        enabled: true,
        config: {
          refStepId: null,
          entries: [{ variableName: 'baseUrl', source: 'generated', expression: '', value: 'x' }],
        },
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

    const catalog = collectPriorFlowPlaceholderKeys(flow, 'step-2', testEnvironment);

    expect(findCatalogPlaceholderSource(catalog, 'baseUrl')).toEqual({
      flowId: 'flow-1',
      stepId: 'step-1',
    });
  });
});
