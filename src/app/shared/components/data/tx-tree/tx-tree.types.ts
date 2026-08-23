import type { TxIconName } from '@app/shared/icons';

/** Where a dragged node may land relative to the hover target. */
export type TxTreeDropPosition = 'before' | 'after' | 'inside';

/** How far a dragged node may travel in the hierarchy. */
export type TxTreeDragScope = 'disabled' | 'sameParent' | 'subtree' | 'anywhere';

/** Row selection behavior. */
export type TxTreeSelectionMode = 'none' | 'single' | 'multiple';

/** How sibling lists are ordered after a drop. */
export type TxTreeSiblingSort = 'order' | 'priority' | 'orderThenPriority' | 'manual';

/** Single node in a nested tree input. */
export interface TxTreeNode<TMeta = unknown> {
  readonly id: string;
  readonly label: string;
  /** Optional secondary line shown below {@link label} (smaller, muted). */
  readonly subtitle?: string;
  /** Optional tag pills shown on a secondary meta row when the sidebar preference allows it. */
  readonly tags?: readonly string[];
  /** Optional critical indicator for flows and similar high-priority items. */
  readonly critical?: boolean;
  /** Optional favourite indicator (star) on collection and similar rows. */
  readonly favourite?: boolean;
  /** Optional HTTP method chip on request rows (not persisted). */
  readonly httpMethod?: string;
  readonly icon?: TxIconName;
  readonly kind?: string;
  /**
   * When false, the row is a leaf (no expand chevron) even if `kind` is normally expandable.
   * Used by pickers that reuse connection nodes without a catalog subtree.
   */
  readonly expandable?: boolean;
  /** Optional connection/status indicator shown before the row icon. */
  readonly statusDot?: 'connected' | 'error' | 'idle' | 'unknown' | 'checking';
  readonly children?: readonly TxTreeNode<TMeta>[];
  readonly order?: number;
  readonly priority?: number;
  readonly disabled?: boolean;
  readonly draggable?: boolean;
  readonly droppable?: boolean;
  readonly data?: TMeta;
}

/** Context passed to drag policy predicates. */
export interface TxTreeDragContext<TMeta = unknown> {
  readonly nodeId: string;
  readonly node: TxTreeNode<TMeta>;
  readonly parentId: string | null;
  readonly depth: number;
}

/** Context passed to drop policy predicates. */
export interface TxTreeDropContext<TMeta = unknown> {
  readonly sourceId: string;
  readonly source: TxTreeNode<TMeta>;
  readonly targetId: string;
  readonly target: TxTreeNode<TMeta>;
  readonly position: TxTreeDropPosition;
  readonly sourceParentId: string | null;
  readonly targetParentId: string | null;
}

/** Emitted after a successful drop. */
export interface TxTreeNodeDropEvent {
  readonly sourceId: string;
  readonly targetId: string;
  readonly position: TxTreeDropPosition;
  readonly previousParentId: string | null;
  readonly nextParentId: string | null;
}

/**
 * Insert between siblings of {@link parentId}.
 *
 * {@link index} counts the parent's children in display order **after** the dragged
 * subtree is removed, so applying the intent is a plain splice.
 */
export interface TxTreeReorderIntent {
  readonly kind: 'reorder';
  /** Receiving parent, or `null` for the tree root. */
  readonly parentId: string | null;
  readonly index: number;
  /** Row depth the insert line renders at. */
  readonly depth: number;
}

/** Append into an expandable node. */
export interface TxTreeInsideIntent {
  readonly kind: 'inside';
  readonly parentId: string;
}

/**
 * Canonical drop target for a drag gesture.
 *
 * A single intent drives both the insert indicator and the committed move, so the
 * preview cannot disagree with the result.
 */
export type TxTreeDropIntent = TxTreeReorderIntent | TxTreeInsideIntent;

/** Insert-line geometry relative to the tree content box. */
export interface TxTreeDropIndicator {
  readonly topPx: number;
  readonly indentPx: number;
}

/** Flattened row used for rendering and hit-testing. */
export interface TxTreeVisibleRow<TMeta = unknown> {
  readonly id: string;
  readonly node: TxTreeNode<TMeta>;
  readonly depth: number;
  readonly parentId: string | null;
  readonly hasChildren: boolean;
  readonly expanded: boolean;
  readonly indexAmongSiblings: number;
}

