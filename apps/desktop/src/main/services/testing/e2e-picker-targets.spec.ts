import { describe, expect, it } from 'vitest';
import {
  emptyFlowGraphNode,
  emptyFlowScenario,
  ensureFlowScenarioTerminals,
} from '@testrix/contracts';

import {
  browserPickPrefixKind,
  browserPickPrefixNeedsSelector,
  BUILD_SHORT_CSS_SELECTOR_FN,
  pickHintForKind,
  prefixNodeIdsBefore,
  SNAP_ELEMENT_TO_PICK_KIND_FN,
} from './e2e-picker-targets';

describe('pickHintForKind', () => {
  it('returns action-specific hints', () => {
    expect(pickHintForKind('browser-click')).toContain('button');
    expect(pickHintForKind('browser-type')).toContain('input');
    expect(pickHintForKind('browser-select')).toContain('select');
    expect(pickHintForKind('assert-text')).toContain('CSS selector');
  });
});

describe('browserPickPrefixKind', () => {
  it('replays browser steps and skips API nodes that sit between them', () => {
    expect(browserPickPrefixKind('browser-open')).toBe(true);
    expect(browserPickPrefixKind('browser-click')).toBe(true);
    expect(browserPickPrefixKind('set-var')).toBe(true);
    expect(browserPickPrefixKind('wait')).toBe(true);
    expect(
      ['request', 'capture', 'database', 'assert-status', 'device-tap'].map(browserPickPrefixKind),
    ).toEqual([false, false, false, false, false]);
  });

  it('skips selector steps that are still empty', () => {
    expect(browserPickPrefixNeedsSelector('browser-click')).toBe(true);
    expect(browserPickPrefixNeedsSelector('browser-open')).toBe(false);
    expect(browserPickPrefixNeedsSelector('browser-press')).toBe(false);
  });
});

describe('prefixNodeIdsBefore', () => {
  it('returns nodes ordered before the stop node', () => {
    let scenario = emptyFlowScenario('Pick');
    scenario = ensureFlowScenarioTerminals(scenario);
    const start = scenario.nodes.find((node) => node.kind === 'start')!;
    const end = scenario.nodes.find((node) => node.kind === 'end')!;
    const open = { ...emptyFlowGraphNode('browser-open'), id: 'open1', name: 'Open' };
    const click = { ...emptyFlowGraphNode('browser-click'), id: 'click1', name: 'Click' };
    scenario = {
      ...scenario,
      nodes: [...scenario.nodes, open, click],
      edges: [
        { id: 'e1', from: start.id, fromPort: 'next', to: open.id },
        { id: 'e2', from: open.id, fromPort: 'next', to: click.id },
        { id: 'e3', from: click.id, fromPort: 'next', to: end.id },
      ],
    };

    expect(prefixNodeIdsBefore(scenario, 'click1')).toEqual(['open1']);
    expect(prefixNodeIdsBefore(scenario, 'open1')).toEqual([]);
  });

  it('returns null when the stop node is unreachable', () => {
    let scenario = emptyFlowScenario('Pick');
    scenario = ensureFlowScenarioTerminals(scenario);
    const orphan = { ...emptyFlowGraphNode('browser-click'), id: 'orphan', name: 'Orphan' };
    scenario = { ...scenario, nodes: [...scenario.nodes, orphan] };
    expect(prefixNodeIdsBefore(scenario, 'orphan')).toBeNull();
  });

  it('skips start/end terminals in the prefix list', () => {
    let scenario = emptyFlowScenario('Pick');
    scenario = ensureFlowScenarioTerminals(scenario);
    const start = scenario.nodes.find((node) => node.kind === 'start')!;
    const end = scenario.nodes.find((node) => node.kind === 'end')!;
    const open = { ...emptyFlowGraphNode('browser-open'), id: 'open1', name: 'Open' };
    const type = { ...emptyFlowGraphNode('browser-type'), id: 'type1', name: 'Type' };
    scenario = {
      ...scenario,
      nodes: [...scenario.nodes, open, type],
      edges: [
        { id: 'e1', from: start.id, fromPort: 'next', to: open.id },
        { id: 'e2', from: open.id, fromPort: 'next', to: type.id },
        { id: 'e3', from: type.id, fromPort: 'next', to: end.id },
      ],
    };
    const prefix = prefixNodeIdsBefore(scenario, 'type1');
    expect(prefix).toEqual(['open1']);
    expect(prefix?.some((id) => id === start.id || id === end.id)).toBe(false);
  });

  it('excludes orphan branches that are not ancestors of the stop node', () => {
    let scenario = emptyFlowScenario('Pick');
    scenario = ensureFlowScenarioTerminals(scenario);
    const start = scenario.nodes.find((node) => node.kind === 'start')!;
    const end = scenario.nodes.find((node) => node.kind === 'end')!;
    const launch = { ...emptyFlowGraphNode('device-launch'), id: 'launch', name: 'Launch' };
    const email = { ...emptyFlowGraphNode('device-type'), id: 'email', name: 'Email' };
    const password = { ...emptyFlowGraphNode('device-type'), id: 'password', name: 'Password' };
    const tap = { ...emptyFlowGraphNode('device-tap'), id: 'tap', name: 'Tap' };
    scenario = {
      ...scenario,
      nodes: [...scenario.nodes, launch, email, password, tap],
      edges: [
        { id: 'e1', from: start.id, fromPort: 'next', to: launch.id },
        { id: 'e2', from: launch.id, fromPort: 'next', to: email.id },
        { id: 'e3', from: email.id, fromPort: 'next', to: tap.id },
        { id: 'e4', from: tap.id, fromPort: 'next', to: end.id },
        // Orphan branch — not on the Start → tap path
        { id: 'e5', from: password.id, fromPort: 'next', to: end.id },
      ],
    };
    expect(prefixNodeIdsBefore(scenario, 'tap')).toEqual(['launch', 'email']);
  });
});

describe('injected picker helpers', () => {
  it('exports snap and short-selector function sources', () => {
    expect(SNAP_ELEMENT_TO_PICK_KIND_FN).toContain('browser-click');
    expect(SNAP_ELEMENT_TO_PICK_KIND_FN).toContain('matchesType');
    expect(SNAP_ELEMENT_TO_PICK_KIND_FN).toContain('parentOrHost');
    expect(SNAP_ELEMENT_TO_PICK_KIND_FN).toContain('hasPointerCursor');
    expect(BUILD_SHORT_CSS_SELECTOR_FN).toContain('data-testid');
    expect(BUILD_SHORT_CSS_SELECTOR_FN).toContain('parts.length > 4');
  });
});
