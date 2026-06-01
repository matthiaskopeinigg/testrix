import type {
  DesignSystemComponentEntry,
  DesignSystemNavGroup,
  DesignSystemNavSection,
  DesignSystemPatternEntry,
  DesignTokenEntry,
} from './design-system.types';

/** Canonical CSS custom properties — prefer these over hard-coded values in feature SCSS. */
export const DESIGN_SYSTEM_TOKENS: readonly DesignTokenEntry[] = [
  { name: 'Surface 0', cssVar: '--tx-surface-0', category: 'color', description: 'App background' },
  { name: 'Surface 1', cssVar: '--tx-surface-1', category: 'color', description: 'Cards, panels' },
  { name: 'Surface 2', cssVar: '--tx-surface-2', category: 'color', description: 'Elevated surfaces' },
  { name: 'Text 0', cssVar: '--tx-text-0', category: 'color', description: 'Primary text' },
  { name: 'Text 1', cssVar: '--tx-text-1', category: 'color', description: 'Secondary text' },
  { name: 'Border', cssVar: '--tx-border-0', category: 'color' },
  { name: 'Border strong', cssVar: '--tx-border-strong', category: 'color' },
  { name: 'Focus ring', cssVar: '--tx-focus-ring', category: 'color' },
  { name: 'Link', cssVar: '--tx-link', category: 'color' },
  { name: 'Primary', cssVar: '--tx-primary', category: 'color' },
  { name: 'Primary strong', cssVar: '--tx-primary-strong', category: 'color' },
  { name: 'Secondary', cssVar: '--tx-secondary', category: 'color', description: 'From palette secondary' },
  { name: 'Accent', cssVar: '--tx-accent', category: 'color', description: 'From palette accent' },
  { name: 'Scrim', cssVar: '--tx-scrim', category: 'color', description: 'Modal overlay' },
  { name: 'Danger', cssVar: '--tx-danger', category: 'color' },
  { name: 'Success', cssVar: '--tx-success', category: 'color' },
  { name: 'Warning', cssVar: '--tx-warning', category: 'color' },
  { name: 'Radius SM', cssVar: '--tx-radius-sm', category: 'radius', description: '8px — chips, small controls' },
  { name: 'Radius MD', cssVar: '--tx-radius-md', category: 'radius', description: '10px — cards, panels' },
  { name: 'Radius LG', cssVar: '--tx-radius-lg', category: 'radius', description: '14px — modals, dialogs' },
  { name: 'Control height MD', cssVar: '--tx-control-height-md', category: 'layout', description: '36px — buttons' },
  { name: 'Duration fast', cssVar: '--tx-duration-fast', category: 'motion', description: '120ms — micro transitions' },
  { name: 'Duration base', cssVar: '--tx-duration-base', category: 'motion', description: '180ms — entrances' },
  { name: 'Duration slow', cssVar: '--tx-duration-slow', category: 'motion', description: '280ms — larger surfaces' },
  { name: 'Ease out expo', cssVar: '--tx-ease-out-expo', category: 'motion', description: 'Entrance easing curve' },
  { name: 'Spring', cssVar: '--tx-spring', category: 'motion', description: 'Bouncy press / success pop' },
  { name: 'Stagger delay', cssVar: '--tx-stagger-delay', category: 'motion', description: 'Per-child delay in .tx-stagger' },
  {
    name: 'Heading font',
    cssVar: '--tx-font-heading',
    category: 'typography',
    description: 'Interface font from Appearance settings (titles)',
  },
  {
    name: 'Body font',
    cssVar: '--tx-font-body',
    category: 'typography',
    description: 'Interface font from Appearance settings (UI copy)',
  },
  {
    name: 'Mono font',
    cssVar: '--tx-font-mono',
    category: 'typography',
    description: 'Cascadia Code, Fira Code — code editor and monospace UI',
  },
];

