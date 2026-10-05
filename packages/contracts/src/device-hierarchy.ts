export interface DeviceUiBounds {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface DeviceUiNode {
  readonly text: string;
  readonly resourceId: string;
  readonly contentDesc: string;
  readonly className: string;
  readonly packageName: string;
  readonly clickable: boolean;
  readonly bounds: DeviceUiBounds | null;
  readonly children: readonly DeviceUiNode[];
}

const ATTR_RE = /([a-zA-Z0-9:_-]+)="([^"]*)"/g;
const NODE_RE = /<node\b([^>]*)(\/>|>)/g;

function attrMap(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let match: RegExpExecArray | null = ATTR_RE.exec(raw);
  while (match) {
    out[match[1] ?? ''] = match[2] ?? '';
    match = ATTR_RE.exec(raw);
  }
  return out;
}

function parseBounds(value: string): DeviceUiBounds | null {
  const match = value.match(/\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/);
  if (!match)
    return null;
  return {
    x1: Number(match[1]),
    y1: Number(match[2]),
    x2: Number(match[3]),
    y2: Number(match[4]),
  };
}

function readNode(attrs: Record<string, string>, children: readonly DeviceUiNode[]): DeviceUiNode {
  return {
    text: attrs['text'] ?? '',
    resourceId: attrs['resource-id'] ?? '',
    contentDesc: attrs['content-desc'] ?? '',
    className: attrs['class'] ?? '',
    packageName: attrs['package'] ?? '',
    clickable: attrs['clickable'] === 'true',
    bounds: parseBounds(attrs['bounds'] ?? ''),
    children,
  };
}

/**
 * Parses a `uiautomator dump` hierarchy XML into a node tree.
 */
export function parseDeviceHierarchy(xml: string): DeviceUiNode[] {
  const source = xml.trim();
  if (!source)
    return [];
  const stack: { attrs: Record<string, string>; children: DeviceUiNode[] }[] = [];
  const roots: DeviceUiNode[] = [];
  const tokens = source.match(/<\/node>|<node\b[^>]*\/>|<node\b[^>]*>/g) ?? [];
  for (const token of tokens) {
    if (token === '</node>') {
      const current = stack.pop();
      if (!current)
        continue;
      const node = readNode(current.attrs, current.children);
      const parent = stack[stack.length - 1];
      if (parent)
        parent.children.push(node);
      else
        roots.push(node);
      continue;
    }
    const parsed = NODE_RE.exec(token);
    NODE_RE.lastIndex = 0;
    const attrs = attrMap(parsed?.[1] ?? token);
    if (token.endsWith('/>')) {
      const node = readNode(attrs, []);
      const parent = stack[stack.length - 1];
      if (parent)
        parent.children.push(node);
      else
        roots.push(node);
      continue;
    }
    stack.push({ attrs, children: [] });
  }
  return roots;
}

export function flattenDeviceNodes(roots: readonly DeviceUiNode[]): DeviceUiNode[] {
  const out: DeviceUiNode[] = [];
  const walk = (nodes: readonly DeviceUiNode[]): void => {
    for (const node of nodes) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(roots);
  return out;
}

export function deviceNodeCenter(node: DeviceUiNode): { readonly x: number; readonly y: number } | null {
  const bounds = node.bounds;
  if (!bounds)
    return null;
  return {
    x: Math.round((bounds.x1 + bounds.x2) / 2),
    y: Math.round((bounds.y1 + bounds.y2) / 2),
  };
}

export interface DeviceSelector {
  readonly text?: string;
  readonly resourceId?: string;
  readonly contentDesc?: string;
  readonly className?: string;
  /** Zero-based index among nodes that match the other fields (for duplicate inputs). */
  readonly index?: number;
}

/**
 * Parses a compact selector such as `id=com.app:id/ok`, `text=Save`, or `desc=Close`.
 * A bare Android resource-id (`com.app:id/ok`) is treated as id=, not visible text.
 * Append `;index=N` (0-based) when several nodes share the same id/text/class.
 */
export function parseDeviceSelector(raw: string): DeviceSelector {
  const value = raw.trim();
  if (!value)
    return {};
  let index: number | undefined;
  let body = value;
  const indexMatch = body.match(/;?\s*index\s*=\s*(\d+)\s*$/i);
  if (indexMatch) {
    index = Number(indexMatch[1]);
    body = body.slice(0, indexMatch.index).trim().replace(/;\s*$/, '');
  }
  if (!body)
    return index !== undefined ? { index } : {};
  const match = body.match(/^(id|text|desc|class)\s*=\s*(.+)$/i);
  const base = ((): DeviceSelector => {
    if (!match) {
      if (isAndroidResourceId(body))
        return { resourceId: body };
      return { text: body };
    }
    const kind = match[1]!.toLowerCase();
    const needle = match[2]!.trim();
    if (kind === 'id')
      return { resourceId: needle };
    if (kind === 'desc')
      return { contentDesc: needle };
    if (kind === 'class')
      return { className: needle };
    return { text: needle };
  })();
  return index !== undefined ? { ...base, index } : base;
}

/** True for reverse-DNS resource ids like `com.app:id/ok` or `android:id/content`. */
export function isAndroidResourceId(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_.]*:id\/[A-Za-z0-9_.]+$/.test(value.trim());
}

