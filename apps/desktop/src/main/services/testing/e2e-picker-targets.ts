import {
  flowRunOrderIndex,
  isFlowTerminalKind,
  type FlowNodeKind,
  type FlowScenario,
} from '@testrix/contracts';

/** Node kinds that use a filtered CSS picker. */
export type PickSelectorKind = FlowNodeKind | string;

/**
 * Pick replays every node on the path from Start, whatever its kind.
 * A failure is swallowed by the picker so the window stays open.
 * Steps that still have an empty selector are skipped separately.
 */
export function browserPickPrefixKind(_kind: string): boolean {
  return true;
}

/** Selector-based browser steps that cannot run until the user has authored a selector. */
export function browserPickPrefixNeedsSelector(kind: string): boolean {
  return (
    kind === 'browser-click' ||
    kind === 'browser-type' ||
    kind === 'browser-select' ||
    kind === 'browser-hover' ||
    kind === 'browser-wait-for'
  );
}

export function pickHintForKind(kind?: string | null): string {
  switch (kind) {
    case 'browser-click':
      return 'Click the element · Esc cancels';
    case 'browser-type':
      return 'Pick an input or textarea · Esc cancels';
    case 'browser-select':
      return 'Pick a select · Esc cancels';
    default:
      return 'Click an element to copy its CSS selector · Esc cancels';
  }
}

/**
 * Ordered node ids to run before `stopBeforeNodeId` (exclusive).
 * Only ancestors on a path from Start → stop are included (not sibling /
 * orphan branches that happen to appear earlier in the global run plan).
 * Returns null when the stop node is not reachable from Start.
 */
export function prefixNodeIdsBefore(
  scenario: Pick<FlowScenario, 'nodes' | 'edges'>,
  stopBeforeNodeId: string,
): string[] | null {
  if (!isReachableFromStart(scenario, stopBeforeNodeId))
    return null;

  const ancestors = ancestorIdsFromStart(scenario, stopBeforeNodeId);
  if (!ancestors)
    return null;

  const order = flowRunOrderIndex(scenario);
  return [...ancestors]
    .filter((id) => {
      const node = scenario.nodes.find((item) => item.id === id);
      return !!node && node.enabled !== false && !isFlowTerminalKind(node.kind);
    })
    .sort((a, b) => (order[a] ?? 0) - (order[b] ?? 0));
}

/**
 * Every node that lies on some path from Start to `targetId` (excluding the
 * target). Uses reverse BFS from the target along incoming edges, then keeps
 * only nodes still reachable from Start.
 */
function ancestorIdsFromStart(
  scenario: Pick<FlowScenario, 'nodes' | 'edges'>,
  targetId: string,
): string[] | null {
  const start = scenario.nodes.find((node) => node.kind === 'start' && node.parentId == null);
  if (!start)
    return null;

  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const node of scenario.nodes) {
    incoming.set(node.id, []);
    outgoing.set(node.id, []);
  }
  for (const edge of scenario.edges) {
    incoming.get(edge.to)?.push(edge.from);
    outgoing.get(edge.from)?.push(edge.to);
  }

  const onPathToTarget = new Set<string>();
  const reverse: string[] = [targetId];
  while (reverse.length > 0) {
    const id = reverse.pop()!;
    if (onPathToTarget.has(id))
      continue;
    onPathToTarget.add(id);
    for (const prev of incoming.get(id) ?? [])
      reverse.push(prev);
  }

  if (!onPathToTarget.has(start.id))
    return null;

  const fromStart = new Set<string>();
  const queue = [start.id];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (!onPathToTarget.has(id) || fromStart.has(id))
      continue;
    fromStart.add(id);
    for (const next of outgoing.get(id) ?? [])
      queue.push(next);
  }

  return [...fromStart].filter((id) => id !== targetId);
}

function isReachableFromStart(
  scenario: Pick<FlowScenario, 'nodes' | 'edges'>,
  targetId: string,
): boolean {
  const start = scenario.nodes.find((node) => node.kind === 'start' && node.parentId == null);
  if (!start)
    return false;
  const outgoing = new Map<string, string[]>();
  for (const node of scenario.nodes)
    outgoing.set(node.id, []);
  for (const edge of scenario.edges)
    outgoing.get(edge.from)?.push(edge.to);

  const seen = new Set<string>();
  const queue = [start.id];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (id === targetId)
      return true;
    if (seen.has(id))
      continue;
    seen.add(id);
    for (const next of outgoing.get(id) ?? [])
      queue.push(next);
  }
  return false;
}

/**
 * Returns true when `el` (or a matching ancestor) is valid for `kind`.
 * Bound as `this` = element. Returns the snapped element or null.
 */
