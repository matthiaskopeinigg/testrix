import { describe, expect, it } from 'vitest';

import {
  isTestSuiteFlow,
  isTestSuiteFolder,
  testSuitesFileSchema,
  TEST_SUITE_MAX_FOLDER_DEPTH,
} from './test-suites.schema';

describe('test-suites.schema', () => {
  it('rejects suite folders deeper than max depth', () => {
    const buildFolder = (depth: number, id: string): object => {
      if (depth <= 0) {
        return {
          id,
          name: `L${id}`,
          description: '',
          tags: [],
          children: [],
          updatedAt: '2026-01-01T00:00:00.000Z',
        };
      }
      return {
        id,
        name: `L${id}`,
        description: '',
        tags: [],
        updatedAt: '2026-01-01T00:00:00.000Z',
        children: [buildFolder(depth - 1, `${id}-c`)],
      };
    };

    expect(() => testSuitesFileSchema.parse({
      schemaVersion: 1,
      suites: [
        {
          id: 'root-suite',
          name: 'Test Suite',
          updatedAt: '2026-01-01T00:00:00.000Z',
          flows: [buildFolder(TEST_SUITE_MAX_FOLDER_DEPTH + 2, 'deep')],
        },
      ],
    })).toThrow(/at most 15 levels/);
  });

  it('parses flows with nodes as flows, not folders', () => {
    const parsed = testSuitesFileSchema.parse({
      schemaVersion: 1,
      suites: [
        {
          id: 'root-suite',
          name: 'Test Suite',
          flows: [
            {
              id: 'flw-1',
              name: 'My Flow',
              description: '',
              tags: [],
              nodes: [],
              lastRunStatus: 'never',
              lastRunAt: null,
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    const item = parsed.suites[0]?.flows[0];
    expect(isTestSuiteFlow(item!)).toBe(true);
    expect(isTestSuiteFolder(item!)).toBe(false);
    if (isTestSuiteFlow(item!)) {
      expect(item.nodes).toEqual([]);
    }
  });

  it('coerces mis-parsed flows (flow fields without nodes) back to flows', () => {
    const parsed = testSuitesFileSchema.parse({
      schemaVersion: 1,
      suites: [
        {
          id: 'root-suite',
          name: 'Test Suite',
          flows: [
            {
              id: 'flw-bad',
              name: 'Was saved as folder',
              description: '',
              tags: [],
              children: [],
              lastRunStatus: 'never',
              lastRunAt: null,
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    expect(isTestSuiteFlow(parsed.suites[0]?.flows[0]!)).toBe(true);
  });

  it('parses folders with environmentId as folders after reload', () => {
    const parsed = testSuitesFileSchema.parse({
      schemaVersion: 1,
      suites: [
        {
          id: 'root-suite',
          name: 'Test Suite',
          flows: [
            {
              id: 'fld-env',
              name: 'Folder',
              description: '',
              tags: [],
              environmentId: 'env-default',
              children: [],
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    const item = parsed.suites[0]?.flows[0];
    expect(isTestSuiteFolder(item!)).toBe(true);
    expect(isTestSuiteFlow(item!)).toBe(false);
    if (isTestSuiteFolder(item!)) {
      expect(item.environmentId).toBe('env-default');
      expect(item.children).toEqual([]);
    }
  });

  it('accepts flow with step nodes', () => {
    const parsed = testSuitesFileSchema.parse({
      schemaVersion: 1,
      suites: [
        {
          id: 'root-suite',
          name: 'Test Suite',
          flows: [
            {
              id: 'flw-1',
              name: 'Flow',
              description: '',
              tags: [],
              nodes: [
                {
                  id: 's1',
                  type: 'step',
                  name: 'Request',
                  parentId: null,
                  stepType: 'REQUEST',
                  config: { method: 'GET', url: 'https://example.com' },
                  enabled: true,
                },
              ],
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    expect(parsed.suites[0]?.flows[0]).toMatchObject({ name: 'Flow' });
  });
});