export const DESIGN_SYSTEM_COMPONENTS: readonly DesignSystemComponentEntry[] = [
  {
    id: 'button',
    label: 'Button',
    selector: 'tx-button',
    importPath: '@app/shared/components/tx-button/tx-button.component',
    description: 'cta = hero action; add = + row; primary = save; secondary = default. Set [loading] for async actions.',
    supportsDebug: true,
    kind: 'component',
  },
  {
    id: 'icon',
    label: 'Icon',
    selector: 'tx-icon',
    importPath: '@app/shared/components/tx-icon/tx-icon.component',
    description: 'Stroke icons from assets/icons/*.svg via TxIconService.',
    supportsDebug: true,
    kind: 'component',
  },
  {
    id: 'form-field',
    label: 'Form field',
    selector: 'tx-form-field',
    importPath: '@app/shared/components/tx-form-field/tx-form-field.component',
    description: 'Label + projected control stacking for forms.',
    supportsDebug: true,
    kind: 'component',
  },
  {
    id: 'modal',
    label: 'Modal',
    selector: 'tx-modal',
    importPath: '@app/shared/components/tx-modal/tx-modal.component',
    description: 'Dialog chrome with ESC and optional backdrop dismissal.',
    supportsDebug: true,
    kind: 'component',
  },
  {
    id: 'help-popup',
    label: 'Help popup',
    selector: 'tx-help-popup',
    importPath: '@app/shared/components/tx-help-popup/tx-help-popup.component',
    description:
      'Settings-style overlay wiki with grouped sidebar nav, search, and section content from @shared/help.',
    supportsDebug: true,
    kind: 'component',
  },
  {
    id: 'command-palette',
    label: 'Command palette',
    selector: 'tx-command-palette',
    importPath: '@app/shared/components/tx-command-palette/tx-command-palette.component',
    description: 'Global Ctrl/Cmd+K quick-open overlay with fuzzy command search.',
    supportsDebug: true,
    kind: 'component',
  },
  {
    id: 'error-banner',
    label: 'Error banner',
    selector: 'tx-error-banner',
    importPath: '@app/shared/components/tx-error-banner/tx-error-banner.component',
    description: 'Surfaces ErrorNotificationService payloads in the shell.',
    supportsDebug: true,
    kind: 'component',
  },
  {
    id: 'banner',
    label: 'Banner',
    selector: 'tx-banner',
    importPath: '@app/shared/components/tx-banner/tx-banner.component',
    description: 'Inline status banner (info, success, warning, error) with optional dismiss and actions.',
    supportsDebug: true,
    kind: 'component',
  },
  {
    id: 'notification',
    label: 'Notification',
    selector: 'tx-notification',
    importPath: '@app/shared/components/tx-notification/tx-notification.component',
    description:
      'Transient toast surfaced by TxNotificationService via tx-notification-host (success, error, info, warning).',
    supportsDebug: true,
    kind: 'component',
  },
  {
    id: 'brand-logo',
    label: 'Brand logo',
    selector: 'tx-brand-logo',
    importPath: '@app/shared/components/tx-brand-logo/tx-brand-logo.component',
    description: 'Logo mark from brand/logo.svg (synced from assets/brand).',
    supportsDebug: true,
    kind: 'component',
  },
  {
    id: 'window-titlebar',
    label: 'Window titlebar',
    selector: 'app-tx-window-titlebar',
    importPath: '@app/shared/components/tx-window-titlebar/tx-window-titlebar.component',
    description: 'Seamless frameless chrome: drag region, settings, and window.testrix.windowControls.',
    supportsDebug: false,
    kind: 'component',
  },
  {
    id: 'input',
    label: 'Input',
    selector: 'tx-input',
    importPath: '@app/shared/components/tx-input/tx-input.component',
    description: 'Text input with token focus ring; supports ControlValueAccessor.',
    supportsDebug: true,
    kind: 'component',
  },
  {
    id: 'variable-input',
    label: 'Variable input',
    selector: 'tx-variable-input',
    importPath: '@app/shared/components/tx-variable-input/tx-variable-input.component',
    description:
      'Text input with `$` dynamic-variable autocomplete (catalog from @shared/dynamic-variables); ControlValueAccessor.',
    supportsDebug: true,
    kind: 'component',
  },
  {
    id: 'dropdown',
    label: 'Dropdown',
    selector: 'tx-dropdown',
    importPath: '@app/shared/components/tx-dropdown/tx-dropdown.component',
    description:
      'Single-select listbox combobox with keyboard navigation, themed panel, and ControlValueAccessor.',
    supportsDebug: true,
    kind: 'component',
  },
  {
    id: 'context-menu',
    label: 'Context menu',
    selector: 'tx-context-menu',
    importPath: '@app/shared/components/tx-context-menu/tx-context-menu.component',
    description:
      'Fixed-position action menu at cursor; keyboard navigation, click-outside and Escape dismiss.',
    supportsDebug: false,
    kind: 'component',
  },
  {
    id: 'tag',
    label: 'Tag',
    selector: 'tx-tag',
    importPath: '@app/shared/components/tx-tag/tx-tag.component',
    description: 'Status pill with default, success, warning, error, and info variants.',
    supportsDebug: true,
    kind: 'component',
  },
  {
    id: 'spinner',
    label: 'Spinner',
    selector: 'tx-spinner',
    importPath: '@app/shared/components/tx-spinner/tx-spinner.component',
    description: 'Indeterminate loader using --tx-primary.',
    supportsDebug: true,
    kind: 'component',
  },
  {
    id: 'toggle',
    label: 'Toggle',
    selector: 'tx-toggle',
    importPath: '@app/shared/components/tx-toggle/tx-toggle.component',
    description: 'Switch control with spring thumb; supports ControlValueAccessor.',
    supportsDebug: true,
    kind: 'component',
  },
  {
    id: 'textarea',
    label: 'Textarea',
    selector: 'tx-textarea',
    importPath: '@app/shared/components/tx-textarea/tx-textarea.component',
    description: 'Multi-line text field with token focus ring; optional monospace.',
    supportsDebug: true,
    kind: 'component',
  },
  {
    id: 'code-editor',
    label: 'Code editor',
    selector: 'tx-code-editor',
    importPath: '@app/shared/components/tx-code-editor/tx-code-editor.component',
    description:
      'Overlay syntax editor for JSON, XML, GraphQL, HTML, JS, TS, CSS, and SCSS — format toolbar, line numbers, Ctrl+Space JSON snippets.',
    supportsDebug: true,
    kind: 'component',
  },
  {
    id: 'slider',
    label: 'Slider',
    selector: 'tx-slider',
    importPath: '@app/shared/components/tx-slider/tx-slider.component',
    description: 'Range input with filled track and value label.',
    supportsDebug: true,
    kind: 'component',
  },
  {
    id: 'divider',
    label: 'Divider',
    selector: 'tx-divider',
    importPath: '@app/shared/components/tx-divider/tx-divider.component',
    description: 'Horizontal rule using --tx-border-0 (also .tx-divider utility).',
    supportsDebug: false,
    kind: 'component',
  },
  {
    id: 'tab',
    label: 'Tab',
    selector: 'tx-tab',
    importPath: '@app/shared/components/tx-tab/tx-tab.component',
    description: 'Editor tab chip with optional HTTP method badge, pin, and close actions.',
    supportsDebug: false,
    kind: 'component',
  },
  {
    id: 'tab-bar',
    label: 'Tab bar',
    selector: 'tx-tab-bar',
    importPath: '@app/shared/components/tx-tab-bar/tx-tab-bar.component',
    description: 'Horizontal scrollable tab strip with drag reorder and cross-pane drop.',
    supportsDebug: false,
    kind: 'component',
  },
  {
    id: 'split-pane',
    label: 'Split pane',
    selector: 'tx-split-pane',
    importPath: '@app/shared/components/tx-split-pane/tx-split-pane.component',
    description: 'Recursive horizontal/vertical split layout with draggable dividers.',
    supportsDebug: false,
    kind: 'component',
  },
  {
    id: 'tree',
    label: 'Tree',
    selector: 'tx-tree',
    importPath: '@app/shared/components/tx-tree/tx-tree.component',
    description:
      'Hierarchical list with expand/collapse, selection, and pointer drag-and-drop (configurable drag/drop policies).',
    supportsDebug: true,
    kind: 'component',
  },
  {
    id: 'tooltip',
    label: 'Tooltip',
    selector: 'tx-tooltip',
    importPath: '@app/shared/components/tx-tooltip/tx-tooltip.component',
    description:
      'Styled hover/focus labels. Prefer `[txTooltip]` on controls over native `title` (use `tx-tooltip` wrapper when needed).',
    supportsDebug: false,
    kind: 'component',
  },
  {
    id: 'sidebar',
    label: 'Sidebar',
    selector: 'tx-sidebar',
    importPath: '@app/shared/components/tx-sidebar/tx-sidebar.component',
    description:
      'Activity rail plus contextual panel (title, close, toolbar + body projection). Resizable panel.',
    supportsDebug: true,
    kind: 'component',
  },
  {
    id: 'theme-layout-preview',
    label: 'Theme layout preview',
    selector: 'tx-theme-layout-preview',
    importPath: '@app/shared/components/tx-theme-layout-preview/tx-theme-layout-preview.component',
    description: 'Miniature workbench chrome painted from a ThemePalette (not live theme vars).',
    supportsDebug: false,
    kind: 'utility',
  },
  {
    id: 'response-viewer',
    label: 'Response viewer',
    selector: 'tx-response-viewer',
    importPath: '@app/shared/components/tx-response-viewer/tx-response-viewer.component',
    description:
      'Postman-style response shell: status chips, run timeline, Pretty/Raw/Headers/Diff/Timeline tabs, copy/save actions.',
    supportsDebug: true,
    kind: 'component',
  },
  {
    id: 'response-tab-bar',
    label: 'Response tab bar',
    selector: 'tx-response-tab-bar',
    importPath: '@app/shared/components/tx-response-tab-bar/tx-response-tab-bar.component',
    description: 'Secondary tab row for response panels (not workspace tx-tab-bar).',
    supportsDebug: false,
    kind: 'component',
  },
  {
    id: 'response-status-strip',
    label: 'Response status strip',
    selector: 'tx-response-status-strip',
    importPath: '@app/shared/components/tx-response-status-strip/tx-response-status-strip.component',
    description: 'Status code tag, timing/size chips, optional timeline and action slots.',
    supportsDebug: true,
    kind: 'component',
  },
  {
    id: 'vertical-split-pane',
    label: 'Vertical split pane',
    selector: 'tx-vertical-split-pane',
    importPath: '@app/shared/components/tx-vertical-split-pane/tx-vertical-split-pane.component',
    description: 'Primary/secondary column split with drag resize and hide control.',
    supportsDebug: false,
    kind: 'component',
  },
  {
    id: 'diff-view',
    label: 'Diff view',
    selector: 'tx-diff-view',
    importPath: '@app/shared/components/tx-diff-view/tx-diff-view.component',
    description: 'Response diff summary with header and body hunks.',
    supportsDebug: true,
    kind: 'component',
  },
  {
    id: 'run-timeline',
    label: 'Run timeline',
    selector: 'tx-run-timeline',
    importPath: '@app/shared/components/tx-run-timeline/tx-run-timeline.component',
    description: 'Chips for recent HTTP runs; Shift+click compares two runs.',
    supportsDebug: true,
    kind: 'component',
  },
  {
    id: 'autofocus',
    label: 'Autofocus',
    selector: '[txAutofocus]',
    importPath: '@app/shared/directives/tx-autofocus.directive',
    description: 'Focuses the host on init and when the document becomes visible.',
    supportsDebug: false,
    kind: 'utility',
  },
  {
    id: 'truncate',
    label: 'Truncate pipe',
    selector: 'truncate',
    importPath: '@app/shared/pipes/truncate.pipe',
    description: 'Display-only string truncation with ellipsis.',
    supportsDebug: false,
    kind: 'utility',
  },
];

