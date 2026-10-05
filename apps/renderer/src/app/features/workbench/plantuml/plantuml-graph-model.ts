import {
  nextPlantumlId,
  type ClassModel,
  type ClassRelation,
  type ComponentModel,
  type StateModel,
  type UseCaseModel,
} from './plantuml-generator';

export const CLASS_KINDS: readonly ClassRelation['kind'][] = [
  'association',
  'extends',
  'implements',
  'composition',
  'aggregation',
];

export type GraphModel = ClassModel | UseCaseModel | ComponentModel | StateModel;

export type NodeShape = 'class' | 'actor' | 'usecase' | 'component' | 'state';

export interface GraphBox {
  readonly id: string;
  readonly name: string;
  readonly stereotype: string;
  readonly members: readonly string[];
  readonly fields: readonly string[];
  readonly operations: readonly string[];
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly shape: NodeShape;
}

export interface GraphWire {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly dashed: boolean;
  readonly angle: number;
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
  readonly endMark: 'arrow' | 'triangle' | 'none';
  readonly startMark: 'diamond' | 'diamond-open' | 'none';
}

export interface NodeNudge {
  readonly dx: number;
  readonly dy: number;
  readonly origins: Readonly<Record<string, { readonly x: number; readonly y: number }>>;
}

export function layoutBoxes(model: GraphModel, live: NodeNudge | null): GraphBox[] {
  const raw = rawNodes(model);
  return raw.map((node, index) => {
    const origin = live?.origins[node.id];
    const spot = origin
      ? { x: origin.x + (live?.dx ?? 0), y: origin.y + (live?.dy ?? 0) }
      : place(index, node.x, node.y);
    const members = node.members.split('\n').map((line) => line.trim()).filter((line) => line.length > 0).slice(0, 12);
    const fields = members.filter((line) => !line.includes('('));
    const operations = members.filter((line) => line.includes('('));
    const size = node.shape === 'class'
      ? classCardSize(node.name, node.stereotype, fields, operations)
      : boxSize(node.shape);
    return { ...node, members, fields, operations, ...spot, ...size };
  });
}

export function rawNodes(model: GraphModel): Array<{
  id: string;
  name: string;
  stereotype: string;
  members: string;
  x?: number;
  y?: number;
  shape: NodeShape;
}> {
  if (model.kind === 'class') {
    return model.classes.map((item) => ({
      id: item.id,
      name: item.name,
      stereotype: item.stereotype,
      members: item.members,
      x: item.x,
      y: item.y,
      shape: 'class',
    }));
  }
  if (model.kind === 'usecase') {
    return [
      ...model.actors.map((item) => ({
        id: item.id,
        name: item.name,
        stereotype: '',
        members: '',
        x: item.x,
        y: item.y,
        shape: 'actor' as const,
      })),
      ...model.useCases.map((item) => ({
        id: item.id,
        name: item.name,
        stereotype: '',
        members: '',
        x: item.x,
        y: item.y,
        shape: 'usecase' as const,
      })),
    ];
  }
  if (model.kind === 'component') {
    return model.components.map((item) => ({
      id: item.id,
      name: item.name,
      stereotype: item.stereotype,
      members: '',
      x: item.x,
      y: item.y,
      shape: 'component' as const,
    }));
  }
  return model.states.map((item) => ({
    id: item.id,
    name: item.name,
    stereotype: '',
    members: '',
    x: item.x,
    y: item.y,
    shape: 'state' as const,
  }));
}

export function place(index: number, x?: number, y?: number): { x: number; y: number } {
  if (typeof x === 'number' && typeof y === 'number')
    return { x, y };
  const col = index % 3;
  const row = Math.floor(index / 3);
  return { x: 48 + col * 280, y: 72 + row * 200 };
}

export function classCardSize(
  name: string,
  stereotype: string,
  fields: readonly string[],
  operations: readonly string[],
): { width: number; height: number } {
  const head = Math.max(name.length * 8.4, stereotype ? (stereotype.length + 2) * 7 : 0);
  const body = Math.max(0, ...[...fields, ...operations].map((line) => line.length * 7.2));
  const width = Math.max(148, Math.min(420, Math.ceil(Math.max(head, body) + 36)));
  const header = 34 + (stereotype ? 16 : 0);
  const compartment = (count: number) => count === 0 ? 0 : 15 + count * 18;
  const height = 2 + header + compartment(fields.length) + compartment(operations.length);
  return { width, height };
}

