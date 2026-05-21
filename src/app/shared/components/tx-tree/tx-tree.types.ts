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
  /** Optional tag pills shown below the label when the sidebar preference allows it. */
  readonly tags?: readonly string[];
  /** Optional HTTP method chip on request rows (not persisted). */
  readonly httpMethod?: string;
  readonly icon?: TxIconName;
  readonly kind?: string;
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
  /** When true, expands the target folder after a successful drop with position `inside`. */
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

export interface TxTreeDropPolicy<TMeta = unknown> {
  readonly enabled: boolean;
  readonly positions: readonly TxTreeDropPosition[];
  readonly reparentAllowed: boolean;
  readonly maxDepth: number | null;
  readonly canDrop?: (ctx: TxTreeDropContext<TMeta>) => boolean;
}

export interface TxTreeSortConfig {
  readonly siblingSort: TxTreeSiblingSort;
  /** When true, folder nodes sort above requests, websockets, and other leaves. */
  readonly foldersFirst: boolean;
}

export interface TxTreeVisualConfig {
  readonly indentPx: number;
  readonly showDragHandle: boolean;
  readonly animateDeny: boolean;
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

/** Pixel buffer before switching between before / inside / after bands. */
export const TX_TREE_DROP_POSITION_HYSTERESIS_PX = 8;

/** Seam band where `after` on row N and `before` on row N+1 share one insert slot. */
export const TX_TREE_DROP_BOUNDARY_HYSTERESIS_PX = 12;

/** Extra vertical reach for row hit-testing (covers inter-row gaps). */
export const TX_TREE_ROW_HIT_SLOP_PX = 6;

export const TX_TREE_DEFAULT_CONFIG: TxTreeConfig = {
  selection: {
    mode: 'single',
    selectOnClick: true,
  },
  expansion: {
    defaultExpanded: false,
    expandOnClick: true,
    expandFolderOnDrag: false,
    expandFolderOnDrop: false,
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
    animateDeny: true,
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
  readonly dropTargetId: string | null;
  readonly dropPosition: TxTreeDropPosition | null;
  readonly denyTargetId: string | null;
  /** Insert-line row/position (may differ from drop target when exiting an expanded folder). */
  readonly indicatorTargetId: string | null;
  readonly indicatorPosition: TxTreeDropPosition | null;
  /** Insert-line indent depth when it differs from the indicator row (folder exit to root). */
  readonly indicatorIndentDepth: number | null;
  /** Tree-anchored folder-exit seam (px from `.tx-tree` top); used when the row slot is the drag source. */
  readonly indicatorFolderSeamTopPx: number | null;
}

export const TX_TREE_INITIAL_DND_STATE: TxTreeDnDState = {
  draggingId: null,
  dropTargetId: null,
  dropPosition: null,
  denyTargetId: null,
  indicatorTargetId: null,
  indicatorPosition: null,
  indicatorIndentDepth: null,
  indicatorFolderSeamTopPx: null,
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
  readonly target: TxTreeDnDDebugNodeRef | null;
  readonly dropPosition: TxTreeDropPosition | null;
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
  target: null,
  dropPosition: null,
  dropAllowed: false,
  denied: false,
  denyTargetId: null,
  summary: 'Idle',
  raw: TX_TREE_INITIAL_DND_STATE,
};
