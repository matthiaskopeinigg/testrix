import type { DatabaseCatalogForeignKey, DatabaseCatalogTable } from '@testrix/contracts';

import { catalogTableKey } from './database-nav';

export interface ErdLayoutNode {
  readonly id: string;
  readonly name: string;
  readonly schema: string;
  readonly table: string;
  readonly kind: 'table' | 'view';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly pkColumns: readonly string[];
  readonly fkColumns: readonly string[];
}

export interface ErdLayoutEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly path: string;
}

export interface ErdLayout {
  readonly nodes: readonly ErdLayoutNode[];
  readonly edges: readonly ErdLayoutEdge[];
  readonly width: number;
  readonly height: number;
}

const NODE_WIDTH = 200;
const HEADER = 28;
const ROW = 16;
const GAP_X = 64;
const GAP_Y = 80;
const PAD = 40;
const COMPONENT_GAP = 88;
const WRAP_WIDTH = 1120;
const EDGE_PULL = 40;

interface ErdPort {
  readonly x: number;
  readonly y: number;
  readonly dx: number;
  readonly dy: number;
}

interface ErdSizedNode {
  readonly id: string;
  readonly name: string;
  readonly schema: string;
  readonly table: string;
  readonly kind: 'table' | 'view';
  readonly width: number;
  readonly height: number;
  readonly pkColumns: readonly string[];
  readonly fkColumns: readonly string[];
}

export function erdEdgePath(
  from: Pick<ErdLayoutNode, 'x' | 'y' | 'width' | 'height'>,
  to: Pick<ErdLayoutNode, 'x' | 'y' | 'width' | 'height'>,
): string {
  const start = closestPort(from, nodeCenter(to));
  const end = closestPort(to, nodeCenter(from));
  const x1 = start.x + start.dx * EDGE_PULL;
  const y1 = start.y + start.dy * EDGE_PULL;
  const x2 = end.x + end.dx * EDGE_PULL;
  const y2 = end.y + end.dy * EDGE_PULL;
  return `M ${start.x} ${start.y} C ${x1} ${y1}, ${x2} ${y2}, ${end.x} ${end.y}`;
}

export function applyErdPositions(
  layout: ErdLayout,
  positions: Readonly<Record<string, { readonly x: number; readonly y: number }>>,
): ErdLayout {
  const nodes = layout.nodes.map((node) => {
    const pos = positions[node.id];
    return pos ? { ...node, x: pos.x, y: pos.y } : node;
  });
  const placed = new Map(nodes.map((node) => [node.id, node]));
  const edges = layout.edges.map((edge) => {
    const from = placed.get(edge.from);
    const to = placed.get(edge.to);
    return { ...edge, path: from && to ? erdEdgePath(from, to) : '' };
  });
  let width = layout.width;
  let height = layout.height;
  for (const node of nodes) {
    width = Math.max(width, node.x + node.width + PAD);
    height = Math.max(height, node.y + node.height + PAD);
  }
  return { nodes, edges, width, height };
}