export const SNAP_ELEMENT_TO_PICK_KIND_FN = `function(kind) {
  var el = this;
  if (!el || el.nodeType !== 1) return null;
  kind = kind || '';

  function parentOrHost(node) {
    if (!node || node.nodeType !== 1) return null;
    if (node.parentElement) return node.parentElement;
    var root = node.getRootNode ? node.getRootNode() : null;
    return root && root.host ? root.host : null;
  }

  function matchesClick(node) {
    if (!node || node.nodeType !== 1) return false;
    var tag = node.tagName.toLowerCase();
    if (tag === 'button' || tag === 'summary') return true;
    if (tag === 'a' && (node.hasAttribute('href') || node.hasAttribute('role'))) return true;
    var role = (node.getAttribute('role') || '').toLowerCase();
    if (role === 'button' || role === 'link' || role === 'tab' || role === 'menuitem' || role === 'switch')
      return true;
    if (tag === 'input') {
      var t = (node.getAttribute('type') || 'text').toLowerCase();
      return t === 'button' || t === 'submit' || t === 'reset' || t === 'checkbox' || t === 'radio' || t === 'image';
    }
    if (node.hasAttribute('onclick')) return true;
    // CMP / design-system custom elements (Usercentrics, etc.)
    if (tag.indexOf('-') !== -1) {
      var hint = (tag + ' ' + (node.id || '') + ' ' + (node.getAttribute('class') || '')).toLowerCase();
      if (/button|btn|accept|consent|reject|cookie|cta/.test(hint)) return true;
    }
    var tabIndex = node.getAttribute('tabindex');
    if (tabIndex != null && tabIndex !== '-1') return true;
    return false;
  }

  function matchesType(node) {
    if (!node || node.nodeType !== 1) return false;
    var tag = node.tagName.toLowerCase();
    if (tag === 'textarea') return true;
    if (node.isContentEditable || (node.getAttribute('contenteditable') || '').toLowerCase() === 'true')
      return true;
    if (tag !== 'input') return false;
    var t = (node.getAttribute('type') || 'text').toLowerCase();
    return t !== 'button' && t !== 'submit' && t !== 'reset' && t !== 'checkbox' &&
      t !== 'radio' && t !== 'hidden' && t !== 'image' && t !== 'file';
  }

  function matchesSelect(node) {
    return !!(node && node.nodeType === 1 && node.tagName.toLowerCase() === 'select');
  }

  function matches(node) {
    if (kind === 'browser-click') return matchesClick(node);
    if (kind === 'browser-type') return matchesType(node);
    if (kind === 'browser-select') return matchesSelect(node);
    return true;
  }

  function hasPointerCursor(node) {
    try {
      var view = node.ownerDocument && node.ownerDocument.defaultView;
      if (!view) return false;
      return view.getComputedStyle(node).cursor === 'pointer';
    } catch (_) {
      return false;
    }
  }

  var cur = el;
  while (cur && cur.nodeType === 1) {
    if (matches(cur)) return cur;
    cur = parentOrHost(cur);
  }
  // Fallback for CMP wrappers that only look clickable via CSS.
  if (kind === 'browser-click') {
    cur = el;
    while (cur && cur.nodeType === 1) {
      if (hasPointerCursor(cur)) return cur;
      cur = parentOrHost(cur);
    }
    // A click target is often a div, not a button. Keep the element under the pointer.
    return el;
  }
  return null;
}`;

/**
 * Short CSS selector for `this`. Prefers #id / test ids / aria-label / tag.classes.
 * Uniqueness checked in the element's root (document or shadow root). Path max depth 4.
 */