export interface TxTreeSelectContext<TMeta = unknown> {
  readonly id: string;
  readonly node: TxTreeNode<TMeta>;
  readonly depth: number;
  readonly hasChildren: boolean;
}

export interface TxTreeSelectionConfig<TMeta = unknown> {
  readonly mode: TxTreeSelectionMode;
  readonly selectOnClick: boolean;
  /** When provided, rows that return false are not selected on click (expansion / nodeClick still run). */
  readonly canSelect?: (ctx: TxTreeSelectContext<TMeta>) => boolean;
}

export interface TxTreeExpansionConfig {
  readonly defaultExpanded: boolean;
  readonly expandOnClick: boolean;
  /** When true, hovering a collapsed folder while dragging expands it after {@link autoExpandOnDropHoverMs}. */
  readonly expandFolderOnDrag: boolean;
  /**
   * When true, expands the target folder after a successful drop with position `inside`, so
   * the dropped row stays visible where it landed. Set to false to keep the folder closed.
   */
  readonly expandFolderOnDrop: boolean;
  readonly autoExpandOnDropHoverMs: number;
}

/** Minimum pointer movement before a row drag activates (avoids drag on click). */
export const TX_TREE_DRAG_ACTIVATION_DISTANCE_PX = 6;

export interface TxTreeDragPolicy<TMeta = unknown> {
  readonly enabled: boolean;
  readonly handleOnly: boolean;
  readonly scope: TxTreeDragScope;
  /** Pixels the pointer must move before drag starts (ignored when dragging from handle). */
  readonly activationDistancePx: number;
  readonly canDrag?: (ctx: TxTreeDragContext<TMeta>) => boolean;
}

export interface TxTreeDropRemap {
  readonly targetId: string;
  readonly position: TxTreeDropPosition;
}

export interface TxTreeDropPolicy<TMeta = unknown> {
  readonly enabled: boolean;
  readonly positions: readonly TxTreeDropPosition[];
  /** When false, only slots under the dragged node's current parent are offered. */
  readonly reparentAllowed: boolean;
  readonly maxDepth: number | null;
  readonly canDrop?: (ctx: TxTreeDropContext<TMeta>) => boolean;
  /**
   * Marks a candidate slot as not a valid anchor by returning any other target.
   *
   * Use this when live children (catalog rows, status nodes) should not accept drops. The
   * rewritten target is not adopted: the slot is dropped from the table, and the nearest
   * remaining legal slot wins instead. That keeps the insert indicator on a slot that the
   * drop will actually use.
   */
  readonly remapDropTarget?: (ctx: TxTreeDropContext<TMeta>) => TxTreeDropRemap | null;
}

export interface TxTreeSortConfig {
  readonly siblingSort: TxTreeSiblingSort;
  /** When true, folder nodes sort above requests, websockets, and other leaves. */
  readonly foldersFirst: boolean;
}

export interface TxTreeVisualConfig {
  readonly indentPx: number;
  readonly showDragHandle: boolean;
  readonly animateInsertLine: boolean;
  /** FLIP transition when rows change position after a successful drop. */
  readonly animateMove: boolean;
  /** Staggered reveal when folder rows expand. */
  readonly animateExpand: boolean;
}

/** Full tree configuration (merge partial overrides onto {@link TX_TREE_DEFAULT_CONFIG}). */
export interface TxTreeConfig<TMeta = unknown> {
  readonly selection: TxTreeSelectionConfig<TMeta>;
  readonly expansion: TxTreeExpansionConfig;
  readonly drag: TxTreeDragPolicy<TMeta>;
  readonly drop: TxTreeDropPolicy<TMeta>;
  readonly sort: TxTreeSortConfig;
  readonly visual: TxTreeVisualConfig;
  readonly ariaLabel?: string;
}

export const TX_TREE_DROP_HIT_BEFORE_RATIO = 0.25;
export const TX_TREE_DROP_HIT_AFTER_RATIO = 0.25;

/** Pixel buffer the challenger must beat before the resolved drop slot switches. */
export const TX_TREE_DROP_HYSTERESIS_PX = 6;

/** Inline inset of `.tx-tree-row` inside the tree content box (`margin-inline: 0.35rem`). */
export const TX_TREE_ROW_INLINE_INSET_PX = 6;