export function layoutErd(options: {
  readonly schema: string;
  readonly tables: readonly DatabaseCatalogTable[];
  readonly foreignKeys: readonly DatabaseCatalogForeignKey[];
  readonly pkByTable?: Readonly<Record<string, readonly string[]>>;
}): ErdLayout {
  const tables = options.tables.filter((item) => item.name);
  const nodesById = new Map<string, { table: DatabaseCatalogTable; fkColumns: string[] }>();
  for (const table of tables) {
    nodesById.set(catalogTableKey(table.schema || options.schema, table.name), {
      table,
      fkColumns: [],
    });
  }
  const edgesRaw: { from: string; to: string; label: string }[] = [];
  for (const fk of options.foreignKeys) {
    const fromTable = fk.table;
    const toTable = fk.referencedTable;
    if (!fromTable || !toTable)
      continue;
    const fromSchema = options.schema;
    const toSchema = fk.referencedSchema || options.schema;
    const fromId = catalogTableKey(fromSchema, fromTable);
    const toId = catalogTableKey(toSchema, toTable);
    if (!nodesById.has(fromId))
      continue;
    if (!nodesById.has(toId)) {
      nodesById.set(toId, {
        table: { name: toTable, schema: toSchema, kind: 'table' },
        fkColumns: [],
      });
    }
    const source = nodesById.get(fromId);
    if (source) {
      for (const column of fk.columns ?? []) {
        if (column && !source.fkColumns.includes(column))
          source.fkColumns.push(column);
      }
    }
    edgesRaw.push({
      from: fromId,
      to: toId,
      label: [fk.columns?.join(', '), toTable].filter(Boolean).join(' → '),
    });
  }
  const sized = new Map<string, ErdSizedNode>();
  for (const [id, entry] of nodesById) {
    const pkColumns = options.pkByTable?.[id] ?? [];
    const ticks = [...new Set([...pkColumns, ...entry.fkColumns])];
    sized.set(id, {
      id,
      name: entry.table.name,
      schema: entry.table.schema || options.schema,
      table: entry.table.name,
      kind: entry.table.kind,
      width: NODE_WIDTH,
      height: HEADER + Math.max(1, ticks.length) * ROW + 8,
      pkColumns,
      fkColumns: entry.fkColumns,
    });
  }
  const neighbors = new Map<string, string[]>();
  for (const id of nodesById.keys())
    neighbors.set(id, []);
  for (const edge of edgesRaw) {
    if (edge.from === edge.to)
      continue;
    neighbors.get(edge.from)?.push(edge.to);
    neighbors.get(edge.to)?.push(edge.from);
  }
  const groups = connectedGroups([...nodesById.keys()], neighbors);
  const nodes: ErdLayoutNode[] = [];
  const placed = new Map<string, ErdLayoutNode>();
  let cursorX = PAD;
  let cursorY = PAD;
  let rowHeight = 0;
  let maxX = PAD;
  let maxY = PAD;
  for (const group of groups) {
    const packed = layoutComponent(group, edgesRaw, sized);
    if (cursorX > PAD && cursorX + packed.width > WRAP_WIDTH) {
      cursorX = PAD;
      cursorY += rowHeight + COMPONENT_GAP;
      rowHeight = 0;
    }
    for (const node of packed.nodes) {
      const next = { ...node, x: node.x + cursorX, y: node.y + cursorY };
      nodes.push(next);
      placed.set(next.id, next);
      maxX = Math.max(maxX, next.x + next.width + PAD);
      maxY = Math.max(maxY, next.y + next.height + PAD);
    }
    cursorX += packed.width + COMPONENT_GAP;
    rowHeight = Math.max(rowHeight, packed.height);
  }
  const edges: ErdLayoutEdge[] = edgesRaw.map((edge, index) => {
    const from = placed.get(edge.from);
    const to = placed.get(edge.to);
    if (!from || !to)
      return { id: `e${index}`, from: edge.from, to: edge.to, label: edge.label, path: '' };
    return {
      id: `e${index}`,
      from: edge.from,
      to: edge.to,
      label: edge.label,
      path: erdEdgePath(from, to),
    };
  });
  return { nodes, edges, width: Math.max(maxX, 480), height: Math.max(maxY, 280) };
}

function layoutComponent(
  ids: readonly string[],
  edgesRaw: readonly { from: string; to: string }[],
  sized: ReadonlyMap<string, ErdSizedNode>,
): { readonly nodes: readonly ErdLayoutNode[]; readonly width: number; readonly height: number } {
  const idSet = new Set(ids);
  const incoming = new Map<string, number>();
  const children = new Map<string, string[]>();
  const parents = new Map<string, string[]>();
  for (const id of ids) {
    incoming.set(id, 0);
    children.set(id, []);
    parents.set(id, []);
  }
  for (const edge of edgesRaw) {
    if (!idSet.has(edge.from) || !idSet.has(edge.to) || edge.from === edge.to)
      continue;
    children.get(edge.to)?.push(edge.from);
    parents.get(edge.from)?.push(edge.to);
    incoming.set(edge.from, (incoming.get(edge.from) ?? 0) + 1);
  }
  const remaining = new Map(incoming);
  const rank = new Map<string, number>();
  const queue = ids.filter((id) => (remaining.get(id) ?? 0) === 0);
  for (const id of queue)
    rank.set(id, 0);
  while (queue.length) {
    const id = queue.shift();
    if (!id)
      break;
    const nextRank = (rank.get(id) ?? 0) + 1;
    for (const child of children.get(id) ?? []) {
      rank.set(child, Math.max(rank.get(child) ?? 0, nextRank));
      remaining.set(child, (remaining.get(child) ?? 1) - 1);
      if ((remaining.get(child) ?? 0) === 0)
        queue.push(child);
    }
  }
  const leftover = ids.filter((id) => !rank.has(id));
  const base = rank.size ? Math.max(0, ...rank.values()) + 1 : 0;
  for (const id of leftover)
    rank.set(id, base);
  const layers = new Map<number, string[]>();
  for (const id of ids) {
    const value = rank.get(id) ?? 0;
    const list = layers.get(value) ?? [];
    list.push(id);
    layers.set(value, list);
  }
  for (const list of layers.values())
    list.sort();
  reduceCrossings(layers, parents, children);
  const orderedRanks = [...layers.keys()].sort((left, right) => left - right);
  const layerHeight = (ids: readonly string[]): number => {
    let height = HEADER + ROW * 3;
    for (const id of ids)
      height = Math.max(height, sized.get(id)?.height ?? height);
    return height;
  };
  const nodes: ErdLayoutNode[] = [];
  let width = 0;
  let height = 0;
  for (const [layerIndex, value] of orderedRanks.entries()) {
    const layer = layers.get(value) ?? [];
    const y = layerIndex * (layerHeight(layer) + GAP_Y);
    for (const [index, id] of layer.entries()) {
      const entry = sized.get(id);
      if (!entry)
        continue;
      const node: ErdLayoutNode = {
        ...entry,
        x: index * (NODE_WIDTH + GAP_X),
        y,
      };
      nodes.push(node);
      width = Math.max(width, node.x + node.width);
      height = Math.max(height, node.y + node.height);
    }
  }
  return { nodes, width, height };
}

