import { describe, expect, it } from 'vitest';

import { evalFlowCondition } from './flow-eval';
import { buildFlowRunPlan, emptyFlowGraphNode, emptyFlowScenario, ensureFlowScenarioTerminals } from './flow-graph';
import { aggregateLoadSamples, percentile } from './load-metrics';
import { mockEndpointMatches, parseMocksFile } from './mocks-file';
import { parseFlowsFile } from './flows-file';
import { interceptRuleMatches } from './intercept-file';

describe('mock matcher', () => {
  it('matches method and path, including a trailing wildcard', () => {
    const endpoint = {
      enabled: true,
      method: 'GET',
      path: '/api/*',
      statusCode: 200,
      headers: [],
      body: '{}',
      delayMs: 0,
      priority: 0,
      description: '',
      tags: [],
    };
    expect(mockEndpointMatches(endpoint, 'GET', '/api/users')).toBe(true);
    expect(mockEndpointMatches(endpoint, 'POST', '/api/users')).toBe(false);
    expect(mockEndpointMatches({ ...endpoint, path: '/health' }, 'GET', '/health')).toBe(true);
    expect(mockEndpointMatches({ ...endpoint, enabled: false }, 'GET', '/api/users')).toBe(false);
  });

  it('parses a mocks file with empty defaults', () => {
    const file = parseMocksFile({ items: [] });
    expect(file.items).toEqual([]);
    expect(file.options.host).toBe('127.0.0.1');
  });
});

describe('flow condition', () => {
  it('compares status and interpolated variables', () => {
    expect(evalFlowCondition('status == 200', { status: 200, body: '', vars: {} })).toBe(true);
    expect(evalFlowCondition('status != 200', { status: 500, body: '', vars: {} })).toBe(true);
    expect(evalFlowCondition('ok == yes', { status: 200, body: '', vars: { ok: 'yes' } })).toBe(true);
    expect(evalFlowCondition('{{flag}} == on', { status: 200, body: '', vars: { flag: 'on' } })).toBe(true);
    expect(evalFlowCondition('false', { status: 200, body: '', vars: {} })).toBe(false);
  });

  it('parses a flows file', () => {
    const file = parseFlowsFile({ items: [{ kind: 'artifact', id: 'a', name: 'A', steps: [] }] });
    expect(file.items[0]?.kind).toBe('artifact');
    if (file.items[0]?.kind === 'artifact') {
      expect(file.items[0].deviceSerial).toBe('');
      expect(file.items[0].apkPath).toBe('');
      expect(file.items[0].deviceStartEmulator).toBe(true);
    }
  });
});

describe('flow scenario migration', () => {
  it('chains legacy steps into one scenario graph', () => {
    const file = parseFlowsFile({
      items: [
        {
          kind: 'artifact',
          id: 'a',
          name: 'A',
          steps: [
            { id: 's1', kind: 'e2e', e2eAction: 'navigate', url: 'http://127.0.0.1/', enabled: true },
            { id: 's2', kind: 'e2e', e2eAction: 'click', selector: '#go', enabled: true },
          ],
        },
      ],
    });
    const artifact = file.items[0];
    if (artifact?.kind !== 'artifact')
      throw new Error('expected artifact');
    const scenario = artifact.scenarios[0]!;
    expect(scenario.nodes.map((node) => node.kind)).toEqual(['browser-open', 'browser-click']);
    expect(scenario.edges).toHaveLength(1);
    expect(scenario.edges[0]).toMatchObject({ from: 's1', to: 's2', fromPort: 'next' });
  });

  it('turns a legacy parallel block into a fan-out and a gather', () => {
    const file = parseFlowsFile({
      items: [
        {
          kind: 'artifact',
          id: 'a',
          name: 'A',
          steps: [
            {
              id: 'p',
              kind: 'parallel',
              enabled: true,
              children: [
                { id: 'b1', kind: 'wait', enabled: true },
                { id: 'b2', kind: 'wait', enabled: true },
              ],
            },
            { id: 'after', kind: 'wait', enabled: true },
          ],
        },
      ],
    });
    const artifact = file.items[0];
    if (artifact?.kind !== 'artifact')
      throw new Error('expected artifact');
    const scenario = artifact.scenarios[0]!;
    const plan = buildFlowRunPlan(scenario);
    const waveOf = (id: string) => plan.steps.find((step) => step.nodeId === id)?.wave;
    expect(waveOf('p')).toBe(0);
    expect(waveOf('b1')).toBe(1);
    expect(waveOf('b2')).toBe(1);
    expect(waveOf('after')).toBe(2);
  });

  it('keeps already migrated scenarios untouched', () => {
    const scenario = emptyFlowScenario('Checkout');
    const file = parseFlowsFile({
      items: [{ kind: 'artifact', id: 'a', name: 'A', scenarios: [scenario] }],
    });
    const artifact = file.items[0];
    if (artifact?.kind !== 'artifact')
      throw new Error('expected artifact');
    expect(artifact.scenarios[0]?.name).toBe('Checkout');
    expect(artifact.scenarios[0]?.nodes.map((node) => node.kind).sort()).toEqual(['end', 'start']);
    expect(artifact.scenarios[0]?.edges).toEqual([]);
  });

  it('seeds brand-new scenarios with Start and End and no wire', () => {
    const scenario = emptyFlowScenario();
    expect(scenario.nodes.map((node) => node.kind).sort()).toEqual(['end', 'start']);
    expect(scenario.edges).toEqual([]);
    const ensured = ensureFlowScenarioTerminals({ ...scenario, nodes: [], edges: [] });
    expect(ensured.nodes.map((node) => node.kind).sort()).toEqual(['end', 'start']);
    expect(ensured.edges).toEqual([]);
  });
});

