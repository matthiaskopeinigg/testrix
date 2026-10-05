import { describe, expect, it } from 'vitest';

import { captureFlowTemplate, FLOW_GRAPH_TEMPLATES, graphFromFlowTemplate, insertFlowTemplate } from './flow-templates';

describe('flow templates', () => {
  it('inserts remapped nodes and edges at an origin', () => {
    const template = FLOW_GRAPH_TEMPLATES.find((item) => item.id === 'http-assert');
    expect(template).toBeTruthy();
    const result = insertFlowTemplate({ nodes: [], edges: [] }, template!, { x: 100, y: 200 });
    expect(result.ids).toHaveLength(2);
    expect(result.graph.nodes.some((node) => node.kind === 'start')).toBe(true);
    expect(result.graph.nodes.some((node) => node.kind === 'end')).toBe(true);
    expect(result.graph.nodes).toHaveLength(4);
    const req = result.graph.nodes.find((node) => node.id === result.ids[0]!);
    const ok = result.graph.nodes.find((node) => node.id === result.ids[1]!);
    expect(req?.x).toBe(100);
    expect(req?.y).toBe(200);
    expect(result.graph.edges.some((edge) => edge.from === req?.id && edge.to === ok?.id)).toBe(true);
    expect(result.graph.edges.some((edge) => edge.to === req?.id && result.graph.nodes.find((n) => n.id === edge.from)?.kind === 'start')).toBe(false);
    expect(result.graph.edges.some((edge) => edge.from === ok?.id && result.graph.nodes.find((n) => n.id === edge.to)?.kind === 'end')).toBe(false);
  });

  it('does not auto-wire Start or End when hydrating a template', () => {
    const graph = graphFromFlowTemplate(FLOW_GRAPH_TEMPLATES[0]!);
    const start = graph.nodes.find((node) => node.kind === 'start');
    const end = graph.nodes.find((node) => node.kind === 'end');
    expect(start).toBeTruthy();
    expect(end).toBeTruthy();
    expect(graph.edges.some((edge) => edge.from === start!.id || edge.to === end!.id)).toBe(false);
  });

  it('captures absolute canvas positions so reopen keeps layout', () => {
    const seeded = insertFlowTemplate({ nodes: [], edges: [] }, FLOW_GRAPH_TEMPLATES[0]!, { x: 40, y: 80 });
    const ids = seeded.ids;
    const captured = captureFlowTemplate(seeded.graph, ids, { name: 'Mine', tags: ['smoke'] });
    expect(captured).toBeTruthy();
    expect(captured!.name).toBe('Mine');
    expect(captured!.tags).toEqual(['smoke']);
    expect(captured!.steps[0]?.x).toBe(40);
    expect(captured!.steps[0]?.y).toBe(80);
    expect(captured!.links.length).toBeGreaterThan(0);

    const reopened = graphFromFlowTemplate(captured!);
    const first = reopened.nodes.find((node) => node.kind === captured!.steps[0]!.kind);
    expect(first?.x).toBe(40);
    expect(first?.y).toBe(80);
  });

  it('rebases absolute steps when inserting at a drop point', () => {
    const captured = captureFlowTemplate(
      {
        nodes: [
          { id: 'a', kind: 'request', name: 'A', x: 400, y: 300, parentId: null, enabled: true, config: {} },
          { id: 'b', kind: 'assert-status', name: 'B', x: 680, y: 300, parentId: null, enabled: true, config: {} },
        ],
        edges: [{ id: 'e1', from: 'a', to: 'b', fromPort: 'next' }],
      },
      ['a', 'b'],
    )!;
    const dropped = insertFlowTemplate({ nodes: [], edges: [] }, captured, { x: 100, y: 50 });
    const a = dropped.graph.nodes.find((node) => node.id === dropped.ids[0]!);
    const b = dropped.graph.nodes.find((node) => node.id === dropped.ids[1]!);
    expect(a?.x).toBe(100);
    expect(a?.y).toBe(50);
    expect(b?.x).toBe(380);
    expect(b?.y).toBe(50);
  });

  it('refuses terminals-only selection', () => {
    const seeded = insertFlowTemplate({ nodes: [], edges: [] }, FLOW_GRAPH_TEMPLATES[0]!, { x: 0, y: 0 });
    const terminals = seeded.graph.nodes
      .filter((node) => node.kind === 'start' || node.kind === 'end')
      .map((node) => node.id);
    expect(captureFlowTemplate(seeded.graph, terminals)).toBeNull();
  });

  it('round-trips Start/End positions and wires when they are captured', () => {
    const graph = {
      nodes: [
        { id: 's', kind: 'start' as const, name: 'Start', x: 12, y: 44, parentId: null, enabled: true, config: {} },
        { id: 'a', kind: 'request' as const, name: 'A', x: 220, y: 80, parentId: null, enabled: true, config: {} },
        { id: 'e', kind: 'end' as const, name: 'End', x: 520, y: 40, parentId: null, enabled: true, config: {} },
      ],
      edges: [
        { id: 'e1', from: 's', to: 'a', fromPort: 'next' as const },
        { id: 'e2', from: 'a', to: 'e', fromPort: 'next' as const },
      ],
    };
    const captured = captureFlowTemplate(graph, ['s', 'a', 'e'], { name: 'Wired' })!;
    expect(captured.steps.some((step) => step.key === 'start' && step.x === 12 && step.y === 44)).toBe(true);
    expect(captured.steps.some((step) => step.key === 'end' && step.x === 520 && step.y === 40)).toBe(true);
    expect(captured.links).toEqual([
      { from: 'start', to: 'n1' },
      { from: 'n1', to: 'end' },
    ]);

    const reopened = graphFromFlowTemplate(captured);
    const start = reopened.nodes.find((node) => node.kind === 'start')!;
    const end = reopened.nodes.find((node) => node.kind === 'end')!;
    const mid = reopened.nodes.find((node) => node.kind === 'request')!;
    expect(start.x).toBe(12);
    expect(start.y).toBe(44);
    expect(end.x).toBe(520);
    expect(end.y).toBe(40);
    expect(mid.x).toBe(220);
    expect(reopened.edges.some((edge) => edge.from === start.id && edge.to === mid.id)).toBe(true);
    expect(reopened.edges.some((edge) => edge.from === mid.id && edge.to === end.id)).toBe(true);
  });

  it('skips Start/End when inserting into a host that already has terminals', () => {
    const host = graphFromFlowTemplate(FLOW_GRAPH_TEMPLATES[0]!);
    const captured = captureFlowTemplate(
      {
        nodes: [
          { id: 's', kind: 'start', name: 'Start', x: 0, y: 0, parentId: null, enabled: true, config: {} },
          { id: 'a', kind: 'request', name: 'A', x: 100, y: 0, parentId: null, enabled: true, config: {} },
          { id: 'e', kind: 'end', name: 'End', x: 200, y: 0, parentId: null, enabled: true, config: {} },
        ],
        edges: [
          { id: 'e1', from: 's', to: 'a', fromPort: 'next' },
          { id: 'e2', from: 'a', to: 'e', fromPort: 'next' },
        ],
      },
      ['s', 'a', 'e'],
    )!;
    const before = host.nodes.filter((node) => node.kind === 'start' || node.kind === 'end').length;
    const result = insertFlowTemplate(host, captured, { x: 50, y: 50 });
    const after = result.graph.nodes.filter((node) => node.kind === 'start' || node.kind === 'end').length;
    expect(after).toBe(before);
    expect(result.ids).toHaveLength(1);
  });
});