function reduceCrossings(
  layers: Map<number, string[]>,
  parents: ReadonlyMap<string, readonly string[]>,
  children: ReadonlyMap<string, readonly string[]>,
): void {
  const ranks = [...layers.keys()].sort((left, right) => left - right);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < ranks.length; i++)
      sortLayer(layers.get(ranks[i]) ?? [], layers.get(ranks[i - 1]) ?? [], parents);
    for (let i = ranks.length - 2; i >= 0; i--)
      sortLayer(layers.get(ranks[i]) ?? [], layers.get(ranks[i + 1]) ?? [], children);
  }
}

function sortLayer(
  layer: string[],
  relatedLayer: readonly string[],
  related: ReadonlyMap<string, readonly string[]>,
): void {
  const index = new Map(relatedLayer.map((id, order) => [id, order]));
  layer.sort((left, right) => {
    const delta = barycenter(left, related, index) - barycenter(right, related, index);
    return delta !== 0 ? delta : left.localeCompare(right);
  });
}

function barycenter(
  id: string,
  related: ReadonlyMap<string, readonly string[]>,
  index: ReadonlyMap<string, number>,
): number {
  const refs = (related.get(id) ?? []).map((item) => index.get(item)).filter((value): value is number => value != null);
  if (refs.length === 0)
    return Number.POSITIVE_INFINITY;
  return refs.reduce((sum, value) => sum + value, 0) / refs.length;
}

function connectedGroups(ids: readonly string[], neighbors: ReadonlyMap<string, readonly string[]>): string[][] {
  const seen = new Set<string>();
  const groups: string[][] = [];
  for (const start of [...ids].sort()) {
    if (seen.has(start))
      continue;
    const group: string[] = [];
    const stack = [start];
    while (stack.length) {
      const id = stack.pop();
      if (!id || seen.has(id))
        continue;
      seen.add(id);
      group.push(id);
      for (const next of neighbors.get(id) ?? [])
        stack.push(next);
    }
    group.sort();
    groups.push(group);
  }
  groups.sort((left, right) => right.length - left.length || (left[0] ?? '').localeCompare(right[0] ?? ''));
  return groups;
}

function nodeCenter(node: Pick<ErdLayoutNode, 'x' | 'y' | 'width' | 'height'>): { x: number; y: number } {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

function closestPort(
  node: Pick<ErdLayoutNode, 'x' | 'y' | 'width' | 'height'>,
  toward: { readonly x: number; readonly y: number },
): ErdPort {
  const ports: ErdPort[] = [
    { x: node.x + node.width / 2, y: node.y, dx: 0, dy: -1 },
    { x: node.x + node.width / 2, y: node.y + node.height, dx: 0, dy: 1 },
    { x: node.x, y: node.y + node.height / 2, dx: -1, dy: 0 },
    { x: node.x + node.width, y: node.y + node.height / 2, dx: 1, dy: 0 },
  ];
  let best = ports[0]!;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const port of ports) {
    const dist = (port.x - toward.x) ** 2 + (port.y - toward.y) ** 2;
    if (dist < bestDist) {
      best = port;
      bestDist = dist;
    }
  }
  return best;
}
