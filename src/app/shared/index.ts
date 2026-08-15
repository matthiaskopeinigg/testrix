/** Shared UI surface used by shells and dialogs. */


export * from './components/chrome/tx-brand-logo/tx-brand-logo.component';


export * from './components/feedback/tx-error-banner/tx-error-banner.component';

export * from './components/feedback/tx-banner/tx-banner.component';

export * from './components/feedback/tx-update-banner/tx-update-banner.component';
export * from './components/overlays/tx-update-install-overlay/tx-update-install-overlay.component';
export * from './components/overlays/tx-profile-switch-overlay/tx-profile-switch-overlay.component';
export * from './components/overlays/tx-layout-onboarding-overlay/tx-layout-onboarding-overlay.component';

export * from './components/feedback/tx-notification/tx-notification.component';
export type { TxNotificationPayload, TxNotificationTone } from './components/feedback/tx-notification/tx-notification.types';
export * from './components/feedback/tx-notification-host/tx-notification-host.component';

export * from './components/forms/tx-button/tx-button.component';

export * from './components/overlays/tx-modal/tx-modal.component';
export * from './components/overlays/tx-confirm-dialog/tx-confirm-dialog.component';
export * from './components/overlays/tx-prompt-dialog/tx-prompt-dialog.component';

export * from './components/forms/tx-form-field/tx-form-field.component';

export * from './components/forms/tx-icon/tx-icon.component';

export * from './components/chrome/tx-theme-layout-preview/tx-theme-layout-preview.component';

export * from './components/forms/tx-input/tx-input.component';

export * from './components/forms/tx-suggest-input/tx-suggest-input.component';
export {
  positionFixedCompletionPopup,
  scheduleFixedCompletionPosition,
  TX_COMPLETION_PLACEMENT_DEFAULT,
  type TxCompletionPlacement,
} from './components/forms/tx-completion-popup/tx-completion-popup-placement';

export * from './components/forms/tx-inline-rename-input/tx-inline-rename-input.component';

export * from './components/editors/tx-variable-input/tx-variable-input.component';

export * from './components/data/tx-key-value-list/tx-key-value-list.component';
export type { TxKeyValueRow } from './components/data/tx-key-value-list/tx-key-value-list.types';
export type {
  TxKeyValueListKeyInput,
  TxKeyValueListValueInput,
} from './components/data/tx-key-value-list/tx-key-value-list.component';

export * from './components/data/tx-key-value-description-list/tx-key-value-description-list.component';
export type { TxKeyValueDescriptionRow } from './components/data/tx-key-value-description-list/tx-key-value-description-list.types';
export type {
  TxKeyValueDescriptionListKeyInput,
  TxKeyValueDescriptionListValueInput,
} from './components/data/tx-key-value-description-list/tx-key-value-description-list.component';

export * from './components/forms/tx-dropdown/tx-dropdown.component';
export type { TxDropdownOption, TxDropdownPlacement } from './components/forms/tx-dropdown/tx-dropdown.types';

export * from './components/overlays/tx-context-menu/tx-context-menu.component';
export type { TxContextMenuItem, TxContextMenuPosition } from './components/overlays/tx-context-menu/tx-context-menu.types';

export * from './components/forms/tx-tag/tx-tag.component';
export * from './components/forms/tx-tags-input/tx-tags-input.component';

export * from './components/feedback/tx-spinner/tx-spinner.component';

export * from './components/chrome/tx-workspace-tab-skeleton/tx-workspace-tab-skeleton.component';
export type { TxWorkspaceTabSkeletonVariant } from './components/chrome/tx-workspace-tab-skeleton/tx-workspace-tab-skeleton.component';

export * from './components/forms/tx-toggle/tx-toggle.component';

export * from './components/forms/tx-textarea/tx-textarea.component';

export * from './components/editors/tx-code-editor/tx-code-editor.component';
export {
  TX_CODE_EDITOR_LANGUAGES,
  txCodeEditorLanguageLabel,
  txCodeEditorSupportsAutoFormat,
  type TxCodeEditorLanguage,
} from './components/editors/tx-code-editor/tx-code-editor-language';
export * from './components/editors/tx-code-editor/tx-code-editor-samples';

export * from './components/forms/tx-slider/tx-slider.component';

export * from './components/forms/tx-divider/tx-divider.component';

export * from './components/data/tx-data-grid/tx-data-grid.component';
export {
  TX_DATA_GRID_DEMO_COLUMNS,
  TX_DATA_GRID_DEMO_ROWS,
} from './components/data/tx-data-grid/tx-data-grid.types';
export type {
  TxDataGridCell,
  TxDataGridCopyEvent,
  TxDataGridExportEvent,
  TxDataGridExportScope,
} from './components/data/tx-data-grid/tx-data-grid.types';