export const DESIGN_SYSTEM_PATTERNS: readonly DesignSystemPatternEntry[] = [
  {
    id: 'token-usage',
    label: 'Token usage',
    description: 'Use --tx-* and color-mix(in srgb, var(--tx-*) …); no raw hex in features.',
    scssPartial: 'src/styles/_tokens.scss',
    relatedComponentIds: [],
  },
  {
    id: 'forms',
    label: 'Forms & validation',
    description: 'tx-form-field wraps native controls; hints/errors stack below.',
    relatedComponentIds: ['form-field', 'input', 'textarea', 'toggle', 'slider'],
  },
  {
    id: 'motion',
    label: 'Motion & animation',
    description: 'Use .tx-animate-* utilities and --tx-duration-* tokens; respect prefers-reduced-motion.',
    scssPartial: 'src/styles/_animations.scss',
    relatedComponentIds: [],
  },
  {
    id: 'dialogs',
    label: 'Dialogs',
    description: 'tx-modal with projected body; ESC and backdrop close.',
    scssPartial: 'src/app/shared/components/tx-modal/tx-modal.component.scss',
    relatedComponentIds: ['modal', 'button'],
  },
  {
    id: 'shell-layout',
    label: 'Shell layout',
    description: 'tx-shell: titlebar, ribbon, tx-error-banner, router-outlet.',
    relatedComponentIds: ['window-titlebar', 'error-banner'],
  },
  {
    id: 'frameless-chrome',
    label: 'Frameless chrome',
    description: 'tx-window-titlebar + window.testrix.windowControls IPC.',
    relatedComponentIds: ['window-titlebar', 'icon'],
  },
  {
    id: 'errors',
    label: 'Errors',
    description: 'Renderer banner vs Electron error.html — complementary surfaces.',
    relatedComponentIds: ['error-banner', 'banner'],
  },
  {
    id: 'cross-runtime',
    label: 'Cross-runtime',
    description: 'shared/config Zod schemas; renderer uses window.testrix only.',
    relatedComponentIds: [],
  },
];