export const BUILD_SHORT_CSS_SELECTOR_FN = `function() {
  var el = this;
  if (!el || el.nodeType !== 1) return '';
  var doc = el.ownerDocument || document;
  var rootNode = el.getRootNode ? el.getRootNode() : doc;
  var scope = rootNode && rootNode.nodeType === 11 ? rootNode : doc;
  function cssEscape(s) {
    if (window.CSS && typeof CSS.escape === 'function') return CSS.escape(String(s));
    return String(s).replace(/[^a-zA-Z0-9_-]/g, '\\\\$&');
  }
  function qsa(sel) {
    try { return scope.querySelectorAll(sel); } catch (_) { return { length: 0 }; }
  }
  if (el.id) {
    var idSel = '#' + cssEscape(el.id);
    try { if (qsa(idSel).length === 1) return idSel; } catch (_) {}
  }
  var attrs = ['data-testid', 'data-test', 'data-cy', 'name', 'aria-label'];
  for (var i = 0; i < attrs.length; i++) {
    var a = attrs[i];
    var v = el.getAttribute(a);
    if (!v) continue;
    var selAttr = el.tagName.toLowerCase() + '[' + a + '=' + JSON.stringify(v) + ']';
    try { if (qsa(selAttr).length === 1) return selAttr; } catch (_) {}
  }
  if (el.getAttribute('type') === 'submit' || el.getAttribute('type') === 'button') {
    var typeSel = el.tagName.toLowerCase() + '[type=' + JSON.stringify(el.getAttribute('type')) + ']';
    try { if (qsa(typeSel).length === 1) return typeSel; } catch (_) {}
  }
  if (el.classList && el.classList.length) {
    var meaningful = [];
    el.classList.forEach(function (c) {
      if (!String(c).startsWith('__tx') && String(c).length < 48 && meaningful.length < 2)
        meaningful.push(c);
    });
    if (meaningful.length) {
      var classSel = el.tagName.toLowerCase();
      for (var ci = 0; ci < meaningful.length; ci++) classSel += '.' + cssEscape(meaningful[ci]);
      try { if (qsa(classSel).length === 1) return classSel; } catch (_) {}
    }
  }
  var parts = [];
  var cur = el;
  var stopAt = scope.nodeType === 11 ? null : doc.documentElement;
  while (cur && cur.nodeType === 1 && cur !== stopAt) {
    var part = cur.tagName.toLowerCase();
    if (cur.id) {
      part = part + '#' + cssEscape(cur.id);
      parts.unshift(part);
      break;
    }
    if (cur.classList && cur.classList.length) {
      var meaningful2 = [];
      cur.classList.forEach(function (c) {
        if (!String(c).startsWith('__tx') && String(c).length < 48 && meaningful2.length < 2)
          meaningful2.push(c);
      });
      for (var cj = 0; cj < meaningful2.length; cj++) part += '.' + cssEscape(meaningful2[cj]);
    }
    var parentEl = cur.parentElement;
    if (parentEl) {
      var siblings = [].slice.call(parentEl.children);
      var sameTag = siblings.filter(function (s) { return s.tagName === cur.tagName; });
      if (sameTag.length > 1) {
        var idx = siblings.indexOf(cur);
        if (idx >= 0) part += ':nth-child(' + (idx + 1) + ')';
      }
    }
    parts.unshift(part);
    var joined = parts.join(' > ');
    try { if (qsa(joined).length === 1) return joined; } catch (_) {}
    if (parts.length > 4) break;
    if (!parentEl) break;
    cur = parentEl;
  }
  return parts.join(' > ') || el.tagName.toLowerCase();
}`;

/**
 * Page-side hit test. `x`/`y` are CSS viewport pixels from the pointer event
 * (`clientX`/`clientY`), so a scrolled page still highlights the element under
 * the cursor. Returns the CSS selector, or ''.
 */
export const PICK_ELEMENT_AT_POINT_FN = `function(x, y, kind) {
  function skip(node) {
    if (!node || node.nodeType !== 1) return true;
    var id = node.id || '';
    return id === '__tx-pick-box' || id === '__tx-picker-hint' || id === 'tx-e2e-target' || id === 'tx-e2e-guard-banner';
  }
  function fromPoint(px, py) {
    var el = document.elementFromPoint(px, py);
    var guard = 0;
    while (el && el.shadowRoot && guard < 8) {
      var inner = el.shadowRoot.elementFromPoint(px, py);
      if (!inner || inner === el) break;
      el = inner;
      guard++;
    }
    if (skip(el)) return null;
    return el;
  }
  function paint(el) {
    var box = document.getElementById('__tx-pick-box');
    if (!el || !el.getBoundingClientRect) {
      if (box) box.style.display = 'none';
      return;
    }
    var rect = el.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) {
      if (box) box.style.display = 'none';
      return;
    }
    if (!box) {
      box = document.createElement('div');
      box.id = '__tx-pick-box';
      box.setAttribute('style', [
        'position:fixed',
        'z-index:2147483646',
        'pointer-events:none',
        'box-sizing:border-box',
        'border:2px solid #0a0c10',
        'background:rgba(255,220,0,0.42)',
        'border-radius:2px',
      ].join(';'));
      (document.documentElement || document.body).appendChild(box);
    }
    var pad = 3;
    box.style.display = 'block';
    box.style.left = Math.max(0, rect.left - pad) + 'px';
    box.style.top = Math.max(0, rect.top - pad) + 'px';
    box.style.width = Math.max(8, rect.width + pad * 2) + 'px';
    box.style.height = Math.max(8, rect.height + pad * 2) + 'px';
  }
  var el = fromPoint(x, y);
  if (!el) {
    paint(null);
    return '';
  }
  var snapped = (${SNAP_ELEMENT_TO_PICK_KIND_FN}).call(el, kind);
  if (!snapped) {
    paint(null);
    return '';
  }
  paint(snapped);
  return (${BUILD_SHORT_CSS_SELECTOR_FN}).call(snapped) || '';
}`;
