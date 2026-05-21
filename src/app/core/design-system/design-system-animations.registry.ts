/** Category for grouping animation demos in the Style Guide. */
export type DesignSystemAnimationCategory = 'entrance' | 'micro' | 'feedback' | 'workspace' | 'dnd';

/** How the preview is rendered in the Animations panel. */
export type DesignSystemAnimationPreviewKind =
  | 'utility-class'
  | 'stagger'
  | 'shimmer'
  | 'hover-lift'
  | 'press-scale'
  | 'focus-glow'
  | 'menu-popover'
  | 'dnd-deny'
  | 'dnd-insert-line'
  | 'workspace-fade';

export interface DesignSystemAnimationDemo {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: DesignSystemAnimationCategory;
  readonly kind: DesignSystemAnimationPreviewKind;
  readonly className?: string;
  readonly scssSource: string;
  readonly replayable: boolean;
  readonly hint?: string;
}

export const DESIGN_SYSTEM_ANIMATION_CATEGORIES: readonly {
  readonly id: DesignSystemAnimationCategory;
  readonly label: string;
}[] = [
  { id: 'entrance', label: 'Entrance' },
  { id: 'micro', label: 'Micro-interactions' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'workspace', label: 'Workspace chrome' },
  { id: 'dnd', label: 'Drag & drop' },
];

export const DESIGN_SYSTEM_ANIMATION_DEMOS: readonly DesignSystemAnimationDemo[] = [
  {
    id: 'animate-in',
    name: 'Slide up (default entrance)',
    description: 'Primary list / panel entrance. Uses --tx-duration-base and --tx-ease-out-expo.',
    category: 'entrance',
    kind: 'utility-class',
    className: 'tx-animate-in',
    scssSource: 'src/styles/_animations.scss',
    replayable: true,
  },
  {
    id: 'animate-in-right',
    name: 'Slide from left',
    description: 'Horizontal entrance for side panels or rails.',
    category: 'entrance',
    kind: 'utility-class',
    className: 'tx-animate-in-right',
    scssSource: 'src/styles/_animations.scss',
    replayable: true,
  },
  {
    id: 'animate-in-scale',
    name: 'Scale in',
    description: 'Modal-like scale entrance (dialogs, popovers).',
    category: 'entrance',
    kind: 'utility-class',
    className: 'tx-animate-in-scale',
    scssSource: 'src/styles/_animations.scss',
    replayable: true,
  },
  {
    id: 'animate-fade',
    name: 'Fade in',
    description: 'Fast opacity-only entrance (--tx-duration-fast).',
    category: 'entrance',
    kind: 'utility-class',
    className: 'tx-animate-fade',
    scssSource: 'src/styles/_animations.scss',
    replayable: true,
  },
  {
    id: 'crossfade-enter',
    name: 'Crossfade enter',
    description: 'Tab or section switch with slight vertical drift.',
    category: 'entrance',
    kind: 'utility-class',
    className: 'tx-crossfade-enter',
    scssSource: 'src/styles/_animations.scss',
    replayable: true,
  },
  {
    id: 'stagger',
    name: 'Staggered children',
    description: 'Container .tx-stagger delays each child via --tx-stagger-delay.',
    category: 'entrance',
    kind: 'stagger',
    scssSource: 'src/styles/_animations.scss',
    replayable: true,
  },
  {
    id: 'hover-lift',
    name: 'Hover lift',
    description: 'Raises card on hover with shadow depth.',
    category: 'micro',
    kind: 'hover-lift',
    className: 'tx-hover-lift',
    scssSource: 'src/styles/_animations.scss',
    replayable: false,
    hint: 'Hover or focus the preview card.',
  },
  {
    id: 'press-scale',
    name: 'Press scale',
    description: 'Springy scale-down on active press.',
    category: 'micro',
    kind: 'press-scale',
    className: 'tx-press-scale',
    scssSource: 'src/styles/_animations.scss',
    replayable: false,
    hint: 'Click and hold the preview card.',
  },
  {
    id: 'focus-glow',
    name: 'Focus glow ring',
    description: 'Focus-visible ring plus expanding halo on keyboard focus.',
    category: 'micro',
    kind: 'focus-glow',
    className: 'tx-focus-glow',
    scssSource: 'src/styles/_animations.scss',
    replayable: true,
    hint: 'Tab to the preview control, or use Replay.',
  },
  {
    id: 'success-pop',
    name: 'Success pop',
    description: 'Brief scale bounce after a successful action.',
    category: 'feedback',
    kind: 'utility-class',
    className: 'tx-success-pop',
    scssSource: 'src/styles/_animations.scss',
    replayable: true,
  },
  {
    id: 'error-shake',
    name: 'Error shake',
    description: 'Horizontal shake for validation errors.',
    category: 'feedback',
    kind: 'utility-class',
    className: 'tx-error-shake',
    scssSource: 'src/styles/_animations.scss',
    replayable: true,
  },
  {
    id: 'shimmer-bar',
    name: 'Shimmer loading bar',
    description: 'Indeterminate shimmer overlay for skeleton states.',
    category: 'feedback',
    kind: 'shimmer',
    className: 'tx-shimmer-bar',
    scssSource: 'src/styles/_animations.scss',
    replayable: true,
  },
  {
    id: 'menu-fade-in',
    name: 'Filter / popover menu',
    description: 'Menus and popovers (.tx-menu-popover).',
    category: 'workspace',
    kind: 'menu-popover',
    scssSource: 'src/styles/_animations.scss',
    replayable: true,
  },
  {
    id: 'workspace-fade-in',
    name: 'Sidebar host fade',
    description: 'Secondary sidebar mount (tx-animate-fade).',
    category: 'workspace',
    kind: 'workspace-fade',
    scssSource: 'src/styles/_animations.scss',
    replayable: true,
  },
  {
    id: 'workspace-pane-enter',
    name: 'Editor pane split',
    description: 'Split pane entrance when the layout divides.',
    category: 'workspace',
    kind: 'utility-class',
    className: 'tx-split-pane__pane--enter',
    scssSource: 'src/styles/_animations.scss',
    replayable: true,
  },
  {
    id: 'dnd-deny',
    name: 'Drop denied shake',
    description: 'Applied briefly when a drop target rejects the drag.',
    category: 'dnd',
    kind: 'dnd-deny',
    className: 'tx-dnd-deny-active',
    scssSource: 'src/styles/_animations.scss',
    replayable: true,
  },
  {
    id: 'dnd-insert-line',
    name: 'Insert line',
    description: 'Insert indicator during tree reorder.',
    category: 'dnd',
    kind: 'dnd-insert-line',
    scssSource: 'src/styles/_animations.scss',
    replayable: true,
  },
];