export function boxSize(shape: NodeShape): { width: number; height: number } {
  if (shape === 'class')
    return { width: 160, height: 36 };
  if (shape === 'actor')
    return { width: 96, height: 108 };
  if (shape === 'usecase')
    return { width: 168, height: 68 };
  if (shape === 'component')
    return { width: 180, height: 72 };
  return { width: 150, height: 56 };
}

export function relationLine(
  start: { x: number; y: number },
  end: { x: number; y: number },
  kind: string,
): Omit<GraphWire, 'id' | 'label' | 'kind'> {
  const style = relationStyle(kind);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  return {
    x1: start.x + ux * style.startPad,
    y1: start.y + uy * style.startPad,
    x2: end.x - ux * style.endPad,
    y2: end.y - uy * style.endPad,
    dashed: style.dashed,
    angle: Math.atan2(dy, dx) * 180 / Math.PI,
    startX: start.x,
    startY: start.y,
    endX: end.x,
    endY: end.y,
    endMark: style.endMark,
    startMark: style.startMark,
  };
}

export function relationStyle(kind: string): {
  dashed: boolean;
  startPad: number;
  endPad: number;
  endMark: GraphWire['endMark'];
  startMark: GraphWire['startMark'];
} {
  if (kind === 'extends')
    return { dashed: false, startPad: 0, endPad: 14, endMark: 'triangle', startMark: 'none' };
  if (kind === 'implements')
    return { dashed: true, startPad: 0, endPad: 14, endMark: 'triangle', startMark: 'none' };
  if (kind === 'composition')
    return { dashed: false, startPad: 18, endPad: 0, endMark: 'none', startMark: 'diamond' };
  if (kind === 'aggregation')
    return { dashed: false, startPad: 18, endPad: 0, endMark: 'none', startMark: 'diamond-open' };
  if (kind === 'include' || kind === 'extend')
    return { dashed: true, startPad: 0, endPad: 10, endMark: 'arrow', startMark: 'none' };
  return { dashed: false, startPad: 0, endPad: 10, endMark: 'arrow', startMark: 'none' };
}

export function layoutWires(model: GraphModel, boxes: readonly GraphBox[]): GraphWire[] {
  const edges = model.kind === 'class'
    ? model.relations.map((item) => ({ id: item.id, from: item.from, to: item.to, label: item.label, kind: item.kind }))
    : model.kind === 'usecase'
      ? model.links.map((item) => ({ id: item.id, from: item.from, to: item.to, label: item.kind === 'assoc' ? '' : item.kind, kind: item.kind }))
      : model.kind === 'component'
        ? model.links.map((item) => ({ id: item.id, from: item.from, to: item.to, label: item.label, kind: '' }))
        : model.transitions.map((item) => ({ id: item.id, from: item.from, to: item.to, label: item.label, kind: '' }));
  const wires: GraphWire[] = [];
  for (const edge of edges) {
    const from = boxes.find((box) => box.id === edge.from || box.name === edge.from);
    const to = boxes.find((box) => box.id === edge.to || box.name === edge.to);
    if (!from || !to)
      continue;
    const start = borderPoint(centerOf(from), centerOf(to), from);
    const end = borderPoint(centerOf(to), centerOf(from), to);
    wires.push({ id: edge.id, label: edge.label, kind: edge.kind, ...relationLine(start, end, edge.kind) });
  }
  return wires;
}

export function centerOf(box: GraphBox): { x: number; y: number } {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export function borderPoint(
  from: { x: number; y: number },
  to: { x: number; y: number },
  box: GraphBox,
): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0)
    return from;
  if (box.shape === 'usecase') {
    const halfW = box.width / 2;
    const halfH = box.height / 2;
    const norm = Math.hypot(dx / halfW, dy / halfH) || 1;
    return { x: from.x + dx / norm, y: from.y + dy / norm };
  }
  const halfW = box.width / 2;
  const halfH = box.height / 2;
  const scale = Math.min(halfW / Math.abs(dx || 0.0001), halfH / Math.abs(dy || 0.0001));
  return { x: from.x + dx * scale, y: from.y + dy * scale };
}