function includesLoose(haystack: string, needle: string): boolean {
  if (!needle)
    return true;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/** Resource-id match: exact, suffix after `:id/`, or substring. */
function resourceIdMatches(haystack: string, needle: string): boolean {
  if (!needle)
    return true;
  const hay = haystack.toLowerCase();
  const ned = needle.toLowerCase();
  if (hay === ned)
    return true;
  if (hay.endsWith(`/${ned}`) || hay.endsWith(`:id/${ned}`))
    return true;
  return hay.includes(ned);
}

export function deviceNodeMatches(node: DeviceUiNode, selector: DeviceSelector): boolean {
  if (selector.resourceId && !resourceIdMatches(node.resourceId, selector.resourceId))
    return false;
  if (selector.contentDesc && !includesLoose(node.contentDesc, selector.contentDesc))
    return false;
  if (selector.className && !includesLoose(node.className, selector.className))
    return false;
  if (selector.text && !includesLoose(node.text, selector.text) && !includesLoose(node.contentDesc, selector.text))
    return false;
  return Boolean(selector.text || selector.resourceId || selector.contentDesc || selector.className);
}

function deviceNodesEqual(a: DeviceUiNode, b: DeviceUiNode): boolean {
  if (a === b)
    return true;
  if (a.resourceId && a.resourceId === b.resourceId && a.bounds && b.bounds)
    return (
      a.bounds.x1 === b.bounds.x1 &&
      a.bounds.y1 === b.bounds.y1 &&
      a.bounds.x2 === b.bounds.x2 &&
      a.bounds.y2 === b.bounds.y2
    );
  if (!a.bounds || !b.bounds)
    return false;
  return (
    a.className === b.className &&
    a.text === b.text &&
    a.contentDesc === b.contentDesc &&
    a.bounds.x1 === b.bounds.x1 &&
    a.bounds.y1 === b.bounds.y1 &&
    a.bounds.x2 === b.bounds.x2 &&
    a.bounds.y2 === b.bounds.y2
  );
}

/** Nodes that match the selector fields, ignoring index. */
export function findDeviceNodes(
  roots: readonly DeviceUiNode[],
  selector: DeviceSelector,
): DeviceUiNode[] {
  const withoutIndex: DeviceSelector = {
    text: selector.text,
    resourceId: selector.resourceId,
    contentDesc: selector.contentDesc,
    className: selector.className,
  };
  const matches = flattenDeviceNodes(roots).filter((node) => deviceNodeMatches(node, withoutIndex));
  if (!selector.resourceId)
    return matches;
  const needle = selector.resourceId.toLowerCase();
  const exact = matches.filter((node) => node.resourceId.toLowerCase() === needle);
  // Prefer exact resource-id hits when any exist so a short needle does not steal the first partial.
  return exact.length > 0 ? exact : matches;
}

export function findDeviceNode(
  roots: readonly DeviceUiNode[],
  selector: DeviceSelector,
): DeviceUiNode | null {
  const matches = findDeviceNodes(roots, selector);
  if (matches.length === 0)
    return null;
  if (selector.index !== undefined) {
    const hit = matches[selector.index];
    return hit ?? null;
  }
  return matches[0] ?? null;
}

/**
 * Builds a compact selector for a hierarchy node.
 * Prefers resource-id, then visible text, content-desc, then class name.
 * When `roots` is provided and the base selector matches more than one node,
 * appends `;index=N` so Pick on the second input does not resolve to the first.
 */
export function formatDeviceSelector(
  node: DeviceUiNode,
  roots?: readonly DeviceUiNode[],
): string | null {
  const id = node.resourceId.trim();
  let base: string | null = null;
  if (id)
    base = `id=${id}`;
  else {
    const text = node.text.trim();
    if (text)
      base = `text=${text}`;
    else {
      const desc = node.contentDesc.trim();
      if (desc)
        base = `desc=${desc}`;
      else {
        const className = node.className.trim();
        if (className)
          base = `class=${className}`;
      }
    }
  }
  if (!base || !roots)
    return base;
  const matches = findDeviceNodes(roots, parseDeviceSelector(base));
  if (matches.length <= 1)
    return base;
  const index = matches.findIndex((item) => deviceNodesEqual(item, node));
  if (index < 0)
    return base;
  return `${base};index=${index}`;
}

function boundsArea(bounds: DeviceUiBounds): number {
  return Math.max(0, bounds.x2 - bounds.x1) * Math.max(0, bounds.y2 - bounds.y1);
}

function boundsContain(bounds: DeviceUiBounds, x: number, y: number, pad = 0): boolean {
  return x >= bounds.x1 - pad && x < bounds.x2 + pad && y >= bounds.y1 - pad && y < bounds.y2 + pad;
}

/** Framework frames that cover the window and are not a control. */
const CHROME_RESOURCE_IDS = new Set([
  'android:id/content',
  'android:id/statusBarBackground',
  'android:id/navigationBarBackground',
  'android:id/statusBar',
  'android:id/navigationBar',
]);

function screenExtent(roots: readonly DeviceUiNode[]): { readonly width: number; readonly height: number } {
  let width = 1;
  let height = 1;
  for (const node of flattenDeviceNodes(roots)) {
    if (!node.bounds)
      continue;
    width = Math.max(width, node.bounds.x2);
    height = Math.max(height, node.bounds.y2);
  }
  return { width, height };
}

/**
 * True when a node is a single control (icon, button, field), not a full-screen frame.
 */
export function isPickableDeviceNode(
  node: DeviceUiNode,
  screenWidth: number,
  screenHeight: number,
): boolean {
  if (!node.bounds)
    return false;
  const selector = formatDeviceSelector(node);
  if (!selector)
    return false;
  // class= alone is allowed for clickable fields (e.g. two empty EditTexts).
  if (selector.startsWith('class=') && !node.clickable)
    return false;
  if (CHROME_RESOURCE_IDS.has(node.resourceId.trim()))
    return false;
  const hasLabel = Boolean(node.resourceId.trim() || node.text.trim() || node.contentDesc.trim());
  if (!hasLabel && !node.clickable)
    return false;
  const screen = Math.max(1, screenWidth) * Math.max(1, screenHeight);
  const ratio = boundsArea(node.bounds) / screen;
  if (ratio > 0.72)
    return false;
  return true;
}

/**
 * Finds the smallest selectable control under a device-pixel point.
 * Full-screen frames such as `android:id/content` are ignored.
 * A few pixels of slack catch a pointer that sits on the edge of an icon.
 */
export function findDeviceNodeAtPoint(
  roots: readonly DeviceUiNode[],
  x: number,
  y: number,
): DeviceUiNode | null {
  const screen = screenExtent(roots);
  const hits = flattenDeviceNodes(roots).filter((node) =>
    isPickableDeviceNode(node, screen.width, screen.height),
  );
  const inside = hits
    .filter((node) => node.bounds !== null && boundsContain(node.bounds, x, y))
    .sort((a, b) => boundsArea(a.bounds!) - boundsArea(b.bounds!));
  if (inside[0])
    return inside[0];

  const pad = 18;
  let nearest: DeviceUiNode | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const node of hits) {
    if (!node.bounds || !boundsContain(node.bounds, x, y, pad))
      continue;
    const cx = (node.bounds.x1 + node.bounds.x2) / 2;
    const cy = (node.bounds.y1 + node.bounds.y2) / 2;
    const distance = (x - cx) ** 2 + (y - cy) ** 2;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = node;
    }
  }
  return nearest;
}