export * from './components/data/tx-tree/tx-tree.component';
export * from './components/data/tx-tree/tx-tree-node-template.directive';
export { mergeTxTreeConfig, type TxTreeConfigPartial } from './components/data/tx-tree/tx-tree.config';
export { TX_TREE_DEMO_NODES } from './components/data/tx-tree/tx-tree.sample';
export type {
  TxTreeConfig,
  TxTreeDragContext,
  TxTreeDragScope,
  TxTreeDropContext,
  TxTreeDropPosition,
  TxTreeNode,
  TxTreeNodeDropEvent,
  TxTreeNodeTemplateContext,
  TxTreeNodeClickEvent,
  TxTreeNodeRenameCommitEvent,
  TxTreeSelectionMode,
  TxTreeSiblingSort,
  TxTreeVisibleRow,
} from './components/data/tx-tree/tx-tree.types';
export { TX_TREE_DEFAULT_CONFIG } from './components/data/tx-tree/tx-tree.types';

export * from './components/overlays/tx-tooltip/tx-tooltip.component';
export * from './components/overlays/tx-tooltip/tx-tooltip.directive';
export type { TxTooltipPosition } from './components/overlays/tx-tooltip/tx-tooltip.types';

export * from './components/chrome/tx-tab/tx-tab.component';
export type { TxTabBarItem } from './components/chrome/tx-tab/tx-tab.types';

export * from './components/chrome/tx-tab-bar/tx-tab-bar.component';
export type {
  TxTabBarCrossDropEvent,
  TxTabBarDropEvent,
} from './components/chrome/tx-tab-bar/tx-tab-bar.component';

export * from './components/chrome/tx-split-pane/tx-split-pane.component';
export type { TxSplitPaneLeafContext } from './components/chrome/tx-split-pane/tx-split-pane.component';

export * from './components/chrome/tx-vertical-split-pane/tx-vertical-split-pane.component';
export * from './components/chrome/tx-horizontal-split-pane/tx-horizontal-split-pane.component';

export * from './components/editors/tx-response-status-strip/tx-response-status-strip.component';

export * from './components/editors/tx-response-tab-bar/tx-response-tab-bar.component';
export type { TxResponseTabItem } from './components/editors/tx-response-tab-bar/tx-response-tab-bar.component';

export * from './components/editors/tx-response-headers-list/tx-response-headers-list.component';

export * from './components/editors/tx-response-timing-panel/tx-response-timing-panel.component';

export * from './components/editors/tx-response-viewer/tx-response-viewer.component';

export * from './components/data/tx-cookie-manager/tx-cookie-manager.component';

export * from './components/overlays/tx-profile-manager-modal/tx-profile-manager-modal.component';

export * from './components/editors/tx-run-timeline/tx-run-timeline.component';

export * from './components/editors/tx-diff-view/tx-diff-view.component';

export * from './components/data/tx-author-avatar/tx-author-avatar.component';
export * from './components/data/tx-team-author-card/tx-team-author-card.component';

export * from './components/chrome/tx-sidebar/tx-sidebar.component';
export * from './components/chrome/tx-sidebar/tx-sidebar-panel-content.directive';
export type { TxSidebarItem } from './components/chrome/tx-sidebar/tx-sidebar.types';
export {
  TX_SIDEBAR_COLLAPSED_WIDTH_PX,
  TX_SIDEBAR_DEFAULT_WIDTH_PX,
  TX_SIDEBAR_MAX_WIDTH_PX,
  TX_SIDEBAR_MIN_WIDTH_PX,
  TX_SIDEBAR_PANEL_DEFAULT_WIDTH_PX,
  TX_SIDEBAR_PANEL_MAX_WIDTH_PX,
  TX_SIDEBAR_PANEL_MIN_WIDTH_PX,
  TX_SIDEBAR_RAIL_WIDTH_PX,
} from './components/chrome/tx-sidebar/tx-sidebar.types';

export * from './components/overlays/tx-settings-popup/tx-settings-popup.component';

export * from './components/overlays/tx-help-popup/tx-help-popup.component';

export * from './components/overlays/tx-command-palette/tx-command-palette.component';

export * from './components/chrome/tx-window-titlebar/tx-window-titlebar.component';

export * from './icons';


export * from './directives/tx-autofocus.directive';


export * from './pipes/truncate.pipe';