/** Distance from a scroll edge where drag auto-scroll engages. */
export const TX_TREE_AUTO_SCROLL_EDGE_PX = 28;

/** Peak auto-scroll speed at the very edge of the scroll container. */
export const TX_TREE_AUTO_SCROLL_MAX_PX_PER_FRAME = 14;

export const TX_TREE_DEFAULT_CONFIG: TxTreeConfig = {
  selection: {
    mode: 'single',
    selectOnClick: true,
  },
  expansion: {
    defaultExpanded: false,
    expandOnClick: true,
    expandFolderOnDrag: false,
    expandFolderOnDrop: true,
    autoExpandOnDropHoverMs: 500,
  },
  drag: {
    enabled: true,
    handleOnly: false,
    scope: 'anywhere',
    activationDistancePx: TX_TREE_DRAG_ACTIVATION_DISTANCE_PX,
  },
  drop: {
    enabled: true,
    positions: ['before', 'after', 'inside'],
    reparentAllowed: true,
    maxDepth: null,
  },
  sort: {
    siblingSort: 'orderThenPriority',
    foldersFirst: false,
  },
  visual: {
    indentPx: 16,
    showDragHandle: false,
    animateInsertLine: true,
    animateMove: true,
    animateExpand: true,
  },
  ariaLabel: 'Tree',
};

/** Row template context for {@link TxTreeNodeTemplateDirective}. */
export interface TxTreeNodeTemplateContext<TMeta = unknown> {
  readonly $implicit: TxTreeVisibleRow<TMeta>;
  readonly row: TxTreeVisibleRow<TMeta>;
  readonly node: TxTreeNode<TMeta>;
  readonly depth: number;
  readonly selected: boolean;
  readonly expanded: boolean;
}

export interface TxTreeRowContextMenuEvent {
  readonly nodeId: string;
  readonly clientX: number;
  readonly clientY: number;
}

/** Emitted when a row is clicked without starting a drag gesture. */
export interface TxTreeNodeClickEvent<TMeta = unknown> {
  readonly nodeId: string;
  readonly node: TxTreeNode<TMeta>;
}

/** Emitted when inline rename is committed for a row. */
export interface TxTreeNodeRenameCommitEvent {
  readonly nodeId: string;
  readonly value: string;
}

export interface TxTreeDnDState {
  readonly draggingId: string | null;
  /** Where the drag will land; the only input to both the indicator and the commit. */
  readonly intent: TxTreeDropIntent | null;
  /** Insert-line geometry for `reorder` intents (`inside` highlights the row instead). */
  readonly indicator: TxTreeDropIndicator | null;
  /**
   * Row under the pointer when no drop is reachable there.
   *
   * Nothing is drawn for it — an unreachable position shows no indicator at all — so this
   * exists only to explain the empty indicator in the debug HUD.
   */
  readonly denyTargetId: string | null;
}

export const TX_TREE_INITIAL_DND_STATE: TxTreeDnDState = {
  draggingId: null,
  intent: null,
  indicator: null,
  denyTargetId: null,
};

/** Resolved node reference for design-system / debug HUDs. */
export interface TxTreeDnDDebugNodeRef {
  readonly id: string;
  readonly label: string;
  readonly kind?: string;
  readonly depth: number;
  readonly parentId: string | null;
}

/** Rich drag trace for layout QA (emitted when {@link TxTreeComponent.debug} is true). */
export interface TxTreeDnDDebugInfo {
  readonly phase: 'idle' | 'dragging';
  readonly pointer: { readonly x: number; readonly y: number } | null;
  readonly source: TxTreeDnDDebugNodeRef | null;
  /** Receiving parent for the pending intent (`null` at the tree root). */
  readonly parent: TxTreeDnDDebugNodeRef | null;
  readonly intent: TxTreeDropIntent | null;
  readonly dropAllowed: boolean;
  readonly denied: boolean;
  readonly denyTargetId: string | null;
  /** Human-readable summary of the pending move. */
  readonly summary: string;
  readonly raw: TxTreeDnDState;
}

export const TX_TREE_INITIAL_DND_DEBUG_INFO: TxTreeDnDDebugInfo = {
  phase: 'idle',
  pointer: null,
  source: null,
  parent: null,
  intent: null,
  dropAllowed: false,
  denied: false,
  denyTargetId: null,
  summary: 'Idle',
  raw: TX_TREE_INITIAL_DND_STATE,
};