export const DESIGN_SYSTEM_NAV: readonly DesignSystemNavGroup[] = [
  {
    pillar: 'style-guide',
    label: 'Style Guide',
    sections: [
      { id: 'sg-typography', label: 'Typography', description: 'Type scale and font stack' },
      { id: 'sg-colors', label: 'Color & tokens', description: 'Semantic --tx-* palette' },
      { id: 'sg-spacing', label: 'Spacing & layout', description: 'Radii and control metrics' },
      { id: 'sg-animations', label: 'Animations', description: 'Motion tokens and utility classes' },
      { id: 'sg-themes', label: 'Themes', description: 'Catalog palettes (default GitHub Light)' },
      { id: 'sg-icons', label: 'Icons', description: 'SVG catalog under assets/icons' },
      { id: 'sg-foundations', label: 'Foundations', description: 'Global styles and token layering' },
      { id: 'sg-developer', label: 'Developer', description: 'Electron bridge and config path' },
    ],
  },
  {
    pillar: 'brand',
    label: 'Brand Guidelines',
    sections: [
      { id: 'brand-identity', label: 'Product identity', description: 'Name and positioning' },
      { id: 'brand-logo', label: 'Logo & assets', description: 'Logo paths and sync' },
      { id: 'brand-voice', label: 'Voice & naming', description: 'Labels and tone' },
    ],
  },
  {
    pillar: 'components',
    label: 'Component Library',
    sections: DESIGN_SYSTEM_COMPONENTS.map((c) => ({
      id: `comp-${c.id}`,
      label: c.label,
      description: c.description,
    })),
  },
  {
    pillar: 'patterns',
    label: 'Pattern Library',
    sections: DESIGN_SYSTEM_PATTERNS.map((p) => ({
      id: `pat-${p.id}`,
      label: p.label,
      description: p.description,
    })),
  },
  {
    pillar: 'ui-kit',
    label: 'UI Kit',
    sections: [
      { id: 'kit-shell', label: 'Shell chrome', description: 'Titlebar + ribbon + outlet' },
      { id: 'kit-home', label: 'Home / empty state', description: 'Placeholder content' },
      { id: 'kit-dialog', label: 'Dialog flow', description: 'Modal + actions' },
      { id: 'kit-error', label: 'Error state', description: 'Banner + status colors' },
    ],
  },
];

/** Locates a nav section by id across all pillars. */
export function findDesignSystemSection(
  sectionId: string,
): { readonly group: DesignSystemNavGroup; readonly section: DesignSystemNavSection } | undefined {
  for (const group of DESIGN_SYSTEM_NAV) {
    const section = group.sections.find((s) => s.id === sectionId);
    if (section) {
      return { group, section };
    }
  }
  return undefined;
}

export function findComponentEntry(id: string): DesignSystemComponentEntry | undefined {
  return DESIGN_SYSTEM_COMPONENTS.find((c) => c.id === id);
}

export function findPatternEntry(id: string): DesignSystemPatternEntry | undefined {
  return DESIGN_SYSTEM_PATTERNS.find((p) => p.id === id);
}

export function parseComponentSectionId(sectionId: string): string | null {
  if (!sectionId.startsWith('comp-')) return null;
  return sectionId.slice('comp-'.length);
}

export function parsePatternSectionId(sectionId: string): string | null {
  if (!sectionId.startsWith('pat-')) return null;
  return sectionId.slice('pat-'.length);
}