export function hitBox(boxes: readonly GraphBox[], x: number, y: number): GraphBox | undefined {
  return [...boxes].reverse().find((box) =>
    x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height,
  );
}

export function moveNode(model: GraphModel, id: string, x: number, y: number): GraphModel {
  const nextX = Math.round(x);
  const nextY = Math.round(y);
  if (model.kind === 'class')
    return { ...model, classes: model.classes.map((item) => item.id === id ? { ...item, x: nextX, y: nextY } : item) };
  if (model.kind === 'usecase') {
    return {
      ...model,
      actors: model.actors.map((item) => item.id === id ? { ...item, x: nextX, y: nextY } : item),
      useCases: model.useCases.map((item) => item.id === id ? { ...item, x: nextX, y: nextY } : item),
    };
  }
  if (model.kind === 'component')
    return { ...model, components: model.components.map((item) => item.id === id ? { ...item, x: nextX, y: nextY } : item) };
  return { ...model, states: model.states.map((item) => item.id === id ? { ...item, x: nextX, y: nextY } : item) };
}

export function renameNode(model: GraphModel, id: string, name: string): GraphModel {
  if (model.kind === 'class') {
    const previous = model.classes.find((item) => item.id === id)?.name;
    return {
      ...model,
      classes: model.classes.map((item) => item.id === id ? { ...item, name } : item),
      relations: model.relations.map((item) => ({
        ...item,
        from: item.from === previous ? name : item.from,
        to: item.to === previous ? name : item.to,
      })),
    };
  }
  if (model.kind === 'usecase') {
    return {
      ...model,
      actors: model.actors.map((item) => item.id === id ? { ...item, name } : item),
      useCases: model.useCases.map((item) => item.id === id ? { ...item, name } : item),
    };
  }
  if (model.kind === 'component')
    return { ...model, components: model.components.map((item) => item.id === id ? { ...item, name } : item) };
  return { ...model, states: model.states.map((item) => item.id === id ? { ...item, name } : item) };
}

export function patchNode(
  model: GraphModel,
  id: string,
  patch: { stereotype?: string; members?: string },
): GraphModel {
  if (model.kind === 'class') {
    return {
      ...model,
      classes: model.classes.map((item) => item.id === id ? { ...item, ...patch } : item),
    };
  }
  if (model.kind === 'component' && patch.stereotype !== undefined) {
    return {
      ...model,
      components: model.components.map((item) => item.id === id ? { ...item, stereotype: patch.stereotype ?? '' } : item),
    };
  }
  return model;
}

export function membersOf(model: GraphModel, id: string): string {
  if (model.kind !== 'class')
    return '';
  return model.classes.find((item) => item.id === id)?.members ?? '';
}

export function removeNode(model: GraphModel, id: string): GraphModel {
  if (model.kind === 'class') {
    const name = model.classes.find((item) => item.id === id)?.name;
    return {
      ...model,
      classes: model.classes.filter((item) => item.id !== id),
      relations: model.relations.filter((item) => item.from !== name && item.to !== name),
    };
  }
  if (model.kind === 'usecase') {
    return {
      ...model,
      actors: model.actors.filter((item) => item.id !== id),
      useCases: model.useCases.filter((item) => item.id !== id),
      links: model.links.filter((item) => item.from !== id && item.to !== id),
    };
  }
  if (model.kind === 'component') {
    return {
      ...model,
      components: model.components.filter((item) => item.id !== id),
      links: model.links.filter((item) => item.from !== id && item.to !== id),
    };
  }
  return {
    ...model,
    states: model.states.filter((item) => item.id !== id),
    transitions: model.transitions.filter((item) => item.from !== id && item.to !== id),
  };
}