describe('flow run plan', () => {
  it('fans out a split and blocks the join until both branches settle', () => {
    const scenario = {
      nodes: [
        { ...emptyFlowGraphNode('browser-open'), id: 'open' },
        { ...emptyFlowGraphNode('browser-click'), id: 'click1' },
        { ...emptyFlowGraphNode('browser-click'), id: 'click2' },
        { ...emptyFlowGraphNode('join'), id: 'join' },
      ],
      edges: [
        { id: 'e1', from: 'open', fromPort: 'next' as const, to: 'click1' },
        { id: 'e2', from: 'open', fromPort: 'next' as const, to: 'click2' },
        { id: 'e3', from: 'click1', fromPort: 'next' as const, to: 'join' },
        { id: 'e4', from: 'click2', fromPort: 'next' as const, to: 'join' },
      ],
    };
    const plan = buildFlowRunPlan(scenario);
    expect(plan.roots).toEqual(['open']);
    expect(plan.steps.filter((step) => step.wave === 1).map((step) => step.nodeId)).toEqual(['click1', 'click2']);
    expect(plan.steps.find((step) => step.nodeId === 'join')?.wave).toBe(2);
    expect(plan.blocked).toEqual([]);
  });

  it('reports nodes trapped in a cycle instead of scheduling them', () => {
    const scenario = {
      nodes: [
        { ...emptyFlowGraphNode('wait'), id: 'a' },
        { ...emptyFlowGraphNode('wait'), id: 'b' },
      ],
      edges: [
        { id: 'e1', from: 'a', fromPort: 'next' as const, to: 'b' },
        { id: 'e2', from: 'b', fromPort: 'next' as const, to: 'a' },
      ],
    };
    const plan = buildFlowRunPlan(scenario);
    expect(plan.roots).toEqual([]);
    expect(plan.blocked.sort()).toEqual(['a', 'b']);
  });

  it('skips disabled nodes so their followers still run', () => {
    const scenario = {
      nodes: [
        { ...emptyFlowGraphNode('wait'), id: 'a' },
        { ...emptyFlowGraphNode('wait'), id: 'b', enabled: false },
        { ...emptyFlowGraphNode('wait'), id: 'c' },
      ],
      edges: [
        { id: 'e1', from: 'a', fromPort: 'next' as const, to: 'b' },
        { id: 'e2', from: 'b', fromPort: 'next' as const, to: 'c' },
      ],
    };
    const plan = buildFlowRunPlan(scenario);
    expect(plan.steps.map((step) => step.nodeId).sort()).toEqual(['a', 'c']);
  });
});

describe('load metrics', () => {
  it('aggregates percentiles and rps', () => {
    expect(percentile([10, 20, 30, 40, 50], 50)).toBe(30);
    const stats = aggregateLoadSamples([10, 20, 30, 40, 50], 1, 1000);
    expect(stats.requests).toBe(5);
    expect(stats.errors).toBe(1);
    expect(stats.rps).toBe(5);
    expect(stats.p95Ms).toBeGreaterThanOrEqual(stats.p50Ms);
  });
});

describe('intercept match', () => {
  it('treats star as match-all', () => {
    expect(interceptRuleMatches('*', 'http://127.0.0.1/x')).toBe(true);
    expect(interceptRuleMatches('http://127.0.0.1/', 'http://127.0.0.1/x')).toBe(true);
    expect(interceptRuleMatches('https://example.com', 'http://127.0.0.1/x')).toBe(false);
  });
});