export function addNode(model: GraphModel, role: 'node' | 'actor' | 'usecase', name: string, x: number, y: number): GraphModel {
  const spot = { x: Math.round(x), y: Math.round(y) };
  if (model.kind === 'class') {
    return {
      ...model,
      classes: [...model.classes, { id: nextPlantumlId('c'), name, stereotype: '', members: '', ...spot }],
    };
  }
  if (model.kind === 'usecase') {
    if (role === 'usecase') {
      return {
        ...model,
        useCases: [...model.useCases, { id: nextPlantumlId('uc'), name, ...spot }],
      };
    }
    return {
      ...model,
      actors: [...model.actors, { id: nextPlantumlId('actor'), name, ...spot }],
    };
  }
  if (model.kind === 'component') {
    return {
      ...model,
      components: [...model.components, { id: nextPlantumlId('cmp'), name, stereotype: '', ...spot }],
    };
  }
  return {
    ...model,
    states: [...model.states, { id: nextPlantumlId('st'), name, ...spot }],
  };
}

export function addEdge(model: GraphModel, fromId: string, toId: string, label: string, kind: string): GraphModel {
  if (model.kind === 'class') {
    const from = model.classes.find((item) => item.id === fromId)?.name ?? fromId;
    const to = model.classes.find((item) => item.id === toId)?.name ?? toId;
    const relation: ClassRelation = {
      id: nextPlantumlId('r'),
      from,
      to,
      kind: isClassKind(kind) ? kind : 'association',
      label,
    };
    return { ...model, relations: [...model.relations, relation] };
  }
  if (model.kind === 'usecase') {
    const linkKind = kind === 'include' || kind === 'extend' ? kind : 'assoc';
    return {
      ...model,
      links: [...model.links, { id: nextPlantumlId('l'), from: fromId, to: toId, kind: linkKind }],
    };
  }
  if (model.kind === 'component') {
    return {
      ...model,
      links: [...model.links, { id: nextPlantumlId('l'), from: fromId, to: toId, label }],
    };
  }
  return {
    ...model,
    transitions: [...model.transitions, { id: nextPlantumlId('t'), from: fromId, to: toId, label }],
  };
}

export function edgeOf(model: GraphModel, id: string): { label: string; kind: string } | null {
  if (model.kind === 'class') {
    const edge = model.relations.find((item) => item.id === id);
    return edge ? { label: edge.label, kind: edge.kind } : null;
  }
  if (model.kind === 'usecase') {
    const edge = model.links.find((item) => item.id === id);
    return edge ? { label: edge.kind === 'assoc' ? '' : edge.kind, kind: edge.kind } : null;
  }
  if (model.kind === 'component') {
    const edge = model.links.find((item) => item.id === id);
    return edge ? { label: edge.label, kind: '' } : null;
  }
  const edge = model.transitions.find((item) => item.id === id);
  return edge ? { label: edge.label, kind: '' } : null;
}

export function patchEdge(model: GraphModel, id: string, patch: { label?: string; kind?: string }): GraphModel {
  if (model.kind === 'class') {
    return {
      ...model,
      relations: model.relations.map((item) => {
        if (item.id !== id)
          return item;
        return {
          ...item,
          label: patch.label ?? item.label,
          kind: patch.kind && isClassKind(patch.kind) ? patch.kind : item.kind,
        };
      }),
    };
  }
  if (model.kind === 'usecase') {
    return {
      ...model,
      links: model.links.map((item) => {
        if (item.id !== id)
          return item;
        const kind = patch.kind === 'include' || patch.kind === 'extend' || patch.kind === 'assoc'
          ? patch.kind
          : item.kind;
        return { ...item, kind };
      }),
    };
  }
  if (model.kind === 'component') {
    return {
      ...model,
      links: model.links.map((item) => item.id === id ? { ...item, label: patch.label ?? item.label } : item),
    };
  }
  return {
    ...model,
    transitions: model.transitions.map((item) => item.id === id ? { ...item, label: patch.label ?? item.label } : item),
  };
}

export function removeEdge(model: GraphModel, id: string): GraphModel {
  if (model.kind === 'class')
    return { ...model, relations: model.relations.filter((item) => item.id !== id) };
  if (model.kind === 'usecase')
    return { ...model, links: model.links.filter((item) => item.id !== id) };
  if (model.kind === 'component')
    return { ...model, links: model.links.filter((item) => item.id !== id) };
  return { ...model, transitions: model.transitions.filter((item) => item.id !== id) };
}

export function isClassKind(kind: string): kind is ClassRelation['kind'] {
  return CLASS_KINDS.includes(kind as ClassRelation['kind']);
}
